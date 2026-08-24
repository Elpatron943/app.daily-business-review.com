import { useMemo, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import { useOrgConfig } from "./config/ConfigContext";
import { soldLinePersonaIds } from "./data";
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
  applyCatalogGaps,
  catalogListForField,
  CATALOG_LIST_LABEL,
  extendCatalogsWithGaps,
  findCatalogGaps,
  formatCatalogGapsMessage,
  valueExistsInCatalog,
  type CatalogCatalogs,
} from "./import/catalogGaps";
import {
  downloadExcelExport,
  downloadExcelTemplate,
  isEmptyImportSheet,
  parseImportWorkbookWithMeta,
  type ExcelImportTables,
  type ExcelTemplateRefs,
  type RawImportSheet,
} from "./import/excel";
import {
  applyMultiEntityMapping,
  fieldsGroupedAll,
  fieldsGroupedForKind,
  IMPORT_ENTITY_LABEL,
  mappingCoversRequiredAll,
  suggestMappingFromAliases,
  suggestOfficialTemplateMapping,
  type ColumnMapping,
} from "./import/mappingFields";
import { suggestImportColumnMapping } from "./import/suggestColumnMapping";
import { checkOpenAiStatus } from "./research/openaiClient";
import { useConfirm } from "./ui/ConfirmDialog";
import { useToast } from "./ui/Toast";

type WorkbookState = {
  name: string;
  sheets: RawImportSheet[];
  mappings: Record<string, ColumnMapping>;
  /** Fichier conforme au template DBR officiel. */
  officialTemplate: boolean;
  ignoredSheetNames: string[];
};

/** Étapes guidées : mode → mapping validé → preview. */
type ImportStep = "upload" | "mode" | "mapping" | "preview";

function sheetKey(sheet: RawImportSheet, index: number) {
  return `${sheet.kind}:${sheet.sheetName}:${index}`;
}

type ImportManagerProps = {
  /** Ouvre Settings → Données → CRM (HubSpot). */
  onOpenCrm?: () => void;
};

export default function ImportManager({ onOpenCrm }: ImportManagerProps = {}) {
  const { notify } = useToast();
  const confirm = useConfirm();
  const { team } = useAuth();
  const { accounts, contacts, importDomainBatch } = useDomain();
  const { opportunities, importOpportunitiesBatch } = useOpportunities();
  const { soldSolutions, importSoldSolutionsBatch } = useSales();
  const {
    config,
    activePersonae,
    activeSolutions,
    activeCommercialStatuses,
    activeAccountSizes,
    activeOppPhases,
    activeOppKinds,
    statusLabel,
    kindLabel,
    phaseLabel,
    sizeLabel,
    addCommercialStatus,
    addAccountSize,
    addSector,
    addPersona,
    addOppPhase,
    addOppKind,
    addSolution,
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
  const [showAllMappingFields, setShowAllMappingFields] = useState(false);

  const catalogs: CatalogCatalogs = useMemo(
    () => ({
      statuses: activeCommercialStatuses.map((s) => ({
        id: s.id,
        label: statusLabel(s.id),
      })),
      sizes: activeAccountSizes.map((s) => ({
        id: s.id,
        label: sizeLabel(s.id),
      })),
      sectors: (config.sectors ?? [])
        .filter((s) => s.active !== false)
        .map((s) => ({ id: s.id, label: s.name })),
      personae: activePersonae.map((d) => ({
        id: d.id,
        label: d.name,
      })),
      phases: activeOppPhases.map((p) => ({
        id: p.id,
        label: phaseLabel(p.id),
      })),
      kinds: activeOppKinds.map((k) => ({
        id: k.id,
        label: kindLabel(k.id),
      })),
      solutions: activeSolutions.map((s) => ({
        id: s.id,
        label: s.code || s.name,
      })),
    }),
    [
      activeCommercialStatuses,
      activeAccountSizes,
      config.sectors,
      activePersonae,
      activeOppPhases,
      activeOppKinds,
      activeSolutions,
      statusLabel,
      sizeLabel,
      phaseLabel,
      kindLabel,
    ],
  );

  const ctx = useMemo(
    () => ({
      accounts,
      contacts,
      opportunities,
      soldSolutions,
      personae: activePersonae,
      sectors: config.sectors ?? [],
      solutions: activeSolutions,
      statuses: catalogs.statuses,
      sizes: catalogs.sizes,
      phases: catalogs.phases,
      kinds: catalogs.kinds,
      oppMappingSubtypes: config.oppMappingSubtypes ?? [],
      orgUsers: team.map((m) => ({
        id: m.id,
        email: m.email,
        fullName: m.full_name,
      })),
    }),
    [
      accounts,
      contacts,
      opportunities,
      soldSolutions,
      activePersonae,
      config.sectors,
      activeSolutions,
      catalogs,
      config.oppMappingSubtypes,
      team,
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
      personae: activePersonae.map((d) => d.name),
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
    activePersonae,
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
      if (isEmptyImportSheet(sheet)) return;
      const key = sheetKey(sheet, index);
      const mapping = wb.mappings[key] ?? {};
      const tables = applyMultiEntityMapping(
        sheet.headers,
        sheet.rows,
        mapping,
        sheet.kind,
      );
      for (const kind of [
        "accounts",
        "contacts",
        "opportunities",
        "sold_solutions",
      ] as const) {
        const table = tables[kind];
        if (!table || table.rows.length === 0) continue;
        const prev = out[kind];
        if (!prev) {
          out[kind] = table;
          continue;
        }
        out[kind] = {
          headers: [...new Set([...prev.headers, ...table.headers])],
          rows: [...prev.rows, ...table.rows],
        };
      }
    });
    return out;
  }

  function buildInitialMappings(
    sheets: RawImportSheet[],
    officialTemplate: boolean,
  ): Record<string, ColumnMapping> {
    const mappings: Record<string, ColumnMapping> = {};
    sheets.forEach((sheet, index) => {
      if (isEmptyImportSheet(sheet)) {
        mappings[sheetKey(sheet, index)] = {};
        return;
      }
      mappings[sheetKey(sheet, index)] = officialTemplate
        ? suggestOfficialTemplateMapping(sheet.headers, sheet.kind)
        : suggestMappingFromAliases(sheet.headers, sheet.kind);
    });
    return mappings;
  }

  function collectMissingRequired(wb: WorkbookState): string[] {
    const missing: string[] = [];
    wb.sheets.forEach((sheet, index) => {
      if (isEmptyImportSheet(sheet)) return;
      const key = sheetKey(sheet, index);
      const gaps = mappingCoversRequiredAll(wb.mappings[key] ?? {});
      if (gaps.length) {
        missing.push(`${sheet.sheetName} : ${gaps.join(", ")}`);
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
      const parsed = await parseImportWorkbookWithMeta(file);
      const { sheets, ignoredSheetNames, isOfficialTemplate } = parsed;
      const totalRows = sheets.reduce((s, sh) => s + sh.rows.length, 0);
      if (totalRows === 0) {
        setFileError(
          "Aucune donnée trouvée. Utilisez le template (onglets Entreprises, Contacts, Opportunites, Solutions_vendues).",
        );
        setWorkbook(null);
        setStep("upload");
        return;
      }
      const mappings = buildInitialMappings(sheets, isOfficialTemplate);
      setWorkbook({
        name: file.name,
        sheets,
        mappings,
        officialTemplate: isOfficialTemplate,
        ignoredSheetNames,
      });
      setActiveSheetIdx(0);
      setImportMode("upsert");
      setShowAllMappingFields(false);
      setStep("mode");
      if (isOfficialTemplate) {
        notify({
          tone: "ok",
          title: "Template DBR détecté",
          message:
            "Le mapping sera appliqué automatiquement — vous pourrez passer directement à la prévisualisation.",
        });
      } else {
        notify({
          tone: "info",
          title: "Type d’import",
          message:
            "Choisissez ajout, mise à jour, ou les deux — Cle ou nom d’entreprise comme référence.",
        });
      }
      if (ignoredSheetNames.length > 0) {
        notify({
          tone: "info",
          title: "Onglets ignorés",
          message: `${ignoredSheetNames.join(", ")} — noms non reconnus (Guide, Referentiel, etc.).`,
        });
      }
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
          samples: Object.fromEntries(
            sheet.headers.map((h) => [
              h,
              sheet.sampleValues?.[h]?.[0] ?? sheet.samples[h] ?? "",
            ]),
          ),
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
  async function applyValidatedMapping(wb: WorkbookState): Promise<boolean> {
    const missing = collectMissingRequired(wb);
    if (missing.length) {
      notify({
        tone: "error",
        title: "Mapping incomplet",
        message: missing.join(" · "),
      });
      return false;
    }

    const gaps = findCatalogGaps(
      wb.sheets.map((sheet, index) => ({
        headers: sheet.headers,
        rows: sheet.rows,
        mapping: wb.mappings[sheetKey(sheet, index)] ?? {},
      })),
      catalogs,
    );

    if (gaps.length > 0) {
      const ok = await confirm({
        title: "Nouvelles valeurs catalogue",
        message: formatCatalogGapsMessage(gaps),
        confirmLabel: "Ajouter et continuer",
        cancelLabel: "Annuler",
        danger: false,
      });
      if (!ok) return false;
      applyCatalogGaps(gaps, {
        addStatus: addCommercialStatus,
        addSize: addAccountSize,
        addSector,
        addPersona,
        addPhase: addOppPhase,
        addKind: addOppKind,
        addSolution,
      });
    }

    const extended = extendCatalogsWithGaps(catalogs, gaps);
    const planCtx = {
      ...ctx,
      statuses: extended.statuses,
      sizes: extended.sizes,
      phases: extended.phases,
      kinds: extended.kinds,
      personae: [
        ...activePersonae,
        ...extended.personae
          .filter((d) => !activePersonae.some((x) => x.id === d.id))
          .map((d) => ({
            id: d.id,
            name: d.label,
            active: true,
            order: 999,
          })),
      ],
      sectors: [
        ...(config.sectors ?? []),
        ...extended.sectors
          .filter(
            (s) => !(config.sectors ?? []).some((x) => x.id === s.id),
          )
          .map((s) => ({
            id: s.id,
            name: s.label,
            active: true,
            order: 999,
          })),
      ],
      solutions: [
        ...activeSolutions,
        ...extended.solutions
          .filter((s) => !activeSolutions.some((x) => x.id === s.id))
          .map((s) => ({
            id: s.id,
            name: s.label,
            active: true,
            order: 999,
            modules: [],
            description: "",
          })),
      ],
    };

    setMappingValidated(true);
    setResult(null);
    const nextPlan = buildImportPlan(
      buildMappedTables(wb),
      planCtx,
      importMode,
    );
    setPlan(nextPlan);
    setStep("preview");
    notify({
      tone: "ok",
      title: "Mapping validé",
      message: gaps.length
        ? `${gaps.length} valeur(s) ajoutée(s) au catalogue. Contrôlez la prévisualisation.`
        : "Contrôlez la prévisualisation puis lancez l’import.",
    });
    return true;
  }

  async function validateMapping() {
    if (!workbook) return;
    await applyValidatedMapping(workbook);
  }

  function confirmImportMode() {
    if (!workbook) return;
    if (workbook.officialTemplate) {
      void applyValidatedMapping(workbook);
      return;
    }
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
            moduleIds: o.moduleIds,
            personaIds: o.personaIds,
            ownerProfileId: o.ownerProfileId,
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
            personaIds: s.personaIds,
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
    const personaById = new Map(
      activePersonae.map((d) => [d.id, d.name]),
    );
    const sectorById = new Map(
      (config.sectors ?? []).map((s) => [s.id, s.name]),
    );
    const solutionById = new Map(
      activeSolutions.map((s) => [s.id, s.code || s.name]),
    );
    const ownerById = new Map(team.map((m) => [m.id, m.email]));

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
          a.ownerProfileId ? (ownerById.get(a.ownerProfileId) ?? "") : "",
        ];
      });

    const contactRows = contacts
      .filter((c) => c.active !== false)
      .map((c) => [
        c.id,
        c.name,
        c.title,
        c.accountId,
        personaById.get(c.personaId) ?? c.personaId,
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
      soldLinePersonaIds(s)
        .map((d) => personaById.get(d) ?? d)
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

  const missingRequired = useMemo(
    () => (workbook ? collectMissingRequired(workbook) : []),
    [workbook],
  );

  const mappingFieldGroups = useMemo(() => {
    if (!activeSheet) return fieldsGroupedAll();
    if (showAllMappingFields) return fieldsGroupedAll();
    return fieldsGroupedForKind(activeSheet.kind);
  }, [activeSheet, showAllMappingFields]);

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
            <strong>Le plus simple :</strong> téléchargez le template, remplissez-le,
            importez-le — le mapping est automatique. Colonne <code>Compte</code> =
            nom de l’entreprise (même orthographe que l’onglet Entreprises).
          </p>
          <aside className="import-owner-hint" role="note">
            <strong>Owner (gestionnaire)</strong>
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              Préférez assigner via la liste déroulante Owner sur la fiche
              entreprise : contacts et opportunités liés sont rattachés
              automatiquement. En import, la colonne{" "}
              <code>Owner_email</code> (e-mail exact d’un user dans Settings →
              Équipe) permet un rattachement auto ; sinon l’import continue et
              vous assignez ensuite manuellement.
            </p>
          </aside>
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
        {onOpenCrm ? (
          <button type="button" className="ghost" onClick={onOpenCrm}>
            Ou connecter HubSpot →
          </button>
        ) : null}
      </div>

      {!workbook ? (
        <aside className="import-quickstart" role="note">
          <strong>Démarrage rapide</strong>
          <ol>
            <li>Téléchargez le template (onglets Entreprises → Contacts → Opportunités).</li>
            <li>Remplissez au minimum <code>Nom</code> + <code>Compte</code> sur chaque onglet.</li>
            <li>Importez le fichier — mapping automatique si en-têtes identiques au template.</li>
          </ol>
        </aside>
      ) : null}

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
          {workbook.officialTemplate ? (
            <p className="import-template-detected" role="status">
              Template DBR détecté — le mapping sera appliqué automatiquement à
              l’étape suivante.
            </p>
          ) : null}
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
              {workbook.officialTemplate
                ? "Continuer vers la prévisualisation"
                : "Continuer vers le mapping"}
            </button>
          </div>
        </section>
      ) : null}

      {step === "mapping" && workbook && activeSheet ? (
        <section className="import-mapping" aria-label="Mapping des colonnes">
          <header className="import-mapping-head">
            <div>
              <h4>Étape 3 — Validez le mapping</h4>
              <p className="muted">
                Mappez chaque colonne vers un champ DBR. Sur une même ligne,
                l’entreprise sert automatiquement de rattachement aux contacts /
                opportunités. Colonne <code>Compte</code> = entreprise liée.
              </p>
            </div>
            <div className="import-mapping-head-actions">
              <label className="import-mapping-toggle">
                <input
                  type="checkbox"
                  checked={showAllMappingFields}
                  onChange={(e) => setShowAllMappingFields(e.target.checked)}
                />
                Voir tous les champs
              </label>
              <button
                type="button"
                className="ghost"
                disabled={aiBusy}
                onClick={() => void runAiSuggest()}
              >
                {aiBusy ? "Suggestion IA…" : "Proposer avec l’IA"}
              </button>
            </div>
          </header>

          {missingRequired.length > 0 ? (
            <aside className="import-mapping-gaps" role="alert">
              <strong>Mapping incomplet — corrigez avant de valider :</strong>
              <ul>
                {missingRequired.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </aside>
          ) : (
            <p className="import-mapping-ok" role="status">
              Tous les champs obligatoires sont mappés.
            </p>
          )}

          {workbook.ignoredSheetNames.length > 0 ? (
            <p className="import-ignored-sheets muted">
              Onglets ignorés : {workbook.ignoredSheetNames.join(", ")} (Guide,
              Referentiel…)
            </p>
          ) : null}

          {workbook.sheets.length > 1 ? (
            <div className="import-sheet-tabs" role="tablist">
              {workbook.sheets.map((s, i) => {
                const empty = isEmptyImportSheet(s);
                const sheetMissing = empty
                  ? []
                  : mappingCoversRequiredAll(
                      workbook.mappings[sheetKey(s, i)] ?? {},
                    );
                return (
                <button
                  key={sheetKey(s, i)}
                  type="button"
                  role="tab"
                  aria-selected={i === activeSheetIdx}
                  className={`${i === activeSheetIdx ? "active" : ""}${
                    sheetMissing.length ? " has-gap" : ""
                  }${empty ? " is-empty" : ""}`}
                  onClick={() => setActiveSheetIdx(i)}
                >
                  {s.sheetName}
                  <em>
                    {empty
                      ? `${IMPORT_ENTITY_LABEL[s.kind]} · vide`
                      : IMPORT_ENTITY_LABEL[s.kind]}
                  </em>
                  {sheetMissing.length ? (
                    <span className="import-tab-gap" title="Champs obligatoires manquants">
                      !
                    </span>
                  ) : null}
                </button>
                );
              })}
            </div>
          ) : (
            <p className="muted import-sheet-label">
              {activeSheet.sheetName}
              {isEmptyImportSheet(activeSheet) ? " · vide (ignoré)" : ""}
            </p>
          )}

          {activeSheet && isEmptyImportSheet(activeSheet) ? (
            <p className="import-sheet-empty muted" role="status">
              Cet onglet ne contient aucune ligne — il sera ignoré à
              l’import (aucun mapping requis).
            </p>
          ) : (
            <>
          <div className="import-mapping-grid-head">
            <span>En-tête fichier</span>
            <span>Exemples (3)</span>
            <span>
              Champ DBR
              {showAllMappingFields
                ? " (toutes entités)"
                : ` (${IMPORT_ENTITY_LABEL[activeSheet.kind]})`}
            </span>
          </div>
          <ul className="import-mapping-list">
            {activeSheet.headers.map((header) => {
              const fieldId = activeMapping[header] ?? "";
              const listKind = fieldId
                ? catalogListForField(fieldId)
                : null;
              const examples =
                activeSheet.sampleValues?.[header] ??
                (activeSheet.samples[header]
                  ? [activeSheet.samples[header]]
                  : []);
              const newExamples =
                listKind != null
                  ? examples.filter(
                      (v) => !valueExistsInCatalog(v, listKind, catalogs),
                    )
                  : [];
              return (
                <li key={header}>
                  <div className="import-mapping-source">
                    <strong>{header}</strong>
                  </div>
                  <div className="import-mapping-examples">
                    {examples.length ? (
                      <ul>
                        {examples.map((v) => (
                          <li
                            key={v}
                            className={
                              listKind &&
                              !valueExistsInCatalog(v, listKind, catalogs)
                                ? "is-new"
                                : undefined
                            }
                            title={
                              listKind &&
                              !valueExistsInCatalog(v, listKind, catalogs)
                                ? `Sera ajouté à « ${CATALOG_LIST_LABEL[listKind]} »`
                                : undefined
                            }
                          >
                            {v}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <em className="muted">—</em>
                    )}
                    {newExamples.length > 0 && listKind ? (
                      <p className="import-mapping-new-hint">
                        {newExamples.length === 1
                          ? `« ${newExamples[0]} » sera ajouté à ${CATALOG_LIST_LABEL[listKind]}`
                          : `${newExamples.length} valeurs seront ajoutées à ${CATALOG_LIST_LABEL[listKind]}`}
                      </p>
                    ) : null}
                  </div>
                  <select
                    value={fieldId}
                    onChange={(e) =>
                      setMappingField(activeSheetIdx, header, e.target.value)
                    }
                  >
                    <option value="">— Ignorer —</option>
                    {mappingFieldGroups.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.fields.map((f) => (
                          <option key={f.scopedId} value={f.scopedId}>
                            {f.label}
                            {f.required ? " *" : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
          </>
          )}

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
              disabled={missingRequired.length > 0}
              onClick={() => void validateMapping()}
            >
              Valider le mapping
              {missingRequired.length > 0
                ? ` (${missingRequired.length} manquant${missingRequired.length > 1 ? "s" : ""})`
                : ""}
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
                        <th>Owner</th>
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
                          <td>
                            {a.ownerEmail
                              ? a.ownerProfileId
                                ? a.ownerEmail
                                : `${a.ownerEmail} (manuel)`
                              : "—"}
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
