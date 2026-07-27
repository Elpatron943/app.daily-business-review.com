import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ActionStatus = "Todo" | "Doing" | "Done";

/** Statut du plan (colonnes trimestrielles). */
export type PlanStatus = ActionStatus;

export const PLAN_STATUSES: { id: PlanStatus; label: string }[] = [
  { id: "Todo", label: "À faire" },
  { id: "Doing", label: "En cours" },
  { id: "Done", label: "Terminé" },
];

export type ObjectiveStatus =
  | "NotStarted"
  | "InProgress"
  | "Achieved"
  | "Cancelled"
  | "Deferred";

export const OBJECTIVE_STATUSES: {
  id: ObjectiveStatus;
  label: string;
}[] = [
  { id: "NotStarted", label: "Non démarré" },
  { id: "InProgress", label: "En cours" },
  { id: "Achieved", label: "Atteint" },
  { id: "Cancelled", label: "Annulé" },
  { id: "Deferred", label: "Reporté" },
];

export type PlanObjective = {
  id: string;
  label: string;
  status: ObjectiveStatus;
};

export type PlanAction = {
  id: string;
  title: string;
  dueDate?: string;
  owner?: string;
  status: ActionStatus;
};

export type AccountPlan = {
  id: string;
  /**
   * Opportunités rattachées au plan (même entreprise).
   * Une opportunité n’appartient qu’à un seul plan actif.
   * Peut être vide : le plan vit sur l’entreprise.
   */
  opportunityIds: string[];
  /**
   * Entreprise propriétaire du plan (pas un Groupe).
   * Les indicateurs Groupe = somme des entreprises filles.
   */
  accountId: string;
  /** Début du plan. */
  startDate: string;
  /** Échéance du plan (obligatoire). */
  dueDate: string;
  /** Progression du plan. */
  status: PlanStatus;
  /** Owner du plan. */
  owner?: string;
  /**
   * @deprecated Ignoré — la cible = cumul des montants des opportunités liées.
   */
  revenueTarget?: number;
  vision: string;
  objectives: PlanObjective[];
  actions: PlanAction[];
  active: boolean;
};

/** Normalise l’ancien champ `opportunityId` → `opportunityIds`. */
export function normalizeOpportunityIds(
  plan: Partial<AccountPlan> & { opportunityId?: string },
): string[] {
  if (Array.isArray(plan.opportunityIds) && plan.opportunityIds.length > 0) {
    return [...new Set(plan.opportunityIds.filter(Boolean))];
  }
  if (typeof plan.opportunityId === "string" && plan.opportunityId) {
    return [plan.opportunityId];
  }
  return [];
}

/** Migre `holdingId` legacy → `accountId` entreprise. */
export function normalizePlanAccountId(
  plan: Partial<AccountPlan> & {
    holdingId?: string;
    opportunityId?: string;
  },
  opportunities: { id: string; primaryAccountId: string }[] = [],
): string {
  if (typeof plan.accountId === "string" && plan.accountId) {
    return plan.accountId;
  }
  const oppIds = normalizeOpportunityIds(plan);
  for (const oid of oppIds) {
    const opp = opportunities.find((o) => o.id === oid);
    if (opp?.primaryAccountId) return opp.primaryAccountId;
  }
  // Seed historique : plan Acme → entreprise FR
  if (plan.holdingId === "hold-acme") return "fr";
  if (typeof plan.holdingId === "string" && plan.holdingId) {
    return plan.holdingId;
  }
  return "fr";
}

export function planHasOpportunity(
  plan: AccountPlan,
  opportunityId: string,
): boolean {
  return plan.opportunityIds.includes(opportunityId);
}

export type HealthStatus = "Weak" | "Fair" | "Strong";

export type AccountHealth = {
  score: number;
  status: HealthStatus;
  message: string;
};

export const ACCOUNT_PLANS_STORAGE_KEY = "powermap.accountPlans.v1";

type StoredState = {
  plans: AccountPlan[];
};

const defaultPlans: AccountPlan[] = [
  {
    id: "plan-acme",
    opportunityIds: ["opp-acme-renewal"],
    accountId: "fr",
    startDate: "2026-04-01",
    dueDate: "2026-09-30",
    status: "Doing",
    owner: "AE",
    vision:
      "Devenir le partenaire plateforme de référence du groupe Acme en Europe d’ici 18 mois — standardiser Platform EU et ouvrir Analytics.",
    objectives: [
      {
        id: "pobj-1",
        label: "Renouveler Platform EU sur FR + DE",
        status: "InProgress",
      },
      {
        id: "pobj-2",
        label: "Engager l’Economic Buyer groupe",
        status: "Achieved",
      },
      {
        id: "pobj-3",
        label: "Ouvrir Analytics Suite sur Acme France",
        status: "NotStarted",
      },
    ],
    actions: [
      {
        id: "pact-1",
        title: "Workshop architecture avec IT DE",
        dueDate: "2026-06-15",
        owner: "AE",
        status: "Doing",
      },
      {
        id: "pact-2",
        title: "Brief budget Q3 avec Finance Groupe",
        dueDate: "2026-07-01",
        owner: "AE",
        status: "Todo",
      },
      {
        id: "pact-3",
        title: "Cartographier Procurement groupe",
        dueDate: "2026-05-01",
        owner: "SE",
        status: "Todo",
      },
    ],
    active: true,
  },
];

function defaultDueDate(monthsAhead = 3): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsAhead);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function migrateObjective(
  o: PlanObjective & { done?: boolean; status?: ObjectiveStatus },
): PlanObjective {
  const status: ObjectiveStatus =
    o.status ??
    (o.done ? "Achieved" : "NotStarted");
  return {
    id: o.id,
    label: o.label,
    status: OBJECTIVE_STATUSES.some((s) => s.id === status)
      ? status
      : "NotStarted",
  };
}

export function countObjectivesByStatus(
  objectives: PlanObjective[],
): Record<ObjectiveStatus | "all", number> {
  const counts: Record<ObjectiveStatus | "all", number> = {
    all: objectives.length,
    NotStarted: 0,
    InProgress: 0,
    Achieved: 0,
    Cancelled: 0,
    Deferred: 0,
  };
  for (const o of objectives) {
    counts[o.status] += 1;
  }
  return counts;
}

export function planDurationDays(startDate: string, dueDate: string): number {
  if (!startDate || !dueDate) return 0;
  const a = new Date(startDate).getTime();
  const b = new Date(dueDate).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function load(): StoredState {
  try {
    const raw = localStorage.getItem(ACCOUNT_PLANS_STORAGE_KEY);
    if (!raw) {
      return { plans: structuredClone(defaultPlans) };
    }
    const parsed = JSON.parse(raw) as StoredState;
    const plans = (parsed.plans?.length ? parsed.plans : defaultPlans).map(
      (p) => {
        const legacy = p as AccountPlan & {
          opportunityId?: string;
          holdingId?: string;
        };
        const opportunityIds = normalizeOpportunityIds(legacy);
        if (opportunityIds.length === 0 && (!legacy.accountId || legacy.holdingId === "hold-acme")) {
          opportunityIds.push("opp-acme-renewal");
        }
        const accountId = normalizePlanAccountId({
          ...legacy,
          opportunityIds,
        });
        const dueDate = p.dueDate || defaultDueDate();
        const {
          opportunityId: _legacyOpp,
          holdingId: _legacyHold,
          revenueTarget: _legacyTarget,
          ...rest
        } = legacy;
        void _legacyOpp;
        void _legacyHold;
        void _legacyTarget;
        return {
          ...rest,
          opportunityIds,
          accountId,
          startDate: p.startDate || todayIso(),
          dueDate,
          status: (p.status as PlanStatus) || "Todo",
          owner: p.owner || undefined,
          active: p.active !== false,
          vision: p.vision ?? "",
          objectives: (p.objectives ?? []).map((o) =>
            migrateObjective(o as PlanObjective & { done?: boolean }),
          ),
          actions: (p.actions ?? []).map((a) => ({
            ...a,
            status: a.status ?? "Todo",
          })),
        };
      },
    );
    return { plans };
  } catch {
    return { plans: structuredClone(defaultPlans) };
  }
}

function persist(state: StoredState) {
  localStorage.setItem(ACCOUNT_PLANS_STORAGE_KEY, JSON.stringify(state));
}

export type HealthInput = {
  plan: AccountPlan | null;
  billedAmount: number;
  targetAmount: number;
  contactCount: number;
  whiteSpaceCount: number;
};

/** Santé compte dérivée (non persistée). */
export function computeAccountHealth(input: HealthInput): AccountHealth {
  const {
    plan,
    billedAmount,
    targetAmount,
    contactCount,
    whiteSpaceCount,
  } = input;

  let score = 0;

  // Couverture CA / cible — max 35
  if (targetAmount > 0) {
    score += Math.min(35, Math.round((billedAmount / targetAmount) * 35));
  } else {
    score += 10;
  }

  // Couverture contacts — max 15
  if (contactCount >= 5) score += 15;
  else if (contactCount >= 2) score += 10;
  else if (contactCount >= 1) score += 5;

  // Contenu + progression du plan — max 40
  if (plan && plan.active) {
    if (plan.vision.trim()) score += 5;
    if (plan.objectives.some((o) => o.label.trim())) score += 10;
    if (plan.actions.some((a) => a.title.trim())) score += 10;
    const objs = plan.objectives.filter((o) => o.label.trim());
    if (objs.length > 0) {
      const done = objs.filter((o) => o.status === "Achieved").length;
      score += Math.round((done / objs.length) * 10);
    }
    const acts = plan.actions.filter((a) => a.title.trim());
    if (acts.length > 0) {
      const done = acts.filter((a) => a.status === "Done").length;
      score += Math.round((done / acts.length) * 5);
    }
  }

  // Pénalité white space élevé — max -10
  if (whiteSpaceCount >= 3) score -= 10;
  else if (whiteSpaceCount >= 1) score -= 5;

  score = Math.max(0, Math.min(100, score));

  let status: HealthStatus;
  if (score < 40) status = "Weak";
  else if (score < 70) status = "Fair";
  else status = "Strong";

  let message: string;
  if (!plan?.active) {
    message = "Pas de plan stratégique";
  } else if (status === "Strong") {
    message = "Compte bien engagé";
  } else if (status === "Fair") {
    message = "Plan en cours — à consolider";
  } else {
    message = "Compte sous-exploité";
  }

  return { score, status, message };
}

export function isActionOverdue(
  action: PlanAction,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  return action.status !== "Done" && !!action.dueDate && action.dueDate < today;
}

export function isPlanOverdue(
  plan: AccountPlan,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  return plan.status !== "Done" && !!plan.dueDate && plan.dueDate < today;
}

export type OverdueActionAlert = {
  planId: string;
  /** Première opportunité liée (affichage). */
  opportunityId: string;
  opportunityIds: string[];
  accountId: string;
  action: PlanAction;
};

export function collectOverdueActions(
  plans: AccountPlan[],
  today = new Date().toISOString().slice(0, 10),
): OverdueActionAlert[] {
  const out: OverdueActionAlert[] = [];
  for (const plan of plans.filter((p) => p.active)) {
    for (const action of plan.actions) {
      if (isActionOverdue(action, today)) {
        out.push({
          planId: plan.id,
          opportunityId: plan.opportunityIds[0] ?? "",
          opportunityIds: plan.opportunityIds,
          accountId: plan.accountId,
          action,
        });
      }
    }
  }
  return out.sort((a, b) =>
    (a.action.dueDate ?? "").localeCompare(b.action.dueDate ?? ""),
  );
}

/** Solutions catalogue actives absentes du CA (white space). */
export function computeWhiteSpace(
  activeSolutionIds: string[],
  soldSolutionIdsOnScope: string[],
): string[] {
  const sold = new Set(soldSolutionIdsOnScope);
  return activeSolutionIds.filter((id) => !sold.has(id));
}

/** Contacts d’un holding + entreprises filles (indicateurs groupe). */
export function contactsOnHolding(
  holdingId: string,
  accounts: { id: string; holdingId: string | null; type: string }[],
  contacts: { accountId: string; active?: boolean }[],
): number {
  const ids = new Set<string>([holdingId]);
  for (const a of accounts) {
    if (a.holdingId === holdingId) ids.add(a.id);
  }
  return contacts.filter((c) => c.active !== false && ids.has(c.accountId))
    .length;
}

/** Contacts d’une entreprise seule. */
export function contactsOnAccount(
  accountId: string,
  contacts: { accountId: string; active?: boolean }[],
): number {
  return contacts.filter(
    (c) => c.active !== false && c.accountId === accountId,
  ).length;
}

type AccountPlanContextValue = {
  plans: AccountPlan[];
  activePlans: AccountPlan[];
  getPlanForOpportunity: (opportunityId: string) => AccountPlan | null;
  getPlanForAccount: (accountId: string) => AccountPlan | null;
  /** Plans des entreprises rattachées au groupe (agrégation lecture). */
  getPlansForHolding: (holdingId: string, childAccountIds: string[]) => AccountPlan[];
  upsertPlan: (
    input: Omit<AccountPlan, "id" | "active"> & { id?: string },
  ) => string;
  /**
   * Rattache une opportunité à un plan (ou aucun / nouveau).
   * Retire l’opp des autres plans actifs en une seule écriture.
   */
  assignOpportunityToPlan: (
    opportunityId: string,
    planId: string | null | "new",
    opts?: {
      accountId?: string;
      dueDate?: string;
    },
  ) => string | null;
  updatePlan: (id: string, patch: Partial<AccountPlan>) => void;
  removePlan: (id: string) => void;
  addObjective: (planId: string, label: string) => void;
  updateObjective: (
    planId: string,
    objectiveId: string,
    patch: Partial<PlanObjective>,
  ) => void;
  removeObjective: (planId: string, objectiveId: string) => void;
  addAction: (
    planId: string,
    input: Omit<PlanAction, "id" | "status"> & { status?: ActionStatus },
  ) => void;
  updateAction: (
    planId: string,
    actionId: string,
    patch: Partial<PlanAction>,
  ) => void;
  removeAction: (planId: string, actionId: string) => void;
};

const AccountPlanContext = createContext<AccountPlanContextValue | null>(null);

export function AccountPlanProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredState>(() => load());

  const commit = useCallback((next: StoredState) => {
    setState(next);
    persist(next);
  }, []);

  const activePlans = useMemo(
    () => state.plans.filter((p) => p.active),
    [state.plans],
  );

  const getPlanForOpportunity = useCallback(
    (opportunityId: string) =>
      activePlans.find((p) => planHasOpportunity(p, opportunityId)) ?? null,
    [activePlans],
  );

  const getPlanForAccount = useCallback(
    (accountId: string) =>
      activePlans.find((p) => p.accountId === accountId) ?? null,
    [activePlans],
  );

  const getPlansForHolding = useCallback(
    (_holdingId: string, childAccountIds: string[]) => {
      const ids = new Set(childAccountIds);
      return activePlans.filter((p) => ids.has(p.accountId));
    },
    [activePlans],
  );

  const upsertPlan = useCallback(
    (input: Omit<AccountPlan, "id" | "active"> & { id?: string }) => {
      const opportunityIds = normalizeOpportunityIds(input);
      const accountId =
        input.accountId ||
        normalizePlanAccountId({ ...input, opportunityIds });
      if (!accountId) {
        throw new Error(
          "Un account plan doit être rattaché à une entreprise.",
        );
      }
      const idSet = new Set(opportunityIds);
      const existing = state.plans.find(
        (p) =>
          p.active &&
          normalizeOpportunityIds(p).some((id) => idSet.has(id)),
      );
      if (existing && !input.id) {
        commit({
          plans: state.plans.map((p) =>
            p.id === existing.id
              ? {
                  ...p,
                  opportunityIds: [
                    ...new Set([
                      ...normalizeOpportunityIds(p),
                      ...opportunityIds,
                    ]),
                  ],
                  accountId: accountId || p.accountId,
                  startDate: input.startDate || p.startDate,
                  dueDate: input.dueDate || p.dueDate,
                  status: input.status ?? p.status,
                  owner: input.owner ?? p.owner,
                  vision: input.vision ?? p.vision,
                  objectives: input.objectives ?? p.objectives,
                  actions: input.actions ?? p.actions,
                }
              : p,
          ),
        });
        return existing.id;
      }
      if (input.id) {
        commit({
          plans: state.plans.map((p) =>
            p.id === input.id
              ? {
                  ...p,
                  ...input,
                  opportunityIds,
                  accountId,
                  id: p.id,
                  active: true,
                }
              : p,
          ),
        });
        return input.id;
      }
      const id = uid("plan");
      const plan: AccountPlan = {
        id,
        opportunityIds,
        accountId,
        startDate: input.startDate || todayIso(),
        dueDate: input.dueDate || defaultDueDate(),
        status: input.status ?? "Todo",
        owner: input.owner,
        vision: input.vision,
        objectives: input.objectives ?? [],
        actions: input.actions ?? [],
        active: true,
      };
      commit({
        plans: [
          ...state.plans.map((p) =>
            p.active &&
            normalizeOpportunityIds(p).some((oid) => idSet.has(oid))
              ? { ...p, active: false }
              : p,
          ),
          plan,
        ],
      });
      return id;
    },
    [commit, state.plans],
  );

  const assignOpportunityToPlan = useCallback(
    (
      opportunityId: string,
      planId: string | null | "new",
      opts?: {
        accountId?: string;
        dueDate?: string;
      },
    ) => {
      if (!opportunityId) return null;

      const withoutOpp = state.plans.map((p) =>
        p.active && normalizeOpportunityIds(p).includes(opportunityId)
          ? {
              ...p,
              opportunityIds: normalizeOpportunityIds(p).filter(
                (id) => id !== opportunityId,
              ),
            }
          : p,
      );

      if (planId === null) {
        commit({ plans: withoutOpp });
        return null;
      }

      if (planId === "new") {
        const resolvedAccountId =
          opts?.accountId ||
          state.plans.find(
            (p) =>
              p.active && normalizeOpportunityIds(p).includes(opportunityId),
          )?.accountId;
        if (!resolvedAccountId) return null;
        const id = uid("plan");
        const plan: AccountPlan = {
          id,
          opportunityIds: [opportunityId],
          accountId: resolvedAccountId,
          startDate: todayIso(),
          dueDate: opts?.dueDate || defaultDueDate(),
          status: "Todo",
          vision: "",
          objectives: [],
          actions: [],
          active: true,
        };
        commit({ plans: [...withoutOpp, plan] });
        return id;
      }

      const target = withoutOpp.find((p) => p.id === planId && p.active);
      if (!target) {
        commit({ plans: withoutOpp });
        return null;
      }
      commit({
        plans: withoutOpp.map((p) =>
          p.id === planId
            ? {
                ...p,
                opportunityIds: [...normalizeOpportunityIds(p), opportunityId],
                accountId: opts?.accountId || p.accountId,
              }
            : p,
        ),
      });
      return planId;
    },
    [commit, state.plans],
  );

  const updatePlan = useCallback(
    (id: string, patch: Partial<AccountPlan>) => {
      commit({
        plans: state.plans.map((p) =>
          p.id === id ? { ...p, ...patch, id: p.id } : p,
        ),
      });
    },
    [commit, state.plans],
  );

  const removePlan = useCallback(
    (id: string) => {
      commit({
        plans: state.plans.map((p) =>
          p.id === id ? { ...p, active: false } : p,
        ),
      });
    },
    [commit, state.plans],
  );

  const addObjective = useCallback(
    (planId: string, label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      commit({
        plans: state.plans.map((p) =>
          p.id === planId
            ? {
                ...p,
                objectives: [
                  ...p.objectives,
                  {
                    id: uid("pobj"),
                    label: trimmed,
                    status: "NotStarted",
                  },
                ],
              }
            : p,
        ),
      });
    },
    [commit, state.plans],
  );

  const updateObjective = useCallback(
    (planId: string, objectiveId: string, patch: Partial<PlanObjective>) => {
      commit({
        plans: state.plans.map((p) =>
          p.id === planId
            ? {
                ...p,
                objectives: p.objectives.map((o) =>
                  o.id === objectiveId ? { ...o, ...patch, id: o.id } : o,
                ),
              }
            : p,
        ),
      });
    },
    [commit, state.plans],
  );

  const removeObjective = useCallback(
    (planId: string, objectiveId: string) => {
      commit({
        plans: state.plans.map((p) =>
          p.id === planId
            ? {
                ...p,
                objectives: p.objectives.filter((o) => o.id !== objectiveId),
              }
            : p,
        ),
      });
    },
    [commit, state.plans],
  );

  const addAction = useCallback(
    (
      planId: string,
      input: Omit<PlanAction, "id" | "status"> & { status?: ActionStatus },
    ) => {
      const title = input.title.trim();
      if (!title) return;
      const plan = state.plans.find((p) => p.id === planId && p.active);
      if (!plan) {
        throw new Error(
          "Une action doit être rattachée à un account plan existant.",
        );
      }
      commit({
        plans: state.plans.map((p) =>
          p.id === planId
            ? {
                ...p,
                actions: [
                  ...p.actions,
                  {
                    id: uid("pact"),
                    title,
                    dueDate: input.dueDate || undefined,
                    owner: input.owner?.trim() || undefined,
                    status: input.status ?? "Todo",
                  },
                ],
              }
            : p,
        ),
      });
    },
    [commit, state.plans],
  );

  const updateAction = useCallback(
    (planId: string, actionId: string, patch: Partial<PlanAction>) => {
      commit({
        plans: state.plans.map((p) =>
          p.id === planId
            ? {
                ...p,
                actions: p.actions.map((a) =>
                  a.id === actionId ? { ...a, ...patch, id: a.id } : a,
                ),
              }
            : p,
        ),
      });
    },
    [commit, state.plans],
  );

  const removeAction = useCallback(
    (planId: string, actionId: string) => {
      commit({
        plans: state.plans.map((p) =>
          p.id === planId
            ? {
                ...p,
                actions: p.actions.filter((a) => a.id !== actionId),
              }
            : p,
        ),
      });
    },
    [commit, state.plans],
  );

  const value = useMemo(
    () => ({
      plans: state.plans,
      activePlans,
      getPlanForOpportunity,
      getPlanForAccount,
      getPlansForHolding,
      upsertPlan,
      assignOpportunityToPlan,
      updatePlan,
      removePlan,
      addObjective,
      updateObjective,
      removeObjective,
      addAction,
      updateAction,
      removeAction,
    }),
    [
      state.plans,
      activePlans,
      getPlanForOpportunity,
      getPlanForAccount,
      getPlansForHolding,
      upsertPlan,
      assignOpportunityToPlan,
      updatePlan,
      removePlan,
      addObjective,
      updateObjective,
      removeObjective,
      addAction,
      updateAction,
      removeAction,
    ],
  );

  return (
    <AccountPlanContext.Provider value={value}>
      {children}
    </AccountPlanContext.Provider>
  );
}

export function useAccountPlans() {
  const ctx = useContext(AccountPlanContext);
  if (!ctx) {
    throw new Error("useAccountPlans must be used within AccountPlanProvider");
  }
  return ctx;
}
