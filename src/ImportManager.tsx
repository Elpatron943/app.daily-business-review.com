import { useMemo, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import { soldLineDirectionIds } from "./data";
import { useDomain } from "./domain/DomainContext";
import { useOpportunities } from "./opportunities/OpportunityContext";
import { useSales } from "./sales/SalesContext";
import {
  buildImportPlan,
  defaultMappingChecks,
  IMPORT_MODE_LABEL,
  planHasBlockingErrors,
  resolveAccountId,
  type ImportMode,
  type ImportPlan,
} from "./import/bulkImport";
import {
  downloadExcelExport,
  downloadExcelTemplate,
  parseImportWorkbookRaw,
  type ExcelImportTables,
  type ExcelTemplateRefs,
  type RawImportSheet,
} from "./import/excel";
import {
  applyColumnMapping,
  DBR_IMPORT_FIELDS,
  IMPORT_ENTITY_LABEL,
  mappingCoversRequired,
  suggestMappingFromAliases,
  type ColumnMapping,
  type ImportEntityKind,
} from "./import/mappingFields";
import { suggestImportColumnMapping } from "./import/suggestColumnMapping";
import { checkOpenAiStatus } from "./research/openaiClient";
import { useToast } from "./ui/Toast";

type WorkbookState = {
  name: string;
  sheets: RawImportSheet[];
  mappings: Record<string, ColumnMapping>;
};

/** Étapes guidées : mode → mapping validé → preview. */
type ImportStep = "upload" | "mode" | "mapping" | "preview";

function sheetKey(sheet: RawImportSheet, index: number) {
  return `${sheet.kind}:${sheet.sheetName}:${index}`;
}

export default function ImportManager() {
  const { notify } = useToast();
  const { accounts, contacts, importDomainBatch } = useDomain();
  const { opportunities, importOpportunitiesBatch } = useOpportunities();
  const { soldSolutions, importSoldSolutionsBatch } = useSales();
  const {
    config,
    activeDirections,
    activeSolutions,
    activeCommercialStatuses,
    activeAccountSizes,
    activeOppPhases,
    activeOppKinds,
    statusLabel,
    kindLabel,
  } = useOrgConfig();

  const [step, setStep] = useState<ImportStep>("upload");
  const [workbook, setWorkbook] = useState<WorkbookState | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [mappingValidated, setMappingValidated] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("upsert");

  const ctx = useMemo(
    () => ({
      accounts,
      contacts,
      opportunities,
      soldSolutions,
      directions: activeDirections,
      sectors: config.sectors ?? [],
      solutions: activeSolutions,
      oppMappingSubtypes: config.oppMappingSubtypes ?? [],
    }),
    [
      accounts,
      contacts,
      opportunities,
      soldSolutions,
      activeDirections,
      config.sectors,
      activeSolutions,
      config.oppMappingSubtypes,
    ],
  );

  const refs: ExcelTemplateRefs = useMemo(() => {
    const sectors = (config.sectors ?? [])
      .filter((s) => s.active !== false)
      .map((s) => s.name);
    const solutions = activeSolutions.map((s) => s.code || s.name);
    const modules = activeSolutions.flatMap((s) =>
      (s.modules ?? [])
        .filter((m) => m.active !== false)
        .map((m) => `${s.code || s.name} > ${m.label}`),
    );
    return {
      directions: activeDirections.map((d) => d.name),
      sectors,
      solutions,
      modules,
      sizes: activeAccountSizes.map((s) => s.id),
      statuses: activeCommercialStatuses.map((s) => statusLabel(s.id)),
      types: ["Holding", "Groupe", "Entreprise"],
      phases: activeOppPhases.map((p) => p.id),
      kinds: activeOppKinds.map((k) => kindLabel(k.id)),
    };
  }, [
    activeDirections,
    activeSolutions,
    config.sectors,
    activeAccountSizes,
    activeCommercialStatuses,
    activeOppPhases,
    activeOppKinds,
    statusLabel,
    kindLabel,
  ]);

  function buildMappedTables(wb: WorkbookState): ExcelImportTables {
    const out: ExcelImportTables = {};
    wb.sheets.forEach((sheet, index) => {
      const key = sheetKey(sheet, index);
      const mapping = wb.mappings[key] ?? {};
      const table = applyColumnMapping(sheet.headers, sheet.rows, mapping);
      if (table.rows.length === 0) return;
      const prev = out[sheet.kind];
      if (!prev) {
        out[sheet.kind] = table;
        return;
      }
      out[sheet.kind] = {
        headers: [...new Set([...prev.headers, ...table.headers])],
        rows: [...prev.rows, ...table.rows],
      };
    });
    return out;
  }

  function collectMissingRequired(wb: WorkbookState): string[] {
    const missing: string[] = [];
    wb.sheets.forEach((sheet, index) => {
      const key = sheetKey(sheet, index);
      const gaps = mappingCoversRequired(
        sheet.kind,
        wb.mappings[key] ?? {},
      );
      if (gaps.length) {
        missing.push(
          `${IMPORT_ENTITY_LABEL[sheet.kind]} : ${gaps.join(", ")}`,
        );
      }
    });
    return missing;
  }

  function invalidateMapping() {
    setMappingValidated(false);
    setPlan(null);
    if (step === "preview") setStep("mapping");
  }

  async function onPickFile(file: File | null) {
    setResult(null);
    setPlan(null);
    setFileError(null);
    setMappingValidated(false);
    if (!file) {
      setWorkbook(null);
      setStep("upload");
      return;
    }
    try {
      const sheets = await parseImportWorkbookRaw(file);
      const totalRows = sheets.reduce((s, sh) => s + sh.rows.length, 0);
      if (totalRows === 0) {
        setFileError(
          "Aucune donnée trouvée. Utilisez le template (onglets Entreprises, Contacts, Opportunites).",
        );
        setWorkbook(null);
        setStep("upload");
        return;
      }
      const mappings: Record<string, ColumnMapping> = {};
      sheets.forEach((sheet, index) => {
        mappings[sheetKey(sheet, index)] = suggestMappingFromAliases(
          sheet.headers,
          sheet.kind,
        );
      });
      setWorkbook({ name: file.name, sheets, mappings });
      setActiveSheetIdx(0);
      setImportMode("upsert");
      setStep("mode");
      notify({
        tone: "info",
        title: "Type d’import",
        message:
          "Choisissez ajout, mise à jour, ou les deux — Cle ou nom d’entreprise comme référence.",
      });
    } catch {
      setFileError("Impossible de lire ce fichier Excel.");
      setWorkbook(null);
      setStep("upload");
      notify({
        tone: "error",
        title: "Import Excel",
        message: "Impossible de lire ce fichier.",
      });
    }
  }

  function setMappingField(
    sheetIndex: number,
    header: string,
    fieldId: string,
  ) {
    setWorkbook((prev) => {
      if (!prev) return prev;
      const sheet = prev.sheets[sheetIndex];
      if (!sheet) return prev;
      const key = sheetKey(sheet, sheetIndex);
      const nextMap = { ...(prev.mappings[key] ?? {}), [header]: fieldId };
      if (fieldId) {
        for (const [h, f] of Object.entries(nextMap)) {
          if (h !== header && f === fieldId) nextMap[h] = "";
        }
      }
      return {
        ...prev,
        mappings: { ...prev.mappings, [key]: nextMap },
      };
    });
    invalidateMapping();
  }

  async function runAiSuggest() {
    if (!workbook || step !== "mapping") return;
    setAiBusy(true);
    try {
      const status = await checkOpenAiStatus();
      if (!status.available || !status.configured) {
        notify({
          tone: "error",
          title: "Suggestion IA indisponible",
          message:
            "Configurez OPENAI_API_KEY et lancez le serveur de dev (proxy OpenAI).",
        });
        return;
      }
      const nextMappings = { ...workbook.mappings };
      for (let i = 0; i < workbook.sheets.length; i++) {
        const sheet = workbook.sheets[i];
        const key = sheetKey(sheet, i);
        nextMappings[key] = await suggestImportColumnMapping({
          kind: sheet.kind,
          headers: sheet.headers,
          samples: sheet.samples,
        });
      }
      setWorkbook({ ...workbook, mappings: nextMappings });
      setMappingValidated(false);
      setPlan(null);
      notify({
        tone: "ok",
        title: "Proposition IA prête",
        message:
          "Relisez chaque colonne, ajustez si besoin, puis validez le mapping.",
      });
    } catch (err) {
      notify({
        tone: "error",
        title: "Échec suggestion IA",
        message: err instanceof Error ? err.message : "Erreur inconnue",
      });
    } finally {
      setAiBusy(false);
    }
  }

  /** L’utilisateur confirme explicitement le mapping avant preview. */
  function validateMapping() {
    if (!workbook) return;
    const missing = collectMissingRequired(workbook);
    if (missing.length) {
      notify({
        tone: "error",
        title: "Mapping incomplet",
        message: missing.join(" · "),
      });
      return;
    }
    setMappingValidated(true);
    setResult(null);
    const nextPlan = buildImportPlan(buildMappedTables(workbook), ctx, importMode);
    setPlan(nextPlan);
    setStep("preview");
    notify({
      tone: "ok",
      title: "Mapping validé",
      message: "Contrôlez la prévisualisation puis lancez l’import.",
    });
  }

  function confirmImportMode() {
    if (!workbook) return;
    setStep("mapping");
    notify({
      tone: "info",
      title: "Étape mapping",
      message:
        "Mappez la colonne Cle et les champs DBR, puis validez le mapping.",
    });
  }

  function backToMapping() {
    setStep("mapping");
    setMappingValidated(false);
    setPlan(null);
  }

  function runImport() {
    if (!mappingValidated || !plan || planHasBlockingErrors(plan)) return;
    setBusy(true);
    try {
      const domainStats = importDomainBatch({
        accounts: plan.accounts,
        contacts: plan.contacts.map((c) => ({
          ...c,
          externalKey: c.externalKey,
        })),
      });

      const keyMap = { ...plan.keyToAccountId, ...domainStats.keyToAccountId };

      const oppRows = plan.opportunities
        .map((o) => {
          const accountId =
            resolveAccountId(o.accountId, keyMap) ??
            (o.accountKey &&
            keyMap[o.accountKey] &&
            !keyMap[o.accountKey].startsWith("__")
              ? keyMap[o.accountKey]
              : null);
          if (!accountId) return null;
          return {
            action: o.action,
            id: o.id,
            externalKey: o.externalKey,
            name: o.name,
            accountId,
            amount: o.amount,
            closeDate: o.closeDate,
            phase: o.phase,
            kind: o.kind,
            solutionId: o.solutionId,
            mappingChecks: defaultMappingChecks(ctx.oppMappingSubtypes),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const oppStats = importOpportunitiesBatch(oppRows);

      const soldRows = plan.soldSolutions
        .map((s) => {
          const accountId =
            resolveAccountId(s.accountId, keyMap) ??
            (s.accountKey &&
            keyMap[s.accountKey] &&
            !keyMap[s.accountKey].startsWith("__")
              ? keyMap[s.accountKey]
              : null);
          if (!accountId) return null;
          return {
            action: s.action,
            id: s.id,
            externalKey: s.externalKey,
            accountId,
            solutionId: s.solutionId,
            moduleIds: s.moduleIds,
            directionIds: s.directionIds,
            billedAmount: s.billedAmount,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const soldStats = importSoldSolutionsBatch(soldRows);

      const summary = [
        `Comptes : ${domainStats.createdAccounts} créés, ${domainStats.updatedAccounts} maj`,
        `Contacts : ${domainStats.createdContacts} créés, ${domainStats.updatedContacts} maj`,
        `Opportunités : ${oppStats.created} créées, ${oppStats.updated} maj`,
        `Solutions vendues : ${soldStats.created} créées, ${soldStats.updated} maj`,
      ].join(" · ");

      setResult(summary);
      setPlan(null);
      setWorkbook(null);
      setMappingValidated(false);
      setStep("upload");
      notify({
        tone: "ok",
        title: "Import terminé",
        message: summary,
        durationMs: 9000,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erreur pendant l’import.";
      setResult(null);
      notify({
        tone: "error",
        title: "Échec de l’import",
        message,
        durationMs: 10000,
      });
    } finally {
      setBusy(false);
    }
  }

  function exportCurrent() {
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const directionById = new Map(
      activeDirections.map((d) => [d.id, d.name]),
    );
    const sectorById = new Map(
      (config.sectors ?? []).map((s) => [s.id, s.name]),
    );
    const solutionById = new Map(
      activeSolutions.map((s) => [s.id, s.code || s.name]),
    );

    const accountRows = accounts
      .filter((a) => a.active !== false)
      .map((a) => {
        const holding = a.holdingId
          ? accountById.get(a.holdingId)
          : undefined;
        return [
          a.id,
          a.name,
          a.type === "Holding" ? "Holding" : "Entreprise",
          statusLabel(a.commercialStatus) ?? a.commercialStatus,
          holding?.id ?? "",
          a.sector ? (sectorById.get(a.sector) ?? a.sector) : "",
          a.size ?? "",
        ];
      });

    const contactRows = contacts
      .filter((c) => c.active !== false)
      .map((c) => [
        c.id,
        c.name,
        c.title,
        c.accountId,
        directionById.get(c.directionId) ?? c.directionId,
      ]);

    const oppRows = opportunities
      .filter((o) => o.active !== false)
      .map((o) => [
        o.id,
        o.name,
        o.primaryAccountId,
        o.amount,
        o.closeDate,
        o.phase,
        kindLabel(o.kind) ?? o.kind,
        o.solutionId
          ? (solutionById.get(o.solutionId) ?? o.solutionId)
          : "",
      ]);

    const moduleLabel = (solutionId: string, moduleId: string) => {
      const sol = activeSolutions.find((s) => s.id === solutionId);
      const mod = sol?.modules?.find((m) => m.id === moduleId);
      return mod?.label ?? moduleId;
    };

    const soldRows = soldSolutions.map((s) => [
      s.id,
      s.accountId,
      solutionById.get(s.solutionId) ?? s.solutionId,
      (s.moduleIds ?? []).map((m) => moduleLabel(s.solutionId, m)).join("; "),
      soldLineDirectionIds(s)
        .map((d) => directionById.get(d) ?? d)
        .join("; "),
      s.billedAmount,
    ]);

    downloadExcelExport({
      accounts: accountRows,
      contacts: contactRows,
      opportunities: oppRows,
      soldSolutions: soldRows,
      refs,
    });
  }

  const errorCount = plan?.issues.filter((i) => i.level === "error").length ?? 0;
  const warnCount =
    plan?.issues.filter((i) => i.level === "warning").length ?? 0;

  const activeSheet = workbook?.sheets[activeSheetIdx] ?? null;
  const activeMapping =
    workbook && activeSheet
      ? workbook.mappings[sheetKey(activeSheet, activeSheetIdx)] ?? {}
      : {};

  const fileSummary = workbook
    ? workbook.sheets
        .map(
          (s) =>
            `${s.rows.length} ${IMPORT_ENTITY_LABEL[s.kind].toLowerCase()}`,
        )
        .join(" · ")
    : null;

  const steps: { id: ImportStep; label: string }[] = [
    { id: "upload", label: "1. Fichier" },
    { id: "mode", label: "2. Type" },
    { id: "mapping", label: "3. Mapping" },
    { id: "preview", label: "4. Import" },
  ];

  return (
    <div className="import-manager">
      <header className="catalogue-head">
        <div>
          <h3>Import / export Excel</h3>
          <p className="muted">
            Clé de référence : colonne <code>Cle</code>, ou à défaut le{" "}
            <strong>nom d’entreprise</strong> (suffit si vous n’avez que ça).
            Modes : ajout, mise à jour, ou les deux.
          </p>
        </div>
      </header>

      <nav className="import-steps" aria-label="Étapes d’import">
        {steps.map((s) => {
          const done =
            (s.id === "upload" && workbook) ||
            (s.id === "mode" && (step === "mapping" || step === "preview")) ||
            (s.id === "mapping" && mappingValidated) ||
            (s.id === "preview" && Boolean(result));
          return (
            <span
              key={s.id}
              className={`import-step${step === s.id ? " is-current" : ""}${
                done ? " is-done" : ""
              }`}
            >
              {s.label}
            </span>
          );
        })}
      </nav>

      <div className="import-templates">
        <button
          type="button"
          className="primary-cta"
          onClick={() => downloadExcelTemplate(refs)}
        >
          Télécharger le template Excel
        </button>
        <button type="button" className="ghost" onClick={exportCurrent}>
          Exporter les données actuelles
        </button>
      </div>

      <label className="import-slot import-slot-single">
        <strong>Fichier Excel à importer</strong>
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        />
        <span className="muted">
          {workbook
            ? `${workbook.name} · ${fileSummary}`
            : "Aucun fichier sélectionné"}
        </span>
      </label>

      {fileError && <p className="import-file-error">{fileError}</p>}

      {step === "mode" && workbook ? (
        <section className="import-mode" aria-label="Type d’import">
          <header className="import-mapping-head">
            <div>
              <h4>Étape 2 — Type d’import</h4>
              <p className="muted">
                La colonne <strong>Cle</strong> sert au rapprochement (id DBR,
                HubSpot, SIREN…). Si vous n’avez que le nom d’entreprise,
                mappez uniquement <strong>Nom</strong> : il sera utilisé comme
                Cle automatiquement.
              </p>
            </div>
          </header>
          <div className="import-mode-options" role="radiogroup">
            {(
              [
                {
                  id: "create" as const,
                  title: IMPORT_MODE_LABEL.create,
                  desc: "Crée uniquement les lignes dont la Cle (ou le nom) n’existe pas encore dans DBR.",
                },
                {
                  id: "update" as const,
                  title: IMPORT_MODE_LABEL.update,
                  desc: "Met à jour uniquement les fiches déjà présentes (même Cle ou même nom). Erreur si inconnue.",
                },
                {
                  id: "upsert" as const,
                  title: IMPORT_MODE_LABEL.upsert,
                  desc: "Met à jour les Cle/noms connus et crée les nouvelles lignes.",
                },
              ] as const
            ).map((opt) => (
              <label
                key={opt.id}
                className={`import-mode-card${
                  importMode === opt.id ? " is-selected" : ""
                }`}
              >
                <input
                  type="radio"
                  name="import-mode"
                  checked={importMode === opt.id}
                  onChange={() => setImportMode(opt.id)}
                />
                <strong>{opt.title}</strong>
                <span>{opt.desc}</span>
              </label>
            ))}
          </div>
          <div className="import-mapping-footer">
            <p className="muted">
              Fichier : {workbook.name} · {fileSummary}
            </p>
            <button
              type="button"
              className="primary-cta"
              onClick={confirmImportMode}
            >
              Continuer vers le mapping
            </button>
          </div>
        </section>
      ) : null}

      {step === "mapping" && workbook && activeSheet ? (
        <section className="import-mapping" aria-label="Mapping des colonnes">
          <header className="import-mapping-head">
            <div>
              <h4>Étape 2 — Validez le mapping</h4>
              <p className="muted">
                Gauche : en-têtes du fichier · Droite : champs DBR. La
                proposition (aliases ou IA) est une aide : c’est vous qui
                validez.
              </p>
            </div>
            <button
              type="button"
              className="ghost"
              disabled={aiBusy}
              onClick={() => void runAiSuggest()}
            >
              {aiBusy ? "Suggestion IA…" : "Proposer avec l’IA"}
            </button>
          </header>

          {workbook.sheets.length > 1 ? (
            <div className="import-sheet-tabs" role="tablist">
              {workbook.sheets.map((s, i) => (
                <button
                  key={sheetKey(s, i)}
                  type="button"
                  role="tab"
                  aria-selected={i === activeSheetIdx}
                  className={i === activeSheetIdx ? "active" : ""}
                  onClick={() => setActiveSheetIdx(i)}
                >
                  {s.sheetName}
                  <em>{IMPORT_ENTITY_LABEL[s.kind]}</em>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted import-sheet-label">
              {activeSheet.sheetName} ·{" "}
              {IMPORT_ENTITY_LABEL[activeSheet.kind as ImportEntityKind]}
            </p>
          )}

          <div className="import-mapping-grid-head">
            <span>En-tête fichier</span>
            <span>Champ DBR</span>
          </div>
          <ul className="import-mapping-list">
            {activeSheet.headers.map((header) => (
              <li key={header}>
                <div className="import-mapping-source">
                  <strong>{header}</strong>
                  {activeSheet.samples[header] ? (
                    <em>ex. {activeSheet.samples[header]}</em>
                  ) : null}
                </div>
                <select
                  value={activeMapping[header] ?? ""}
                  onChange={(e) =>
                    setMappingField(activeSheetIdx, header, e.target.value)
                  }
                >
                  <option value="">— Ignorer —</option>
                  {DBR_IMPORT_FIELDS[activeSheet.kind].map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                      {f.required ? " *" : ""}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>

          <div className="import-mapping-footer">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setStep("mode");
                setMappingValidated(false);
                setPlan(null);
              }}
            >
              ← Type d’import
            </button>
            <p className="muted">
              * champs obligatoires. Sans Cle, le Nom sert de clé. Aucun import
              tant que le mapping n’est pas validé.
            </p>
            <button
              type="button"
              className="primary-cta"
              onClick={validateMapping}
            >
              Valider le mapping
            </button>
          </div>
        </section>
      ) : null}

      {step === "preview" && mappingValidated && plan ? (
        <>
          <div className="import-actions">
            <button type="button" className="ghost" onClick={backToMapping}>
              ← Modifier le mapping
            </button>
            <span className="muted">
              Mode : {IMPORT_MODE_LABEL[importMode]}
            </span>
            <button
              type="button"
              className="primary-cta"
              disabled={errorCount > 0 || busy}
              onClick={runImport}
            >
              {busy ? "Import…" : "Confirmer l’import"}
            </button>
          </div>

          <div className="import-preview">
            <div className="import-preview-summary">
              <span>
                {plan.accounts.length} compte(s) · {plan.contacts.length}{" "}
                contact(s) · {plan.opportunities.length} opportunité(s) ·{" "}
                {plan.soldSolutions.length} solution(s) vendue(s)
              </span>
              <span>
                {errorCount > 0 ? (
                  <em className="import-err">{errorCount} erreur(s)</em>
                ) : (
                  <em className="import-ok">Prêt à importer</em>
                )}
                {warnCount > 0 ? (
                  <>
                    {" "}
                    · <em className="import-warn">{warnCount} alerte(s)</em>
                  </>
                ) : null}
              </span>
            </div>

            {plan.issues.length > 0 && (
              <ul className="import-issues">
                {plan.issues.slice(0, 40).map((issue, i) => (
                  <li key={`${issue.row}-${i}`} className={issue.level}>
                    Ligne {issue.row} : {issue.message}
                  </li>
                ))}
                {plan.issues.length > 40 ? (
                  <li className="muted">… {plan.issues.length - 40} de plus</li>
                ) : null}
              </ul>
            )}

            <div className="import-preview-tables">
              {plan.accounts.length > 0 && (
                <section>
                  <h4>Comptes</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Clé</th>
                        <th>Nom</th>
                        <th>Type</th>
                        <th>Groupe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.accounts.slice(0, 30).map((a) => (
                        <tr key={`a-${a.row}`}>
                          <td>{a.action === "create" ? "Créer" : "Maj"}</td>
                          <td>{a.externalKey || "—"}</td>
                          <td>{a.name}</td>
                          <td>
                            {a.type === "Holding" ? "Groupe" : "Entreprise"}
                          </td>
                          <td>{a.holdingKey || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
              {plan.contacts.length > 0 && (
                <section>
                  <h4>Contacts</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Nom</th>
                        <th>Compte</th>
                        <th>Titre</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.contacts.slice(0, 30).map((c) => (
                        <tr key={`c-${c.row}`}>
                          <td>{c.action === "create" ? "Créer" : "Maj"}</td>
                          <td>{c.name}</td>
                          <td>{c.accountKey}</td>
                          <td>{c.title || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
              {plan.opportunities.length > 0 && (
                <section>
                  <h4>Opportunités</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Nom</th>
                        <th>Compte</th>
                        <th>Montant</th>
                        <th>Phase</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.opportunities.slice(0, 30).map((o) => (
                        <tr key={`o-${o.row}`}>
                          <td>{o.action === "create" ? "Créer" : "Maj"}</td>
                          <td>{o.name}</td>
                          <td>{o.accountKey}</td>
                          <td>{o.amount.toLocaleString("fr-FR")} €</td>
                          <td>{o.phase}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
              {plan.soldSolutions.length > 0 && (
                <section>
                  <h4>Solutions vendues</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Compte</th>
                        <th>Solution</th>
                        <th>Modules</th>
                        <th>CA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.soldSolutions.slice(0, 30).map((s) => (
                        <tr key={`s-${s.row}`}>
                          <td>{s.action === "create" ? "Créer" : "Maj"}</td>
                          <td>{s.accountKey}</td>
                          <td>{s.solutionId}</td>
                          <td>{s.moduleIds.length || "—"}</td>
                          <td>
                            {s.billedAmount.toLocaleString("fr-FR")} €
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
            </div>
          </div>
        </>
      ) : null}

      {result && step === "upload" ? (
        <p className="import-result ok">{result}</p>
      ) : null}
    </div>
  );
}
