import { useMemo, useState, type FormEvent } from "react";
import {
  aggregateKpis,
  formatEur,
  salesForAccountScope,
} from "../data";
import { useOrgConfig } from "../config/ConfigContext";
import { useDomain } from "../domain/DomainContext";
import { useSales } from "../sales/SalesContext";
import OpportunityMapPanel from "../OpportunityMapPanel";
import { buildOpportunityMap } from "./opportunityMap";
import {
  computeAccountHealth,
  computeWhiteSpace,
  contactsOnAccount,
  contactsOnHolding,
  countObjectivesByStatus,
  isPlanOverdue,
  planDurationDays,
  useAccountPlans,
  OBJECTIVE_STATUSES,
  type AccountPlan,
} from "./AccountPlanContext";
import {
  useOpportunities,
  type Opportunity,
} from "../opportunities/OpportunityContext";
import { summarizeCatalogue } from "../catalogue/formatCatalogue";
import { openOpportunityDetail } from "../opportunities/oppNavigation";

function resolveOpportunity(
  plan: AccountPlan,
  opportunities: Opportunity[],
): Opportunity | null {
  for (const id of plan.opportunityIds) {
    const found = opportunities.find((o) => o.id === id);
    if (found) return found;
  }
  return null;
}

/**
 * Vue d’ensemble :
 * - Entreprise → account plan éditable + map scopée entreprise
 * - Groupe → indicateurs agrégés (somme entreprises), sans saisie
 */
export default function AccountPlanOverviewOnFiche({
  accountId,
  onOpenOpportunities,
}: {
  accountId: string;
  /** Navigation vers la liste Opportunités (après ouverture d’une fiche). */
  onOpenOpportunities?: () => void;
}) {
  const { activeAccounts, activeContacts } = useDomain();
  const { soldSolutions } = useSales();
  const { activeSolutions, solutionLabel, salesTaxonomy, kindLabel, sizeLabel } =
    useOrgConfig();
  const {
    activePlans,
    updatePlan,
    upsertPlan,
    getPlanForOpportunity,
  } = useAccountPlans();
  const { activeOpportunities } = useOpportunities();

  const account = activeAccounts.find((a) => a.id === accountId) ?? null;
  const isHolding = account?.type === "Holding";

  const holding =
    account?.type === "Holding"
      ? account
      : account?.holdingId
        ? (activeAccounts.find((a) => a.id === account.holdingId) ?? null)
        : null;

  const childIds = useMemo(() => {
    if (!isHolding || !account) return [];
    return activeAccounts
      .filter((a) => a.type === "Entreprise" && a.holdingId === account.id)
      .map((a) => a.id);
  }, [isHolding, account, activeAccounts]);

  const plansForAccount = useMemo(() => {
    if (!account) return [];
    if (isHolding) {
      return activePlans
        .filter((p) => childIds.includes(p.accountId))
        .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
    }
    return activePlans
      .filter((p) => p.accountId === account.id)
      .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  }, [account, isHolding, childIds, activePlans]);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createDue, setCreateDue] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [createOppIds, setCreateOppIds] = useState<string[]>([]);

  const plan =
    !isHolding
      ? (plansForAccount.find((p) => p.id === selectedPlanId) ??
        plansForAccount[0] ??
        null)
      : null;

  const linkedOpportunities = useMemo(() => {
    if (!plan) return [];
    return plan.opportunityIds
      .map((id) => activeOpportunities.find((o) => o.id === id))
      .filter((o): o is Opportunity => Boolean(o));
  }, [plan, activeOpportunities]);

  const companyOpportunities = useMemo(() => {
    if (!account) return [];
    if (isHolding) {
      const ids = new Set(childIds);
      return activeOpportunities
        .filter((o) => ids.has(o.primaryAccountId))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    }
    return activeOpportunities
      .filter((o) => o.primaryAccountId === account.id)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [account, isHolding, childIds, activeOpportunities]);

  const attachableOpps = useMemo(() => {
    if (!account) return [];
    return companyOpportunities.filter((o) => !getPlanForOpportunity(o.id));
  }, [account, companyOpportunities, getPlanForOpportunity]);

  const scopeSales = useMemo(() => {
    if (!account) return [];
    const lines = salesForAccountScope(
      account.id,
      soldSolutions,
      activeAccounts,
    );
    if (isHolding) {
      return lines.filter((s) => s.accountId !== account.id);
    }
    return lines;
  }, [account, isHolding, soldSolutions, activeAccounts]);

  const kpis = useMemo(() => {
    if (!account) return null;
    return aggregateKpis(
      scopeSales,
      account.name,
      solutionLabel,
      companyOpportunities,
      undefined,
      salesTaxonomy,
    );
  }, [account, scopeSales, solutionLabel, companyOpportunities, salesTaxonomy]);

  const whiteSpaceIds = useMemo(() => {
    const soldIds = [...new Set(scopeSales.map((s) => s.solutionId))];
    return computeWhiteSpace(
      activeSolutions.map((s) => s.id),
      soldIds,
    );
  }, [scopeSales, activeSolutions]);

  const contactCount = useMemo(() => {
    if (!account) return 0;
    if (isHolding) {
      return contactsOnHolding(account.id, activeAccounts, activeContacts);
    }
    return contactsOnAccount(account.id, activeContacts);
  }, [account, isHolding, activeAccounts, activeContacts]);

  const health = useMemo(() => {
    if (!plan || !kpis) return null;
    const linkedActions = companyOpportunities
      .filter((o) => plan.opportunityIds.includes(o.id))
      .flatMap((o) => o.actions ?? []);
    return computeAccountHealth({
      plan,
      billedAmount: kpis.billedAmount,
      targetAmount: kpis.targetAmount,
      contactCount,
      whiteSpaceCount: whiteSpaceIds.length,
      linkedActions,
    });
  }, [plan, kpis, contactCount, whiteSpaceIds.length, companyOpportunities]);

  const opportunityMap = useMemo(() => {
    if (!account) return null;
    return buildOpportunityMap({
      accountId: account.id,
      accounts: activeAccounts,
      soldSolutions,
      opportunities: activeOpportunities,
      solutions: activeSolutions,
    });
  }, [
    account,
    activeAccounts,
    soldSolutions,
    activeOpportunities,
    activeSolutions,
  ]);

  const dealTotal = linkedOpportunities.reduce(
    (s, o) => s + (o.amount || 0),
    0,
  );

  function linkOpportunity(opportunityId: string) {
    if (!plan || !account) return;
    const opp = activeOpportunities.find((o) => o.id === opportunityId);
    if (!opp || getPlanForOpportunity(opp.id)) return;
    if (opp.primaryAccountId !== account.id) return;
    updatePlan(plan.id, {
      opportunityIds: [...plan.opportunityIds, opp.id],
    });
  }

  function unlinkOpportunity(opportunityId: string) {
    if (!plan) return;
    updatePlan(plan.id, {
      opportunityIds: plan.opportunityIds.filter((id) => id !== opportunityId),
    });
  }

  function handleCreatePlan(e: FormEvent) {
    e.preventDefault();
    if (!account || account.type !== "Entreprise" || !createDue) return;
    const ids = createOppIds.filter((id) =>
      companyOpportunities.some((o) => o.id === id),
    );
    const id = upsertPlan({
      opportunityIds: ids,
      accountId: account.id,
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: createDue,
      status: "Todo",
      vision: "",
      objectives: [],
    });
    setCreating(false);
    setCreateOppIds([]);
    setSelectedPlanId(id);
  }

  function toggleCreateOpp(id: string) {
    setCreateOppIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function openOpp(id: string) {
    if (!account) return;
    openOpportunityDetail(id, { type: "account", accountId: account.id });
    onOpenOpportunities?.();
  }

  if (!account) return null;

  // ——— Groupe : indicateurs agrégés, aucune saisie ———
  if (isHolding) {
    return (
      <section
        className="entry-subsection plan-on-fiche"
        aria-label="Indicateurs groupe"
      >
        <div className="plan-on-fiche-head">
          <div>
            <h3>Indicateurs groupe</h3>
          </div>
        </div>
        {opportunityMap && (
          <OpportunityMapPanel
            map={opportunityMap}
            title="Vue d’ensemble groupe"
            readOnly
          />
        )}
        {plansForAccount.length > 0 && (
          <div className="entry-subsection">
            <h3>Account plans des entreprises</h3>
            <ul className="entry-list">
              {plansForAccount.map((p) => {
                const acc =
                  activeAccounts.find((a) => a.id === p.accountId) ?? null;
                const opp = resolveOpportunity(p, activeOpportunities);
                return (
                  <li key={p.id}>
                    <div>
                      <strong>{acc?.name ?? p.accountId}</strong>
                      <span className="meta">
                        {opp?.name ??
                          (p.opportunityIds.length
                            ? `${p.opportunityIds.length} opp.`
                            : "Sans opportunité")}{" "}
                        · échéance {p.dueDate}
                        {isPlanOverdue(p) ? " · en retard" : ""}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {plansForAccount.length === 0 && (
          <p className="muted">Aucun account plan.</p>
        )}
      </section>
    );
  }

  // ——— Entreprise : pas encore de plan ———
  if (plansForAccount.length === 0) {
    return (
      <section
        className="entry-subsection plan-on-fiche"
        aria-label="Account plan"
      >
        <div className="plan-on-fiche-head">
          <div>
            <h3>Account plan · Vue d’ensemble</h3>
            <p className="muted">
              Aucun account plan. Le plan d’actions est obligatoirement rattaché
              à un account plan.
            </p>
          </div>
          {!creating && (
            <button
              type="button"
              className="primary-cta"
              onClick={() => setCreating(true)}
            >
              Créer un account plan
            </button>
          )}
        </div>

        {creating && (
          <form className="plan-create-on-fiche" onSubmit={handleCreatePlan}>
            <label>
              Échéance
              <input
                type="date"
                required
                value={createDue}
                onChange={(e) => setCreateDue(e.target.value)}
              />
            </label>
            <fieldset>
              <legend>Opportunités à rattacher (facultatif)</legend>
              {companyOpportunities.length === 0 ? (
                <p className="muted">Aucune opportunité.</p>
              ) : (
                <ul className="plan-create-opp-checks">
                  {companyOpportunities.map((o) => {
                    const taken = Boolean(getPlanForOpportunity(o.id));
                    return (
                      <li key={o.id}>
                        <label className={taken ? "is-disabled" : ""}>
                          <input
                            type="checkbox"
                            disabled={taken}
                            checked={createOppIds.includes(o.id)}
                            onChange={() => toggleCreateOpp(o.id)}
                          />
                          <span>
                            <strong>{o.name}</strong>
                            <em>
                              {kindLabel(o.kind)} ·{" "}
                              {formatEur(o.amount)}
                              {taken ? " · déjà dans un plan" : ""}
                            </em>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>
            <div className="plan-create-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setCreating(false);
                  setCreateOppIds([]);
                }}
              >
                Annuler
              </button>
              <button type="submit" className="primary-cta">
                Créer le plan
              </button>
            </div>
          </form>
        )}

        {companyOpportunities.length > 0 && (
          <div className="entry-subsection plan-company-opps">
            <h3>Opportunités de l’entreprise</h3>
            <ul className="entry-list">
              {companyOpportunities.map((o) => {
                const linkedPlan = getPlanForOpportunity(o.id);
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      className="entry-list-main"
                      onClick={() => openOpp(o.id)}
                    >
                      <strong>{o.name}</strong>
                      <span className="meta">
                        {kindLabel(o.kind)} · {formatEur(o.amount)}{" "}
                        · {o.phase}
                        {linkedPlan ? " · dans un plan" : " · libre"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {opportunityMap && (
          <OpportunityMapPanel
            map={opportunityMap}
            title="Indicateurs entreprise"
            readOnly
          />
        )}
      </section>
    );
  }

  if (!plan || !kpis || !health) return null;

  const objCounts = countObjectivesByStatus(plan.objectives);
  const achievedPct =
    plan.objectives.length > 0
      ? Math.round((objCounts.Achieved / plan.objectives.length) * 100)
      : 0;
  const linkedActions = companyOpportunities
    .filter((o) => plan.opportunityIds.includes(o.id))
    .flatMap((o) => o.actions ?? []);
  const actionsDone = linkedActions.filter((a) => a.status === "Done").length;
  const actionsPct =
    linkedActions.length > 0
      ? Math.round((actionsDone / linkedActions.length) * 100)
      : 0;
  const duration = planDurationDays(plan.startDate, plan.dueDate);
  const segmentBits = [
    account.sector,
    account.size ? sizeLabel(account.size) : null,
  ].filter(Boolean);

  return (
    <section
      className="entry-subsection plan-on-fiche"
      aria-label="Account plan"
    >
      <div className="plan-on-fiche-head">
        <div>
          <h3>Account plan · Vue d’ensemble</h3>
          <p className="muted">
            {account.name}
            {holding ? ` · groupe ${holding.name}` : ""}
            {segmentBits.length > 0 ? ` · ${segmentBits.join(" · ")}` : ""}
          </p>
        </div>
        {plansForAccount.length > 1 && (
          <label className="plan-on-fiche-pick">
            Plan
            <select
              value={plan.id}
              onChange={(e) => setSelectedPlanId(e.target.value)}
            >
              {plansForAccount.map((p) => {
                const opp = resolveOpportunity(p, activeOpportunities);
                return (
                  <option key={p.id} value={p.id}>
                    {opp?.name ??
                      (p.opportunityIds.length
                        ? `${p.opportunityIds.length} opp.`
                        : "Plan")}{" "}
                    · {p.dueDate}
                  </option>
                );
              })}
            </select>
          </label>
        )}
      </div>

      <div className={`health health-${health.status.toLowerCase()}`}>
        <span className="health-label">{health.status}</span>
        <span className="health-score">{health.score}%</span>
        <span className="health-msg">{health.message}</span>
      </div>
      {isPlanOverdue(plan) && (
        <p className="plan-alert">Plan en retard (échéance {plan.dueDate})</p>
      )}

      <div className="plan-overview">
        {opportunityMap && (
          <OpportunityMapPanel
            plan={plan}
            map={opportunityMap}
            dealTarget={dealTotal}
          />
        )}

        <section className="plan-overview-grid">
          <article className="plan-ov-card">
            <h3>Plan Details</h3>
            <dl className="plan-ov-dl">
              <div>
                <dt>Cible</dt>
                <dd>
                  <strong>
                    {kpis ? formatEur(kpis.targetAmount) : formatEur(dealTotal)}
                  </strong>
                </dd>
              </div>
              <div>
                <dt>Début</dt>
                <dd>
                  <input
                    type="date"
                    value={plan.startDate}
                    onChange={(e) =>
                      updatePlan(plan.id, { startDate: e.target.value })
                    }
                  />
                </dd>
              </div>
              <div>
                <dt>Échéance</dt>
                <dd>
                  <input
                    type="date"
                    value={plan.dueDate}
                    onChange={(e) =>
                      updatePlan(plan.id, { dueDate: e.target.value })
                    }
                  />
                </dd>
              </div>
              <div>
                <dt>Durée</dt>
                <dd>
                  <strong>{duration > 0 ? `${duration} jours` : "—"}</strong>
                </dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>
                  <input
                    value={plan.owner ?? ""}
                    placeholder="Owner"
                    onChange={(e) =>
                      updatePlan(plan.id, {
                        owner: e.target.value || undefined,
                      })
                    }
                  />
                </dd>
              </div>
            </dl>
          </article>

          <article className="plan-ov-card plan-ov-opps">
            <h3>
              Opportunités
              {linkedOpportunities.length > 0
                ? ` · ${linkedOpportunities.length}`
                : ""}
            </h3>
            {linkedOpportunities.length === 0 ? (
              <p className="muted">Aucune opportunité rattachée au plan.</p>
            ) : (
              <ul className="plan-ov-opp-list">
                {linkedOpportunities.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      className="plan-ov-opp-open"
                      onClick={() => openOpp(o.id)}
                    >
                      <strong>{o.name}</strong>
                      <span>
                        {kindLabel(o.kind)} · {formatEur(o.amount)}{" "}
                        · {o.phase}
                        {o.closeDate ? ` · close ${o.closeDate}` : ""}
                        {o.solutionId
                          ? ` · ${summarizeCatalogue(o, activeSolutions).short}`
                          : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      title="Retirer du plan"
                      onClick={() => unlinkOpportunity(o.id)}
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {linkedOpportunities.length > 0 && (
              <p className="plan-ov-opp-total muted">
                Total deals {formatEur(dealTotal)}
              </p>
            )}
            {attachableOpps.length > 0 ? (
              <label className="plan-relink">
                Rattacher une opportunité
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
            ) : (
              <p className="muted">
                {companyOpportunities.length === 0
                  ? "Aucune opportunité."
                  : "Aucune opportunité libre."}
              </p>
            )}
          </article>

          <article className="plan-ov-card">
            <h3>Progression</h3>
            <div className="plan-ov-progress">
              <div>
                <span>Objectifs atteints</span>
                <strong>{achievedPct}%</strong>
                <div className="plan-bar" aria-hidden>
                  <i style={{ width: `${achievedPct}%` }} />
                </div>
              </div>
              <div>
                <span>Actions terminées</span>
                <strong>{actionsPct}%</strong>
                <div className="plan-bar" aria-hidden>
                  <i style={{ width: `${actionsPct}%` }} />
                </div>
              </div>
              <ul className="plan-obj-status-list">
                {OBJECTIVE_STATUSES.map((s) => (
                  <li key={s.id}>
                    <span>{s.label}</span>
                    <strong>{objCounts[s.id]}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </section>

        <label className="plan-vision">
          Vision
          <textarea
            rows={3}
            value={plan.vision}
            onChange={(e) => updatePlan(plan.id, { vision: e.target.value })}
            placeholder="Ambition 12–18 mois…"
          />
        </label>
      </div>
    </section>
  );
}
