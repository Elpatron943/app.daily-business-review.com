import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  aggregateKpis,
  formatEur,
  opportunitiesForAccountScope,
  salesForAccountScope,
  type Account,
} from "./data";
import { useDomain } from "./domain/DomainContext";
import { useOrgConfig } from "./config/ConfigContext";
import { useSales } from "./sales/SalesContext";
import {
  useAccountPlans,
  PLAN_STATUSES,
  type AccountPlan,
  isPlanOverdue,
} from "./accountPlans/AccountPlanContext";
import {
  groupByPlanQuarters,
  planOpportunitiesAmount,
  planProjectionDate,
} from "./accountPlans/planQuarters";
import {
  useOpportunities,
  type Opportunity,
} from "./opportunities/OpportunityContext";
import AccountPlanDetailPage from "./AccountPlanDetailPage";
import SearchFilterBar, { matchesQuery } from "./SearchFilterBar";
import OppScorePills from "./OppScorePills";

function equipRatePct(billed: number, target: number): number | null {
  if (target <= 0) return null;
  return Math.min(100, Math.round((billed / target) * 100));
}
/** Holding du compte à partir du compte principal de l’opportunité. */
export function holdingIdFromOpportunityAccount(
  primaryAccountId: string,
  accounts: Account[],
): string {
  const acc = accounts.find((a) => a.id === primaryAccountId);
  if (!acc) return primaryAccountId;
  if (acc.type === "Holding") return acc.id;
  return acc.holdingId ?? acc.id;
}

function resolveOpportunitiesForPlan(
  plan: AccountPlan,
  opportunities: Opportunity[],
): Opportunity[] {
  const linked = plan.opportunityIds
    .map((id) => opportunities.find((o) => o.id === id))
    .filter((o): o is Opportunity => Boolean(o));
  if (linked.length > 0) return linked;
  return [];
}

type Props = {
  openPlanId?: string | null;
  onOpenPlanConsumed?: () => void;
  /** Affiché dans l’onglet Dashboard — sans double titre de page. */
  embedded?: boolean;
  /** table = menu latéral ; kanban = dashboard par trimestres. */
  layout?: "table" | "kanban";
};

export default function AccountPlanPage({
  openPlanId = null,
  onOpenPlanConsumed,
  embedded = false,
  layout = "table",
}: Props) {
  const { activePlans, getPlanForOpportunity, getPlanForAccount, upsertPlan } =
    useAccountPlans();
  const { activeOpportunities } = useOpportunities();
  const { activeAccounts } = useDomain();
  const { soldSolutions } = useSales();
  const { solutionLabel, salesTaxonomy, kpiClassifier } = useOrgConfig();

  const [detailId, setDetailId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createAccountId, setCreateAccountId] = useState("");
  const [selectedOppIds, setSelectedOppIds] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({
    q: "",
    status: "",
    accountId: "",
    overdue: "",
  });

  useEffect(() => {
    if (!openPlanId) return;
    setDetailId(openPlanId);
    onOpenPlanConsumed?.();
  }, [openPlanId, onOpenPlanConsumed]);

  const planRows = useMemo(() => {
    return activePlans
      .map((plan) => {
        const opps = resolveOpportunitiesForPlan(plan, activeOpportunities);
        const entreprise =
          activeAccounts.find((a) => a.id === plan.accountId) ?? null;
        const groupe = entreprise?.holdingId
          ? (activeAccounts.find((a) => a.id === entreprise.holdingId) ?? null)
          : null;
        const lines = entreprise
          ? salesForAccountScope(
              entreprise.id,
              soldSolutions,
              activeAccounts,
            )
          : [];
        const accountOpps = entreprise
          ? opportunitiesForAccountScope(
              entreprise.id,
              activeOpportunities,
              activeAccounts,
            )
          : [];
        const kpis = aggregateKpis(
          lines,
          entreprise?.name ?? plan.accountId,
          solutionLabel,
          accountOpps,
          undefined,
          salesTaxonomy,
        );
        const equipPct = equipRatePct(kpis.billedAmount, kpis.targetAmount);
        const potential =
          kpis.potentialAmount + kpis.whitespaceAmount;
        return {
          plan,
          opps,
          holding: entreprise,
          groupe,
          equipPct,
          potential,
        };
      })
      .filter(({ plan, opps, holding, groupe }) => {
        if (filters.status && plan.status !== filters.status) return false;
        if (filters.accountId && plan.accountId !== filters.accountId) {
          return false;
        }
        if (filters.overdue === "yes" && !isPlanOverdue(plan)) return false;
        if (filters.overdue === "no" && isPlanOverdue(plan)) return false;
        const oppNames = opps.map((o) => o.name).join(" ");
        return matchesQuery(
          filters.q ?? "",
          holding?.name,
          groupe?.name,
          oppNames,
          plan.owner,
          plan.vision,
          plan.status,
        );
      })
      .sort((a, b) => {
        const byName = (a.holding?.name ?? "").localeCompare(
          b.holding?.name ?? "",
          "fr",
        );
        if (byName !== 0) return byName;
        return (a.plan.dueDate || "").localeCompare(b.plan.dueDate || "");
      });
  }, [
    activePlans,
    activeOpportunities,
    activeAccounts,
    soldSolutions,
    solutionLabel,
    salesTaxonomy,
    filters,
  ]);

  const entreprises = useMemo(
    () =>
      activeAccounts
        .filter((a) => a.type === "Entreprise")
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [activeAccounts],
  );

  const entreprisesWithoutPlan = useMemo(
    () => entreprises.filter((a) => !getPlanForAccount(a.id)),
    [entreprises, getPlanForAccount, activePlans],
  );

  const plansByQuarter = useMemo(() => {
    return groupByPlanQuarters({
      items: planRows,
      getDate: (r) => planProjectionDate(r.plan, r.opps),
      getAmount: (r) => planOpportunitiesAmount(r.opps),
      years: 3,
    });
  }, [planRows]);

  const oppsWithoutPlan = activeOpportunities.filter((o) => {
    if (getPlanForOpportunity(o.id)) return false;
    const acc = activeAccounts.find((a) => a.id === o.primaryAccountId);
    return acc?.type === "Entreprise";
  });

  const creatableOpps = useMemo(() => {
    if (!createAccountId) return [];
    return oppsWithoutPlan.filter((o) => o.primaryAccountId === createAccountId);
  }, [oppsWithoutPlan, createAccountId]);

  function toggleOpp(id: string) {
    setSelectedOppIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    const fd = new FormData(e.currentTarget);
    const dueDate = String(fd.get("dueDate") ?? "");
    const accountId = String(fd.get("accountId") ?? createAccountId ?? "");
    if (!accountId || !dueDate) return;
    const entreprise = activeAccounts.find((a) => a.id === accountId);
    if (!entreprise || entreprise.type !== "Entreprise") return;
    if (getPlanForAccount(accountId)) {
      setCreateError(
        "Cette entreprise a déjà un account plan actif — ouvre-le pour y rattacher des opportunités.",
      );
      return;
    }
    const opps = selectedOppIds
      .map((id) => activeOpportunities.find((o) => o.id === id))
      .filter((o): o is Opportunity => Boolean(o));
    if (opps.some((o) => o.primaryAccountId !== accountId)) return;
    if (opps.some((o) => getPlanForOpportunity(o.id))) return;
    try {
      const id = upsertPlan({
        opportunityIds: opps.map((o) => o.id),
        accountId,
        startDate: new Date().toISOString().slice(0, 10),
        dueDate,
        status: "Todo",
        vision: "",
        objectives: [],
      });
      setCreating(false);
      setCreateAccountId("");
      setSelectedOppIds([]);
      setCreateError(null);
      setDetailId(id);
    } catch (err) {
      setCreateError(
        err instanceof Error
          ? err.message
          : "Impossible de créer l’account plan.",
      );
    }
  }

  if (detailId) {
    return (
      <AccountPlanDetailPage
        planId={detailId}
        onBack={() => setDetailId(null)}
      />
    );
  }

  return (
    <div
      className={`data-page account-plan-page${embedded ? " is-embedded" : ""}`}
    >
      <header className="data-page-head">
        <div>
          {embedded ? <h2>Account plans</h2> : <h1>Account plans</h1>}
        </div>
        <button
          type="button"
          className="primary-cta"
          onClick={() => {
            const defaultAccountId = entreprisesWithoutPlan[0]?.id ?? "";
            setCreateAccountId(defaultAccountId);
            setSelectedOppIds([]);
            setCreateError(null);
            setCreating(true);
          }}
          disabled={entreprisesWithoutPlan.length === 0}
          title={
            entreprises.length === 0
              ? "Crée d’abord une entreprise"
              : entreprisesWithoutPlan.length === 0
                ? "Toutes les entreprises ont déjà un account plan"
                : undefined
          }
        >
          Créer un account plan
        </button>
      </header>

      <SearchFilterBar
        values={filters}
        onChange={(id, value) =>
          setFilters((prev) => ({ ...prev, [id]: value }))
        }
        resultCount={planRows.length}
        resultLabel="plan"
        fields={[
          {
            id: "q",
            kind: "search",
            placeholder: "Rechercher par nom d’entreprise…",
          },
          {
            id: "status",
            kind: "select",
            label: "Statut",
            options: PLAN_STATUSES.map((s) => ({
              value: s.id,
              label: s.label,
            })),
          },
          {
            id: "accountId",
            kind: "select",
            label: "Entreprise",
            options: entreprises.map((a) => ({
              value: a.id,
              label: a.name,
            })),
          },
          {
            id: "overdue",
            kind: "select",
            label: "Retard",
            options: [
              { value: "yes", label: "En retard" },
              { value: "no", label: "À jour" },
            ],
          },
        ]}
      />

      {creating && (
        <div
          className="plan-create-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-create-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setCreating(false);
              setCreateAccountId("");
              setSelectedOppIds([]);
              setCreateError(null);
            }
          }}
        >
          <form className="plan-create-dialog" onSubmit={handleCreate}>
            <h2 id="plan-create-title">Nouveau account plan</h2>
            {entreprisesWithoutPlan.length === 0 ? (
              <p className="muted">
                {entreprises.length === 0
                  ? "Crée d’abord une entreprise."
                  : "Toutes les entreprises ont déjà un account plan actif."}
              </p>
            ) : (
              <>
                <label>
                  Entreprise
                  <select
                    name="accountId"
                    required
                    value={createAccountId}
                    onChange={(e) => {
                      setCreateAccountId(e.target.value);
                      setSelectedOppIds([]);
                      setCreateError(null);
                    }}
                  >
                    <option value="" disabled>
                      Choisir…
                    </option>
                    {entreprisesWithoutPlan.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Échéance du plan
                  <input
                    name="dueDate"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </label>
                <fieldset className="plan-opp-checklist">
                  <legend>Opportunités (optionnel)</legend>
                  {creatableOpps.length === 0 ? (
                    <p className="muted">
                      Aucune opportunité libre pour cette entreprise — tu pourras
                      en rattacher depuis la fiche du plan.
                    </p>
                  ) : (
                    creatableOpps.map((o) => {
                      const hid = holdingIdFromOpportunityAccount(
                        o.primaryAccountId,
                        activeAccounts,
                      );
                      const h = activeAccounts.find((a) => a.id === hid);
                      const entreprise = activeAccounts.find(
                        (a) => a.id === o.primaryAccountId,
                      );
                      return (
                        <label key={o.id} className="plan-opp-check">
                          <input
                            type="checkbox"
                            checked={selectedOppIds.includes(o.id)}
                            onChange={() => toggleOpp(o.id)}
                          />
                          <span>
                            <strong>{o.name}</strong>
                            <span className="meta">
                              {entreprise?.name ?? o.primaryAccountId}
                              {h && h.id !== entreprise?.id ? ` · ${h.name}` : ""}
                              {" · "}
                              {formatEur(o.amount)}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </fieldset>
                {createError ? (
                  <p className="entry-error" role="alert">
                    {createError}
                  </p>
                ) : null}
              </>
            )}
            <div className="plan-create-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setCreating(false);
                  setCreateAccountId("");
                  setSelectedOppIds([]);
                  setCreateError(null);
                }}
              >
                Annuler
              </button>
              {entreprisesWithoutPlan.length > 0 && (
                <button type="submit" className="primary-cta">
                  Créer et ouvrir
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {layout === "kanban" ? (
        <section
          className="plan-quarter-kanban"
          aria-label="Account plans par trimestre"
        >
          {planRows.length === 0 ? (
            <p className="muted">Aucun account plan.</p>
          ) : (
            <div className="kanban-board kanban-board-quarters">
              {plansByQuarter.map((col) => (
                <div
                  key={col.id}
                  className={`kanban-col kanban-col-quarter${
                    col.items.length === 0 ? " is-empty" : ""
                  }${col.id === "_past" || col.id === "_later" ? " is-edge" : ""}`}
                >
                  <header>
                    <strong title={col.labelLong}>{col.label}</strong>
                    <span>{col.items.length}</span>
                  </header>
                  <p className="kanban-col-total">
                    {col.totalAmount > 0 ? formatEur(col.totalAmount) : "—"}
                  </p>
                  <ul>
                    {col.items.length === 0 && (
                      <li className="kanban-empty muted">—</li>
                    )}
                    {col.items.map(({ plan: p, opps, holding: h, groupe }) => {
                      const amount = planOpportunitiesAmount(opps);
                      const proj = planProjectionDate(p, opps);
                      const title =
                        opps.length === 0
                          ? (h?.name ?? "Account plan")
                          : opps.length === 1
                            ? opps[0].name
                            : `${opps[0].name} +${opps.length - 1}`;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            className={`kanban-card${
                              isPlanOverdue(p) ? " overdue" : ""
                            }`}
                            onClick={() => setDetailId(p.id)}
                          >
                            <strong>{title}</strong>
                            <span className="kanban-amount">
                              {formatEur(amount)}
                            </span>
                            <span
                              className={
                                isPlanOverdue(p)
                                  ? "kanban-due late"
                                  : "kanban-due"
                              }
                            >
                              Close {proj || "—"}
                              {isPlanOverdue(p) ? " · retard" : ""}
                            </span>
                            {h ? (
                              <span className="kanban-meta">
                                {h.name}
                                {groupe ? ` · ${groupe.name}` : ""}
                                {opps.length > 1
                                  ? ` · ${opps.length} opps`
                                  : ""}
                              </span>
                            ) : null}
                            {opps.length > 0 && (
                              <div className="kanban-opp-scores">
                                {opps.map((o) => (
                                  <div
                                    key={o.id}
                                    className="kanban-opp-score-row"
                                  >
                                    {opps.length > 1 ? (
                                      <span className="kanban-opp-name">
                                        {o.name}
                                      </span>
                                    ) : null}
                                    <OppScorePills
                                      opportunity={o}
                                      compact
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
      <section
        className="entry-subsection"
        aria-label="Liste des account plans"
      >
        {planRows.length === 0 ? (
          <p className="muted">Aucun account plan.</p>
        ) : (
          <div className="ecosystem-table-wrap account-plan-table-wrap">
            <table className="ecosystem-table account-plan-table">
              <thead>
                <tr>
                  <th>Entreprise</th>
                  <th>Groupe</th>
                  <th>Statut</th>
                  <th>Échéance</th>
                  <th>Montant opps. en cours</th>
                  <th>Opportunités</th>
                </tr>
              </thead>
              <tbody>
                {planRows.map(
                  ({
                    plan,
                    opps,
                    holding,
                    groupe,
                  }) => {
                  const amount = planOpportunitiesAmount(
                    opps.filter((o) =>
                      kpiClassifier.isPipelineOpportunityPhase(o.phase),
                    ),
                  );
                  const statusLabel =
                    PLAN_STATUSES.find((s) => s.id === plan.status)?.label ??
                    plan.status;
                  const overdue = isPlanOverdue(plan);

                  return (
                    <tr
                      key={plan.id}
                      className={`account-plan-row${
                        overdue ? " is-overdue" : ""
                      }`}
                      tabIndex={0}
                      onClick={() => setDetailId(plan.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDetailId(plan.id);
                        }
                      }}
                    >
                      <td>
                        <strong>
                          {holding?.name ?? "Entreprise inconnue"}
                        </strong>
                      </td>
                      <td>{groupe?.name ?? "—"}</td>
                      <td>
                        <span
                          className={`plan-status-chip status-${plan.status.toLowerCase()}`}
                        >
                          {statusLabel}
                        </span>
                        {overdue && (
                          <span className="tag-late">En retard</span>
                        )}
                      </td>
                      <td>
                        <time dateTime={plan.dueDate || undefined}>
                          {plan.dueDate || "—"}
                        </time>
                      </td>
                      <td className="num">
                        {amount > 0 ? formatEur(amount) : "—"}
                      </td>
                      <td>
                        {opps.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <>
                            <span>
                              {opps.length}{" "}
                              {opps.length > 1
                                ? "opportunités"
                                : "opportunité"}
                            </span>
                            <span className="meta">
                              {opps.map((o) => o.name).join(" · ")}
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}
    </div>
  );
}
