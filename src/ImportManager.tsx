import { useMemo, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import {
  useOpportunities,
} from "./opportunities/OpportunityContext";
import {
  buildImportPlan,
  defaultMappingChecks,
  planHasBlockingErrors,
  resolveAccountId,
  type ImportPlan,
} from "./import/bulkImport";
import {
  downloadExcelExport,
  downloadExcelTemplate,
  parseImportWorkbook,
  type ExcelImportTables,
  type ExcelTemplateRefs,
} from "./import/excel";

export default function ImportManager() {
  const { accounts, contacts, importDomainBatch } = useDomain();
  const { opportunities, importOpportunitiesBatch } = useOpportunities();
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

  const [workbook, setWorkbook] = useState<{
    name: string;
    tables: ExcelImportTables;
  } | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const ctx = useMemo(
    () => ({
      accounts,
      contacts,
      opportunities,
      directions: activeDirections,
      sectors: config.sectors ?? [],
      solutions: activeSolutions,
      oppMappingSubtypes: config.oppMappingSubtypes ?? [],
    }),
    [
      accounts,
      contacts,
      opportunities,
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
    return {
      directions: activeDirections.map((d) => d.name),
      sectors,
      solutions,
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

  async function onPickFile(file: File | null) {
    setResult(null);
    setPlan(null);
    setFileError(null);
    if (!file) {
      setWorkbook(null);
      return;
    }
    try {
      const tables = await parseImportWorkbook(file);
      const count =
        (tables.accounts?.rows.length ?? 0) +
        (tables.contacts?.rows.length ?? 0) +
        (tables.opportunities?.rows.length ?? 0);
      if (count === 0) {
        setFileError(
          "Aucune donnée trouvée. Utilisez le template (onglets Entreprises, Contacts, Opportunites).",
        );
        setWorkbook(null);
        return;
      }
      setWorkbook({ name: file.name, tables });
    } catch {
      setFileError("Impossible de lire ce fichier Excel.");
      setWorkbook(null);
    }
  }

  function runPreview() {
    if (!workbook) return;
    setResult(null);
    setPlan(buildImportPlan(workbook.tables, ctx));
  }

  function runImport() {
    if (!plan || planHasBlockingErrors(plan)) return;
    setBusy(true);
    try {
      const domainStats = importDomainBatch({
        accounts: plan.accounts,
        contacts: plan.contacts,
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

      setResult(
        [
          `Comptes : ${domainStats.createdAccounts} créés, ${domainStats.updatedAccounts} mis à jour`,
          `Contacts : ${domainStats.createdContacts} créés, ${domainStats.updatedContacts} mis à jour`,
          `Opportunités : ${oppStats.created} créées, ${oppStats.updated} mises à jour`,
        ].join(" · "),
      );
      setPlan(null);
      setWorkbook(null);
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

    downloadExcelExport({
      accounts: accountRows,
      contacts: contactRows,
      opportunities: oppRows,
      refs,
    });
  }

  const errorCount = plan?.issues.filter((i) => i.level === "error").length ?? 0;
  const warnCount =
    plan?.issues.filter((i) => i.level === "warning").length ?? 0;

  const fileSummary = workbook
    ? [
        workbook.tables.accounts
          ? `${workbook.tables.accounts.rows.length} compte(s)`
          : null,
        workbook.tables.contacts
          ? `${workbook.tables.contacts.rows.length} contact(s)`
          : null,
        workbook.tables.opportunities
          ? `${workbook.tables.opportunities.rows.length} opportunité(s)`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className="import-manager">
      <header className="catalogue-head">
        <div>
          <h3>Import / export Excel</h3>
          <p className="muted">
            Un seul fichier <code>.xlsx</code> : onglets Entreprises, Contacts,
            Opportunites. Liez les lignes via la colonne <code>Cle</code>.
          </p>
        </div>
      </header>

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

      <div className="import-actions">
        <button
          type="button"
          className="primary-cta"
          disabled={!workbook}
          onClick={runPreview}
        >
          Prévisualiser
        </button>
        <button
          type="button"
          disabled={!plan || errorCount > 0 || busy}
          onClick={runImport}
        >
          {busy ? "Import…" : "Importer"}
        </button>
      </div>

      {result && <p className="import-result ok">{result}</p>}

      {plan && (
        <div className="import-preview">
          <div className="import-preview-summary">
            <span>
              {plan.accounts.length} compte(s) · {plan.contacts.length}{" "}
              contact(s) · {plan.opportunities.length} opportunité(s)
            </span>
            <span>
              {errorCount > 0 ? (
                <em className="import-err">{errorCount} erreur(s)</em>
              ) : (
                <em className="import-ok">Prêt</em>
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
          </div>
        </div>
      )}
    </div>
  );
}
