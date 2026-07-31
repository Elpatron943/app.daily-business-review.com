import { useMemo, useState, type FormEvent } from "react";
import {
  aggregateKpis,
  formatEur,
  salesForAccountScope,
} from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import { useSales } from "./sales/SalesContext";
import {
  computeAccountHealth,
  computeWhiteSpace,
  contactsOnAccount,
  countObjectivesByStatus,
  isPlanOverdue,
  useAccountPlans,
  type ObjectiveStatus,
  type PlanStatus,
  PLAN_STATUSES,
  OBJECTIVE_STATUSES,
} from "./accountPlans/AccountPlanContext";
import {
  groupByPlanQuarters,
  planOpportunitiesAmount,
} from "./accountPlans/planQuarters";
import { summarizeCatalogue } from "./catalogue/formatCatalogue";
import AccountPlanOverviewOnFiche from "./accountPlans/AccountPlanOverviewOnFiche";
import {
  useOpportunities,
  type Opportunity,
} from "./opportunities/OpportunityContext";
import { useConfirm } from "./ui/ConfirmDialog";


type Tab = "fiche" | "objectifs" | "overview";

type Props = {
  planId: string;
  onBack: () => void;
};

export default function AccountPlanDetailPage({ planId, onBack }: Props) {
  const {
    activePlans,
    updatePlan,
    removePlan,
    addObjective,
    updateObjective,
    removeObjective,
    getPlanForOpportunity,
  } = useAccountPlans();
  const askConfirm = useConfirm();
  const { activeOpportunities } = useOpportunities();
  const { activeAccounts, activeContacts } = useDomain();
  const { soldSolutions } = useSales();
  const { activeSolutions, solutionLabel, salesTaxonomy, kindLabel, sizeLabel } =
    useOrgConfig();

  const plan = activePlans.find((p) => p.id === planId) ?? null;
  const [tab, setTab] = useState<Tab>("fiche");
  const [objFilter, setObjFilter] = useState<ObjectiveStatus | "all">("all");

  const opportunities = useMemo(() => {
    if (!plan) return [];
    return plan.opportunityIds
      .map((id) => activeOpportunities.find((o) => o.id === id))
      .filter((o): o is Opportunity => Boolean(o));
  }, [plan, activeOpportunities]);

  const primaryAccountId = opportunities[0]?.primaryAccountId ?? plan?.accountId ?? null;

  const entreprise = useMemo(() => {
    if (!primaryAccountId) return null;
    return activeAccounts.find((a) => a.id === primaryAccountId) ?? null;
  }, [primaryAccountId, activeAccounts]);

  const holding = useMemo(() => {
    if (!entreprise?.holdingId) return null;
    return activeAccounts.find((a) => a.id === entreprise.holdingId) ?? null;
  }, [entreprise, activeAccounts]);

  const attachableOpps = useMemo(() => {
    const free = activeOpportunities.filter((o) => {
      if (getPlanForOpportunity(o.id)) return false;
      const acc = activeAccounts.find((a) => a.id === o.primaryAccountId);
      return acc?.type === "Entreprise";
    });
    if (!primaryAccountId) return free;
    return free.filter((o) => o.primaryAccountId === primaryAccountId);
  }, [
    activeOpportunities,
    getPlanForOpportunity,
    primaryAccountId,
    activeAccounts,
  ]);

  const scopeSales = useMemo(() => {
    if (!plan?.accountId) return [];
    return salesForAccountScope(
      plan.accountId,
      soldSolutions,
      activeAccounts,
    );
  }, [plan?.accountId, soldSolutions, activeAccounts]);

  const kpis = useMemo(() => {
    if (!plan?.accountId) return null;
    return aggregateKpis(
      scopeSales,
      entreprise?.name ?? "Entreprise",
      solutionLabel,
      opportunities,
      undefined,
      salesTaxonomy,
    );
  }, [plan?.accountId, scopeSales, entreprise, solutionLabel, opportunities, salesTaxonomy]);

  const whiteSpace = useMemo(() => {
    const soldIds = [...new Set(scopeSales.map((s) => s.solutionId))];
    return computeWhiteSpace(
      activeSolutions.map((s) => s.id),
      soldIds,
    );
  }, [scopeSales, activeSolutions]);

  const contactCount = plan?.accountId
    ? contactsOnAccount(plan.accountId, activeContacts)
    : 0;

  const health = useMemo(() => {
    if (!plan || !kpis) return null;
    return computeAccountHealth({
      plan,
      billedAmount: kpis.billedAmount,
      targetAmount: kpis.targetAmount,
      contactCount,
      whiteSpaceCount: whiteSpace.length,
    });
  }, [plan, kpis, contactCount, whiteSpace.length]);

  if (!plan) {
    return (
      <div className="data-page account-plan-detail-page">
        <header className="data-page-head">
          <div>
            <button type="button" className="ghost back-link" onClick={onBack}>
              ← Account plans
            </button>
            <h1>Plan introuvable</h1>
          </div>
        </header>
      </div>
    );
  }

  const overdueCount = 0;
  const dealTotal = planOpportunitiesAmount(opportunities);

  const potentialByQuarter = useMemo(() => {
    const cols = groupByPlanQuarters({
      items: opportunities,
      getDate: (o) => o.closeDate || plan.dueDate || "",
      getAmount: (o) => o.amount || 0,
      years: 2,
    });
    // Fenêtre visible : 4 prochains trimestres + past/later s’ils ont du montant
    const forward = cols.filter(
      (c) => c.id !== "_past" && c.id !== "_later",
    );
    const near = forward.slice(0, 4);
    const past = cols.find((c) => c.id === "_past");
    const later = cols.find((c) => c.id === "_later");
    return {
      near,
      pastAmount: past?.totalAmount ?? 0,
      laterAmount: later?.totalAmount ?? 0,
      max: Math.max(1, ...near.map((c) => c.totalAmount)),
    };
  }, [opportunities, plan.dueDate]);

  const title =
    opportunities.length === 0
      ? (holding?.name ?? "Account plan")
      : opportunities.length === 1
        ? opportunities[0].name
        : `${opportunities[0].name} +${opportunities.length - 1}`;
  const segmentBits = [
    entreprise?.name,
    holding?.sector,
    holding?.size ? sizeLabel(holding.size) : null,
  ].filter(Boolean);

  const objCounts = countObjectivesByStatus(plan.objectives);
  const filteredObjectives =
    objFilter === "all"
      ? plan.objectives
      : plan.objectives.filter((o) => o.status === objFilter);
  function linkOpportunity(opportunityId: string) {
    const opp = activeOpportunities.find((o) => o.id === opportunityId);
    if (!opp || getPlanForOpportunity(opp.id)) return;
    const acc = activeAccounts.find((a) => a.id === opp.primaryAccountId);
    if (!acc || acc.type !== "Entreprise") return;
    if (primaryAccountId && opp.primaryAccountId !== primaryAccountId) {
      return;
    }
    const nextIds = [...plan!.opportunityIds, opp.id];
    updatePlan(plan!.id, {
      opportunityIds: nextIds,
      accountId: plan!.accountId || opp.primaryAccountId,
    });
  }

  function unlinkOpportunity(opportunityId: string) {
    updatePlan(plan!.id, {
      opportunityIds: plan!.opportunityIds.filter((id) => id !== opportunityId),
    });
  }

  function handleAddObjective(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addObjective(plan!.id, String(fd.get("label") ?? ""));
    e.currentTarget.reset();
  }

  return (
    <div className="data-page account-plan-detail-page">
      <header className="data-page-head">
        <div>
          <button type="button" className="ghost back-link" onClick={onBack}>
            ← Account plans
          </button>
          <h1>{title}</h1>
          <p>
            {opportunities.length > 0
              ? `${opportunities.length} opportunité${opportunities.length > 1 ? "s" : ""} · ${formatEur(dealTotal)}`
              : "Aucune opportunité liée"}
            {entreprise ? ` · ${entreprise.name}` : ""}
            {holding ? ` · groupe ${holding.name}` : ""}
            {segmentBits.length > 0 ? ` · ${segmentBits.join(" · ")}` : ""}
            {isPlanOverdue(plan) ? " · en retard" : ""}
          </p>
        </div>
        <div className="account-detail-actions">
          <button
            type="button"
            className="ghost danger-text"
            onClick={() => {
              void (async () => {
                const ok = await askConfirm({
                  title: "Désactiver le plan",
                  message: `Désactiver le plan de « ${title} » ?`,
                  confirmLabel: "Désactiver",
                  cancelLabel: "Annuler",
                  danger: true,
                });
                if (!ok) return;
                removePlan(plan.id);
                onBack();
              })();
            }}
          >
            Désactiver
          </button>
        </div>
      </header>

      {(health || kpis) && (
        <section
          className="account-detail-kpis plan-detail-kpis"
          aria-label="Indicateurs du plan"
        >
          {health && (
            <article>
              <span>Health</span>
              <strong
                className={`health-inline health-${health.status.toLowerCase()}`}
              >
                {health.status} {health.score}%
              </strong>
            </article>
          )}
          <article>
            <span>CA actuel</span>
            <strong>
              {kpis ? formatEur(kpis.billedAmount) : "—"}
            </strong>
          </article>
          <article>
            <span>Pipeline / whitespace</span>
            <strong>
              {kpis
                ? formatEur(kpis.potentialAmount + kpis.whitespaceAmount)
                : formatEur(dealTotal)}
            </strong>
          </article>
          <article>
            <span>Cible</span>
            <strong>
              {kpis ? formatEur(kpis.targetAmount) : formatEur(dealTotal)}
            </strong>
            {kpis && (
              <em
                className={`plan-kpi-growth${
                  kpis.billedAmount <= 0
                    ? kpis.targetAmount > 0
                      ? " up"
                      : ""
                    : kpis.targetAmount >= kpis.billedAmount
                      ? " up"
                      : " down"
                }`}
              >
                {(() => {
                  const billed = kpis.billedAmount;
                  const target = kpis.targetAmount;
                  if (billed <= 0) {
                    return target > 0 ? "vs CA actuel · n/a" : "vs CA actuel · —";
                  }
                  const pct = Math.round(((target - billed) / billed) * 100);
                  const sign = pct > 0 ? "+" : "";
                  return `vs CA actuel · ${sign}${pct}%`;
                })()}
              </em>
            )}
          </article>
          <article className="plan-kpi-quarters">
            <span>Étalement potentiel / trimestre</span>
            {potentialByQuarter.near.every((c) => c.totalAmount === 0) &&
            potentialByQuarter.pastAmount === 0 &&
            potentialByQuarter.laterAmount === 0 ? (
              <strong className="muted">—</strong>
            ) : (
              <ul className="plan-quarter-spread">
                {potentialByQuarter.pastAmount > 0 && (
                  <li>
                    <em>Avant</em>
                    <strong>
                      {formatEur(potentialByQuarter.pastAmount)}
                    </strong>
                  </li>
                )}
                {potentialByQuarter.near.map((c) => (
                  <li key={c.id}>
                    <em>{c.label}</em>
                    <div
                      className="plan-quarter-bar"
                      aria-hidden
                    >
                      <i
                        style={{
                          width: `${(c.totalAmount / potentialByQuarter.max) * 100}%`,
                        }}
                      />
                    </div>
                    <strong>
                      {c.totalAmount > 0 ? formatEur(c.totalAmount) : "—"}
                    </strong>
                  </li>
                ))}
                {potentialByQuarter.laterAmount > 0 && (
                  <li>
                    <em>Plus tard</em>
                    <strong>
                      {formatEur(potentialByQuarter.laterAmount)}
                    </strong>
                  </li>
                )}
              </ul>
            )}
          </article>
          <article>
            <span>Actions en retard</span>
            <strong>{overdueCount}</strong>
          </article>
        </section>
      )}

      <nav className="plan-tabs" aria-label="Sections account plan">
        <button
          type="button"
          className={tab === "fiche" ? "active" : ""}
          onClick={() => setTab("fiche")}
        >
          Fiche
        </button>
        <button
          type="button"
          className={tab === "objectifs" ? "active" : ""}
          onClick={() => setTab("objectifs")}
        >
          Plan
        </button>
        <button
          type="button"
          className={tab === "overview" ? "active" : ""}
          onClick={() => setTab("overview")}
        >
          Vue d’ensemble
        </button>
      </nav>

      {tab === "fiche" && (
        <section className="entry-subsection account-detail-fiche">
          <h2>Paramètres</h2>
          <div className="data-form-grid">
            <label>
              Échéance
              <input
                type="date"
                value={plan.dueDate}
                onChange={(e) => updatePlan(plan.id, { dueDate: e.target.value })}
              />
            </label>
            <label>
              Début
              <input
                type="date"
                value={plan.startDate}
                onChange={(e) =>
                  updatePlan(plan.id, { startDate: e.target.value })
                }
              />
            </label>
            <label>
              Statut
              <select
                value={plan.status}
                onChange={(e) =>
                  updatePlan(plan.id, {
                    status: e.target.value as PlanStatus,
                  })
                }
              >
                {PLAN_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="plan-cible-readonly">
              <span className="plan-cible-label">
                Cible (whitespace + pipeline + renouv. en cours)
              </span>
              <strong>
                {kpis ? formatEur(kpis.targetAmount) : formatEur(dealTotal)}
              </strong>
              <em className="muted">
                Calculée automatiquement — non modifiable
              </em>
            </div>
            <label>
              Owner
              <input
                value={plan.owner ?? ""}
                onChange={(e) =>
                  updatePlan(plan.id, {
                    owner: e.target.value || undefined,
                  })
                }
              />
            </label>
          </div>

          <section className="plan-linked-opps">
            <h3>Opportunités rattachées</h3>
            <ul className="entry-list">
              {opportunities.length === 0 && (
                <li className="muted">Aucune opportunité liée.</li>
              )}
              {opportunities.map((o) => (
                <li key={o.id}>
                  <div>
                    <strong>{o.name}</strong>
                    <span className="meta">
                      {kindLabel(o.kind)} · {formatEur(o.amount)} ·{" "}
                      {o.phase}
                      {o.closeDate ? ` · close ${o.closeDate}` : ""}
                      {o.solutionId
                        ? ` · ${summarizeCatalogue(o, activeSolutions).short}`
                        : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => unlinkOpportunity(o.id)}
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
            {attachableOpps.length > 0 && (
              <label className="plan-relink">
                Ajouter une opportunité
                <select
                  key={plan.opportunityIds.join(",")}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) linkOpportunity(e.target.value);
                  }}
                >
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {attachableOpps.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} · {formatEur(o.amount)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {attachableOpps.length === 0 && (
              <p className="muted">
                {opportunities.length > 0
                  ? "Aucune autre opportunité libre."
                  : "Aucune opportunité libre."}
              </p>
            )}
          </section>

          <label className="plan-vision">
            Vision
            <textarea
              rows={4}
              value={plan.vision}
              onChange={(e) => updatePlan(plan.id, { vision: e.target.value })}
              placeholder="Ambition 12–18 mois sur le compte…"
            />
          </label>

          {health && (
            <div className={`health health-${health.status.toLowerCase()}`}>
              <span className="health-label">{health.status}</span>
              <span className="health-score">{health.score}%</span>
              <span className="health-msg">{health.message}</span>
            </div>
          )}
        </section>
      )}

      {tab === "objectifs" && (
        <div className="plan-obj-actions">
          <div className="plan-obj-filter-bar">
            <span className="muted">Filtrer</span>
            <button
              type="button"
              className={objFilter === "all" ? "active" : ""}
              onClick={() => setObjFilter("all")}
            >
              Tous ({objCounts.all})
            </button>
            {OBJECTIVE_STATUSES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={objFilter === s.id ? "active" : ""}
                onClick={() => setObjFilter(s.id)}
              >
                {s.label} ({objCounts[s.id]})
              </button>
            ))}
          </div>

          <section className="opp-signals">
            <h3>Objectifs</h3>
            <ul className="signal-checks plan-objectives">
              {filteredObjectives.length === 0 && (
                <li className="muted">Aucun objectif pour ce filtre.</li>
              )}
              {filteredObjectives.map((o) => (
                <li
                  key={o.id}
                  className={`obj-status-${o.status.toLowerCase()}`}
                >
                  <select
                    className="obj-status-select"
                    value={o.status}
                    aria-label="Statut objectif"
                    onChange={(e) =>
                      updateObjective(plan.id, o.id, {
                        status: e.target.value as ObjectiveStatus,
                      })
                    }
                  >
                    {OBJECTIVE_STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <span className="plan-obj-label">
                    <input
                      className="inline-edit"
                      value={o.label}
                      onChange={(e) =>
                        updateObjective(plan.id, o.id, {
                          label: e.target.value,
                        })
                      }
                    />
                  </span>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => removeObjective(plan.id, o.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <form className="settings-add" onSubmit={handleAddObjective}>
              <input name="label" placeholder="Nouvel objectif" required />
              <button type="submit">Ajouter</button>
            </form>
          </section>

        </div>
      )}

      {tab === "overview" && (entreprise || plan.accountId) && (
        <AccountPlanOverviewOnFiche
          accountId={entreprise?.id ?? plan.accountId}
        />
      )}
      {tab === "overview" && !entreprise && !plan.accountId && (
        <p className="muted">Aucune entreprise liée.</p>
      )}
    </div>
  );
}
