import { useEffect, useMemo, useState, type FormEvent } from "react";
import { formatEur } from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import OpportunityDetailPage from "./OpportunityDetailPage";
import SearchFilterBar, { matchesQuery } from "./SearchFilterBar";
import {
  computeBusinessOutcomes,
  defaultBusinessOutcomeValues,
  defaultOpportunityVariables,
  useOpportunities,
  type OpportunityKind,
} from "./opportunities/OpportunityContext";
import { summarizeCatalogue } from "./catalogue/formatCatalogue";
import OppScorePills from "./OppScorePills";
import { ensureRequiredMappingChecks } from "./opportunities/mappingScore";
import { useAuth } from "./auth/AuthContext";
import { useAccountPlans } from "./accountPlans/AccountPlanContext";
import {
  consumeOpenOpportunityDetail,
  consumeOppDetailBackTarget,
  oppDetailBackLabel,
  requestOpenAccount,
  type OppDetailBackTarget,
} from "./opportunities/oppNavigation";
import type { AppPage } from "./navigation";

function showsDealVariables(kind: OpportunityKind) {
  return kind === "up";
}

type StageFilter = "" | "whitespace" | "engaged";

export default function OpportunityPage({
  onNavigate,
}: {
  onNavigate?: (page: AppPage) => void;
} = {}) {
  const {
    activeOpportunities,
    setActiveOpportunityId,
    addOpportunity,
    quotaError,
    clearQuotaError,
  } = useOpportunities();
  const { billing } = useAuth();
  const { getPlanForOpportunity } = useAccountPlans();
  const { activeAccounts } = useDomain();
  const {
    activeSolutions,
    activePersonae,
    catalogFeatures,
    config,
    activeOppKinds,
    activeOppPhases,
    kindLabel,
    phaseLabel,
    kpiClassifier,
  } = useOrgConfig();

  const [detailId, setDetailId] = useState<string | null>(null);
  const [backTarget, setBackTarget] = useState<OppDetailBackTarget>({
    type: "list",
  });
  const [creating, setCreating] = useState(false);
  const [stageFilter, setStageFilter] = useState<StageFilter>("");
  const [createKind, setCreateKind] = useState<OpportunityKind>("prospect");
  const [createSolutionId, setCreateSolutionId] = useState("");
  const [createModuleIds, setCreateModuleIds] = useState<string[]>([]);
  const [createPersonaIds, setCreatePersonaIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({
    q: "",
    kind: "",
    phase: "",
    accountId: "",
    solutionId: "",
  });

  const filteredOpportunities = useMemo(() => {
    const q = filters.q ?? "";
    return activeOpportunities
      .filter((o) => {
        if (stageFilter === "whitespace" && !kpiClassifier.isWhitespacePhase(o.phase)) {
          return false;
        }
        if (
          stageFilter === "engaged" &&
          !kpiClassifier.isPipelineOpportunityPhase(o.phase)
        ) {
          return false;
        }
        if (filters.kind && o.kind !== filters.kind) return false;
        if (filters.phase && o.phase !== filters.phase) return false;
        if (filters.accountId && o.primaryAccountId !== filters.accountId) {
          return false;
        }
        if (filters.solutionId && o.solutionId !== filters.solutionId) {
          return false;
        }
        const account = activeAccounts.find(
          (a) => a.id === o.primaryAccountId,
        );
        const cat = summarizeCatalogue(o, activeSolutions);
        return matchesQuery(
          q,
          o.name,
          account?.name,
          kindLabel(o.kind),
          phaseLabel(o.phase),
          cat.short,
        );
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [
    activeOpportunities,
    filters,
    stageFilter,
    activeAccounts,
    activeSolutions,
    kpiClassifier,
  ]);

  useEffect(() => {
    const pending = consumeOpenOpportunityDetail();
    if (!pending) return;
    setBackTarget(consumeOppDetailBackTarget());
    setActiveOpportunityId(pending);
    setDetailId(pending);
  }, [setActiveOpportunityId]);

  const handleBackFromDetail = () => {
    setDetailId(null);
    if (backTarget.type === "account") {
      requestOpenAccount(backTarget.accountId);
      onNavigate?.("entreprises");
    } else if (backTarget.type === "dashboard") {
      onNavigate?.("dashboard");
    }
    setBackTarget({ type: "list" });
  };

  const backAccountName =
    backTarget.type === "account"
      ? activeAccounts.find((a) => a.id === backTarget.accountId)?.name
      : null;

  const entreprises = activeAccounts.filter((a) => a.type === "Entreprise");
  const holdings = activeAccounts.filter((a) => a.type === "Holding");
  const holdingName = (id: string | null | undefined) =>
    holdings.find((h) => h.id === id)?.name ?? "";

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    if (!name) return;
    const kind = (String(fd.get("kind") ?? createKind) ||
      "prospect") as OpportunityKind;
    const resolvedKind = activeOppKinds.some((k) => k.id === kind)
      ? kind
      : "prospect";
    const primaryAccountId = String(fd.get("primaryAccountId") ?? "");
    const entreprise = activeAccounts.find((a) => a.id === primaryAccountId);
    if (!entreprise || entreprise.type !== "Entreprise") return;
    const solutionId = String(fd.get("solutionId") ?? createSolutionId ?? "");
    const id = addOpportunity({
      name,
      amount: Number(fd.get("amount")) || 0,
      currency: "EUR",
      closeDate: String(fd.get("closeDate") ?? ""),
      primaryAccountId,
      phase: String(fd.get("phase") ?? activeOppPhases[0]?.id ?? ""),
      kind: resolvedKind,
      solutionId,
      moduleIds: catalogFeatures.modules ? createModuleIds : [],
      personaIds: catalogFeatures.personae ? createPersonaIds : [],
      variables: showsDealVariables(resolvedKind)
        ? defaultOpportunityVariables(config.oppVariables)
        : {},
      businessOutcomes: defaultBusinessOutcomeValues(config.boFields),
      mappingChecks: ensureRequiredMappingChecks(
        {},
        config.oppMappingSubtypes ?? [],
      ),
    });
    if (!id) return;
    setCreating(false);
    setCreateKind("prospect");
    setCreateSolutionId("");
    setCreateModuleIds([]);
    setCreatePersonaIds([]);
    setActiveOpportunityId(id);
    setBackTarget({ type: "list" });
    setDetailId(id);
  }

  if (detailId) {
    return (
      <OpportunityDetailPage
        opportunityId={detailId}
        onBack={handleBackFromDetail}
        backLabel={oppDetailBackLabel(backTarget, backAccountName)}
      />
    );
  }

  return (
    <div className="data-page opportunity-page">
      <header className="data-page-head">
        <div>
          <h1>Opportunités</h1>
        </div>
        <button
          type="button"
          className="primary-cta"
          onClick={() => {
            clearQuotaError();
            setCreating(true);
          }}
          disabled={
            entreprises.length === 0 ||
            !billing.canWrite ||
            billing.opportunitiesFull
          }
          title={
            entreprises.length === 0
              ? "Crée d’abord une entreprise"
              : !billing.canWrite
                ? "Abonnement en lecture seule"
                : billing.opportunitiesFull
                  ? "Quota d’opportunités actives atteint"
                  : undefined
          }
        >
          Ajouter une opportunité
        </button>
      </header>

      {quotaError ? (
        <p className="auth-error" role="alert">
          {quotaError}
        </p>
      ) : null}

      <div
        className="opp-stage-toggle"
        role="group"
        aria-label="Stade de l’opportunité"
      >
        {(
          [
            { id: "", label: "Toutes" },
            { id: "whitespace", label: "Whitespace" },
            { id: "engaged", label: "Engagées" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id || "all"}
            type="button"
            className={stageFilter === opt.id ? "active" : ""}
            onClick={() => setStageFilter(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <SearchFilterBar
        values={filters}
        onChange={(id, value) =>
          setFilters((prev) => ({ ...prev, [id]: value }))
        }
        resultCount={filteredOpportunities.length}
        resultLabel="opportunité"
        resultLabelPlural="opportunités"
        fields={[
          {
            id: "q",
            kind: "search",
            placeholder: "Rechercher une opportunité…",
          },
          {
            id: "kind",
            kind: "select",
            label: "Type",
            options: activeOppKinds.map((k) => ({
              value: k.id,
              label: kindLabel(k.id),
            })),
          },
          {
            id: "phase",
            kind: "select",
            label: "Phase",
            options: activeOppPhases.map((p) => ({
              value: p.id,
              label: phaseLabel(p.id),
            })),
          },
          {
            id: "accountId",
            kind: "select",
            label: "Entreprise",
            options: entreprises
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name, "fr"))
              .map((a) => ({ value: a.id, label: a.name })),
          },
          {
            id: "solutionId",
            kind: "select",
            label: "Solution",
            options: activeSolutions.map((s) => ({
              value: s.id,
              label: s.code ? `${s.name} (${s.code})` : s.name,
            })),
          },
        ]}
      />

      <section className="entry-subsection" aria-label="Liste des opportunités">
        {filteredOpportunities.length === 0 ? (
          <p className="muted">Aucun résultat.</p>
        ) : (
          <div className="ecosystem-table-wrap account-plan-table-wrap">
            <table className="ecosystem-table account-plan-table">
              <thead>
                <tr>
                  <th>Opportunité</th>
                  <th>Type</th>
                  <th>Phase</th>
                  <th>Entreprise</th>
                  <th>Account plan</th>
                  <th>Solution</th>
                  <th>Montant</th>
                  <th>Score</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredOpportunities.map((o) => {
                  const results = computeBusinessOutcomes(
                    o.businessOutcomes,
                    config.boFields,
                  );
                  const account = activeAccounts.find(
                    (a) => a.id === o.primaryAccountId,
                  );
                  const cat = summarizeCatalogue(o, activeSolutions);
                  const plan = getPlanForOpportunity(o.id);
                  return (
                    <tr key={o.id}>
                      <td>
                        <strong>
                          {o.name}
                          {kpiClassifier.isWhitespacePhase(o.phase) ? (
                            <span className="opp-stage-badge whitespace">
                              Whitespace
                            </span>
                          ) : kpiClassifier.isPipelineOpportunityPhase(o.phase) ? (
                            <span className="opp-stage-badge engaged">Engagée</span>
                          ) : null}
                        </strong>
                      </td>
                      <td>{kindLabel(o.kind)}</td>
                      <td>{phaseLabel(o.phase)}</td>
                      <td>{account?.name ?? "—"}</td>
                      <td>
                        {plan ? (
                          <span className="meta">
                            {plan.status}
                            {plan.dueDate ? ` · ${plan.dueDate}` : ""}
                          </span>
                        ) : (
                          <span className="muted">Aucun</span>
                        )}
                      </td>
                      <td>{cat.short !== "—" ? cat.short : "—"}</td>
                      <td>
                        {formatEur(o.amount)}
                        <span className="meta">
                          {` · net ${formatEur(results.netValue)}`}
                        </span>
                      </td>
                      <td>
                        {!kpiClassifier.isWhitespacePhase(o.phase) ? (
                          <OppScorePills opportunity={o} compact />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setActiveOpportunityId(o.id);
                            setBackTarget({ type: "list" });
                            setDetailId(o.id);
                          }}
                        >
                          Ouvrir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && (
        <div
          className="plan-create-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="opp-create-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCreating(false);
          }}
        >
          <form className="plan-create-dialog" onSubmit={handleCreate}>
            <h2 id="opp-create-title">Nouvelle opportunité</h2>
            <div className="entry-grid">
              <label>
                Nom
                <input name="name" required autoFocus />
              </label>
              <label>
                Type
                <select
                  name="kind"
                  value={createKind}
                  onChange={(e) =>
                    setCreateKind(e.target.value as OpportunityKind)
                  }
                  required
                >
                  {activeOppKinds.map((k) => (
                    <option key={k.id} value={k.id}>
                      {kindLabel(k.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Montant (€)
                <input name="amount" type="number" min={0} step={1000} />
              </label>
              <label>
                Close
                <input name="closeDate" type="date" />
              </label>
              <label>
                Entreprise
                <select name="primaryAccountId" required defaultValue="">
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {entreprises.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.holdingId ? ` · ${holdingName(a.holdingId)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Phase
                <select name="phase" defaultValue={activeOppPhases[0]?.id ?? ""}>
                  {activeOppPhases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {phaseLabel(p.id)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Solution (catalogue)
              <select
                name="solutionId"
                value={createSolutionId}
                onChange={(e) => {
                  setCreateSolutionId(e.target.value);
                  setCreateModuleIds([]);
                }}
              >
                <option value="">— Aucune —</option>
                {activeSolutions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.code ? ` (${s.code})` : ""}
                  </option>
                ))}
              </select>
            </label>

            {catalogFeatures.modules &&
              (() => {
                const sol = activeSolutions.find(
                  (s) => s.id === createSolutionId,
                );
                const modules = (sol?.modules ?? []).filter(
                  (m) => m.active !== false,
                );
                if (!sol || modules.length === 0) return null;
                return (
                  <fieldset className="opp-create-multi">
                    <legend>Modules</legend>
                    <div className="sold-check-grid">
                      {modules.map((m) => (
                        <label key={m.id} className="sold-check">
                          <input
                            type="checkbox"
                            checked={createModuleIds.includes(m.id)}
                            onChange={() => {
                              setCreateModuleIds((prev) =>
                                prev.includes(m.id)
                                  ? prev.filter((id) => id !== m.id)
                                  : [...prev, m.id],
                              );
                            }}
                          />
                          <span>{m.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })()}

            {catalogFeatures.personae && activePersonae.length > 0 && (
              <fieldset className="opp-create-multi">
                <legend>Personae adressées</legend>
                <p className="muted sold-multi-hint">
                  Aucune case = niveau entreprise.
                </p>
                <div className="sold-check-grid">
                  {activePersonae.map((d) => (
                    <label key={d.id} className="sold-check">
                      <input
                        type="checkbox"
                        checked={createPersonaIds.includes(d.id)}
                        onChange={() => {
                          setCreatePersonaIds((prev) =>
                            prev.includes(d.id)
                              ? prev.filter((id) => id !== d.id)
                              : [...prev, d.id],
                          );
                        }}
                      />
                      <span>{d.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="plan-create-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setCreating(false);
                  setCreateSolutionId("");
                  setCreateModuleIds([]);
                  setCreatePersonaIds([]);
                }}
              >
                Annuler
              </button>
              <button type="submit" className="primary-cta">
                Créer et ouvrir
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
