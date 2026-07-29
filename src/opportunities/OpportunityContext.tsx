import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/AuthContext";
import type {
  BoFieldDef,
  OppMappingCardEntry,
  OppMappingCategory,
  OppMappingChecks,
} from "../config/types";
import { defaultConfig } from "../config/defaults";
import type { Status } from "../data";
import { ENGAGEMENT_STATUSES } from "../data";
import { supabase } from "../supabase/client";
import {
  loadOrgOpportunities,
  logSyncError,
  upsertOpportunitiesRemote,
  upsertOpportunityRemote,
} from "../sync";
import type {
  ProcessAnswer,
  ProcessAnswerStatus,
  ProcessAnswers,
} from "./salesProcess";

export const OPPORTUNITY_PHASES = [
  "Whitespace",
  "Discovery",
  "Solution Validation",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
] as const;

/** Nature du deal : upsell, cross-sell, renouvellement, nouveau logo groupe, prospect. */
export type OpportunityKind = string;

export const OPPORTUNITY_KINDS: OpportunityKind[] = [
  "up",
  "cross",
  "renewal",
  "new_in_group",
  "prospect",
];

export const opportunityKindLabel: Record<string, string> = {
  up: "Upsell",
  cross: "Cross-sell",
  renewal: "Renouvellement",
  new_in_group: "Nouveau compte dans le groupe",
  prospect: "Prospect",
};

export function isOpportunityKind(v: unknown): v is OpportunityKind {
  return typeof v === "string" && v.length > 0;
}

/** Valeurs du calculateur — clés = id des champs admin (OrgConfig.boFields). */
export type BusinessOutcomeValues = Record<string, number>;

export type BusinessOutcomeResults = {
  annualSavings: number;
  annualBenefit: number;
  totalBenefit: number;
  netValue: number;
  investment: number;
  horizonYears: number;
  roiPct: number | null;
  paybackMonths: number | null;
};

export function defaultBusinessOutcomeValues(
  fields: BoFieldDef[] = defaultConfig.boFields,
): BusinessOutcomeValues {
  const values: BusinessOutcomeValues = {};
  for (const f of fields) {
    if (!f.active) continue;
    values[f.id] =
      f.defaultValue ?? (f.kind === "horizon" ? 3 : 0);
  }
  return values;
}

/** Migre l’ancien format objet fixe vers Record. */
export function migrateBusinessOutcomes(
  raw: unknown,
  fields: BoFieldDef[],
): BusinessOutcomeValues {
  const base = defaultBusinessOutcomeValues(fields);
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const next = { ...base };
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number" && !Number.isNaN(v)) next[k] = v;
  }
  return next;
}

export function computeBusinessOutcomes(
  values: BusinessOutcomeValues,
  fields: BoFieldDef[],
): BusinessOutcomeResults {
  const active = fields.filter((f) => f.active);
  const sum = (kind: BoFieldDef["kind"]) =>
    active
      .filter((f) => f.kind === kind)
      .reduce((a, f) => a + (Number(values[f.id]) || 0), 0);

  const current = sum("current_cost");
  const future = sum("future_cost");
  const annualSavings = Math.max(0, current - future);
  const annualBenefit =
    annualSavings + sum("annual_benefit") - sum("annual_cost");
  const investment = sum("one_time");
  const horizonField = active.find((f) => f.kind === "horizon");
  const horizonYears = Math.max(
    1,
    horizonField ? Number(values[horizonField.id]) || 1 : 3,
  );
  const totalBenefit = annualBenefit * horizonYears;
  const netValue = totalBenefit - investment;

  let roiPct: number | null = null;
  if (investment > 0) {
    roiPct = Math.round((netValue / investment) * 1000) / 10;
  }

  let paybackMonths: number | null = null;
  if (annualBenefit > 0 && investment > 0) {
    paybackMonths = Math.round((investment / annualBenefit) * 12 * 10) / 10;
  } else if (investment <= 0 && annualBenefit > 0) {
    paybackMonths = 0;
  }

  return {
    annualSavings,
    annualBenefit,
    totalBenefit,
    netValue,
    investment,
    horizonYears,
    roiPct,
    paybackMonths,
  };
}

export type OpportunityVariableValues = Record<
  string,
  string | number | boolean
>;

/** Engagement d’un contact sur une opportunité donnée. */
export type OpportunityStakeholder = {
  contactId: string;
  /** Type de contact sur ce deal (catalogue contactTypes). */
  role: string;
  status: Status;
  notes?: string;
};

export type OpportunityAiRecommendations = {
  updatedAt: string;
  content: string;
  model?: string;
};

export function isEngagementStatus(v: unknown): v is Status {
  return (
    typeof v === "string" &&
    (ENGAGEMENT_STATUSES as readonly string[]).includes(v)
  );
}

/** Lit les anciens Contact.role pour migrer vers le stakeholder. */
function legacyContactRoles(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const raw = localStorage.getItem("powermap.domain.v1");
    if (!raw) return map;
    const parsed = JSON.parse(raw) as {
      contacts?: { id?: string; role?: string }[];
    };
    for (const c of parsed.contacts ?? []) {
      if (c?.id && typeof c.role === "string" && c.role.trim()) {
        map.set(c.id, c.role);
      }
    }
  } catch {
    /* ignore */
  }
  return map;
}

export function migrateStakeholders(
  raw: unknown,
  contactRoles?: Map<string, string>,
): OpportunityStakeholder[] {
  if (!Array.isArray(raw)) return [];
  const roles = contactRoles ?? legacyContactRoles();
  const out: OpportunityStakeholder[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const contactId = typeof o.contactId === "string" ? o.contactId : "";
    if (!contactId || seen.has(contactId)) continue;
    seen.add(contactId);
    const roleFromStake =
      typeof o.role === "string"
        ? o.role
        : typeof o.contactTypeId === "string"
          ? o.contactTypeId
          : "";
    const role = roleFromStake || roles.get(contactId) || "";
    out.push({
      contactId,
      role,
      status: isEngagementStatus(o.status) ? o.status : "Identified",
      notes: typeof o.notes === "string" ? o.notes : undefined,
    });
  }
  return out;
}

export function migrateMappingChecks(raw: unknown): OppMappingChecks {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: OppMappingChecks = {};

  const toEntries = (val: unknown): OppMappingCardEntry[] => {
    if (!Array.isArray(val)) return [];
    const entries: OppMappingCardEntry[] = [];
    const seen = new Set<string>();
    for (const item of val) {
      if (typeof item === "string") {
        if (!item || seen.has(item)) continue;
        seen.add(item);
        entries.push({ id: item, status: "open" });
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const id =
        typeof o.id === "string"
          ? o.id
          : typeof o.subtypeId === "string"
            ? o.subtypeId
            : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      let status: OppMappingCardEntry["status"] = "open";
      if (o.status === "covered" || o.status === "not_mastered" || o.status === "open") {
        status = o.status;
      } else if (o.covered === true) {
        status = "covered";
      }
      entries.push({
        id,
        status,
        comment:
          typeof o.comment === "string" && o.comment.trim()
            ? o.comment
            : undefined,
      });
    }
    return entries;
  };

  const push = (key: OppMappingCategory, entries: OppMappingCardEntry[]) => {
    if (!entries.length) return;
    const existing = out[key] ?? [];
    const seen = new Set(existing.map((e) => e.id));
    const merged = [...existing];
    for (const e of entries) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      merged.push(e);
    }
    out[key] = merged;
  };

  for (const [key, val] of Object.entries(obj)) {
    const entries = toEntries(val);
    if (!entries.length) continue;
    if (key === "pressions") {
      push("risques", entries);
    } else if (
      key === "objectif" ||
      key === "risques" ||
      key === "signaux_positifs" ||
      key === "initiatives"
    ) {
      if (key === "initiatives") {
        const toOpp = entries.filter((e) => e.id.startsWith("omap-ini-"));
        const toThreat = entries.filter((e) => !e.id.startsWith("omap-ini-"));
        push("objectif", toOpp);
        push("initiatives", toThreat);
      } else {
        push(key, entries);
      }
    }
  }
  return out;
}

function cards(...ids: string[]): OppMappingCardEntry[] {
  return ids.map((id) => ({ id, status: "open" as const }));
}

export function defaultOpportunityVariables(
  defs: import("../config/types").OppVariableDef[] = [],
): OpportunityVariableValues {
  const values: OpportunityVariableValues = {};
  for (const v of defs) {
    if (!v.active) continue;
    if (v.defaultValue !== undefined) values[v.id] = v.defaultValue;
    else if (v.kind === "number") values[v.id] = 0;
    else if (v.kind === "boolean") values[v.id] = false;
    else values[v.id] = "";
  }
  return values;
}

export type Opportunity = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  closeDate: string;
  /** Compte Entreprise (pas le Holding). */
  primaryAccountId: string;
  phase: string;
  /** Upsell / cross / nouveau compte groupe / prospect. */
  kind: OpportunityKind;
  /** Solution du catalogue org (OrgConfig.solutions). */
  solutionId: string;
  /** Modules sélectionnés (ids de SolutionDef.modules). */
  moduleIds: string[];
  /**
   * Directions adressées (catalogue org).
   * Vide = niveau entreprise (pas de direction ciblée).
   */
  directionIds: string[];
  /** Compelling Events du catalogue org (pourquoi agir maintenant). */
  compellingEventIds: string[];
  /** Variables admin (nb licences…) — surtout upsell. */
  variables: OpportunityVariableValues;
  businessOutcomes: BusinessOutcomeValues;
  /** Qualification Process (domaines / questions). */
  processAnswers: ProcessAnswers;
  /**
   * Opportunity Mapping SWOT — cartes par quadrant
   * (Forces / Faiblesses / Opportunités / Menaces).
   */
  mappingChecks: OppMappingChecks;
  /** Contacts mappés sur le deal (engagement). */
  stakeholders: OpportunityStakeholder[];
  /** Dernieres recommandations IA. */
  aiRecommendations?: OpportunityAiRecommendations | null;
  active: boolean;
  /** Gestionnaire DBR (profiles.id). */
  ownerProfileId?: string | null;
  /** Id Deal HubSpot (sync CRM). */
  hubspotDealId?: string | null;
  hubspotSyncedAt?: string | null;
  hubspotDirty?: boolean;
};

export const OPPORTUNITIES_STORAGE_KEY = "powermap.opportunities.v1";

type StoredState = {
  opportunities: Opportunity[];
  activeOpportunityId: string | null;
};

const seedValues = defaultBusinessOutcomeValues();
seedValues["bo-cost-ops"] = 120000;
seedValues["bo-cost-audits"] = 35000;
seedValues["bo-risk-cyber"] = 80000;
seedValues["bo-ops-productivity"] = 55000;
seedValues["bo-comp-audits"] = 25000;
seedValues.oneTimeInvestment = 180000;
seedValues.horizonYears = 3;

const defaultOpportunities: Opportunity[] = [
  {
    id: "opp-acme-renewal",
    name: "Acme — Platform Renewal EU",
    amount: 480000,
    currency: "EUR",
    closeDate: "2026-09-30",
    primaryAccountId: "fr",
    phase: "Solution Validation",
    kind: "renewal",
    solutionId: "sol-platform",
    moduleIds: ["mod-plt-core", "mod-plt-sso", "mod-plt-api"],
    directionIds: ["dir-fr-it"],
    compellingEventIds: ["ce-contract-renewal", "ce-cost-pressure"],
    variables: {
      "var-users": 250,
      "var-licenses": 250,
    },
    businessOutcomes: seedValues,
    processAnswers: {
      "q-ts-1": { status: "Yes", updatedAt: "2026-05-01" },
      "q-ts-2": { status: "Yes", updatedAt: "2026-05-01" },
      "q-ts-3": { status: "Yes", updatedAt: "2026-05-10" },
      "q-ts-4": { status: "Yes", updatedAt: "2026-05-12" },
      "q-tq-1": { status: "Yes", updatedAt: "2026-06-01" },
      "q-tq-2": { status: "Yes", updatedAt: "2026-06-02" },
      "q-tq-3": { status: "Yes", updatedAt: "2026-06-05" },
      "q-tq-4": { status: "Yes", updatedAt: "2026-06-08" },
      "q-req-1": {
        status: "Yes",
        note: "Stratégie concurrentielle vs Analytics Suite concurrente.",
        updatedAt: "2026-07-01",
      },
      "q-req-2": {
        status: "No",
        note: "Accès Inner Circle encore limité — s’appuyer sur le Champion FR.",
        updatedAt: "2026-07-10",
      },
      "q-req-3": { status: "Yes", updatedAt: "2026-07-12" },
      "q-req-4": { status: "No", updatedAt: "2026-07-15" },
      "q-req-5": { status: "InProgress", updatedAt: "2026-07-18" },
      "q-req-6": { status: "InProgress", updatedAt: "2026-07-20" },
      "q-ev-1": { status: "Yes", updatedAt: "2026-07-22" },
      "q-ev-2": { status: "No", updatedAt: "2026-07-22" },
    },
    mappingChecks: {
      objectif: cards(
        "omap-obj-cost",
        "omap-obj-risk",
        "omap-ini-digital",
        "omap-ini-cloud",
      ),
      risques: cards("omap-ri-comp-who", "omap-ri-stake-power"),
      signaux_positifs: cards(
        "omap-sp-stake-champion",
        "omap-sp-need-clear",
        "usp:usp-plt-core-1",
        "usp:usp-org-1",
      ),
      initiatives: cards("omap-th-comp-active", "omap-th-delay"),
    },
    stakeholders: [
      { contactId: "c1", role: "EconomicBuyer", status: "Identified" },
      { contactId: "c2", role: "Champion", status: "Aligned" },
      { contactId: "c5", role: "User", status: "Engaged" },
    ],
    active: true,
  },
];

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyStoredState(): StoredState {
  return { opportunities: [], activeOpportunityId: null };
}

function loadLocal(): StoredState {
  try {
    const raw = localStorage.getItem(OPPORTUNITIES_STORAGE_KEY);
    if (!raw) {
      return {
        opportunities: structuredClone(defaultOpportunities),
        activeOpportunityId: defaultOpportunities[0]?.id ?? null,
      };
    }
    const parsed = JSON.parse(raw) as StoredState;
    const fields = defaultConfig.boFields;
    const opportunities = (
      parsed.opportunities?.length
        ? parsed.opportunities
        : defaultOpportunities
    ).map((o) => {
      const raw = o as Opportunity & {
        directionIds?: unknown;
        directionId?: unknown;
      };
      const directionIds = Array.isArray(raw.directionIds)
        ? raw.directionIds.filter((id): id is string => typeof id === "string")
        : typeof raw.directionId === "string" && raw.directionId
          ? [raw.directionId]
          : [];
      return {
      ...o,
      active: o.active !== false,
      currency: o.currency || "EUR",
      amount: typeof o.amount === "number" ? o.amount : Number(o.amount) || 0,
      phase: o.phase || OPPORTUNITY_PHASES[0],
      kind:
        o.id === "opp-acme-renewal"
          ? "renewal"
          : isOpportunityKind(o.kind)
            ? o.kind
            : "prospect",
      solutionId: typeof o.solutionId === "string" ? o.solutionId : "",
      moduleIds: Array.isArray(o.moduleIds)
        ? o.moduleIds.filter((id): id is string => typeof id === "string")
        : [],
      directionIds,
      compellingEventIds: Array.isArray(
        (o as Opportunity).compellingEventIds,
      )
        ? (o as Opportunity).compellingEventIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      variables:
        o.variables && typeof o.variables === "object" ? o.variables : {},
      businessOutcomes: migrateBusinessOutcomes(o.businessOutcomes, fields),
      processAnswers:
        o.processAnswers && typeof o.processAnswers === "object"
          ? o.processAnswers
          : {},
      mappingChecks: migrateMappingChecks(o.mappingChecks),
      stakeholders: migrateStakeholders(
        (o as Opportunity & { stakeholders?: unknown }).stakeholders,
      ),
      aiRecommendations:
        o.aiRecommendations &&
        typeof o.aiRecommendations === "object" &&
        typeof (o.aiRecommendations as OpportunityAiRecommendations)
          .content === "string"
          ? (o.aiRecommendations as OpportunityAiRecommendations)
          : null,
    };
    });
    const activeOpportunityId =
      parsed.activeOpportunityId &&
      opportunities.some(
        (o) => o.id === parsed.activeOpportunityId && o.active,
      )
        ? parsed.activeOpportunityId
        : (opportunities.find((o) => o.active)?.id ?? null);
    return { opportunities, activeOpportunityId };
  } catch {
    return {
      opportunities: structuredClone(defaultOpportunities),
      activeOpportunityId: defaultOpportunities[0]?.id ?? null,
    };
  }
}

function persistLocal(state: StoredState) {
  localStorage.setItem(OPPORTUNITIES_STORAGE_KEY, JSON.stringify(state));
}

type OpportunityContextValue = {
  opportunities: Opportunity[];
  activeOpportunities: Opportunity[];
  activeOpportunityId: string | null;
  activeOpportunity: Opportunity | null;
  quotaError: string | null;
  clearQuotaError: () => void;
  setActiveOpportunityId: (id: string | null) => void;
  addOpportunity: (
    input: Omit<
      Opportunity,
      | "id"
      | "active"
      | "businessOutcomes"
      | "processAnswers"
      | "variables"
      | "mappingChecks"
      | "stakeholders"
      | "aiRecommendations"
      | "compellingEventIds"
      | "moduleIds"
      | "directionIds"
    > & {
      businessOutcomes?: BusinessOutcomeValues;
      processAnswers?: ProcessAnswers;
      variables?: OpportunityVariableValues;
      moduleIds?: string[];
      directionIds?: string[];
      compellingEventIds?: string[];
      mappingChecks?: Opportunity["mappingChecks"];
      stakeholders?: OpportunityStakeholder[];
    },
  ) => string | null;
  updateOpportunity: (id: string, patch: Partial<Opportunity>) => void;
  removeOpportunity: (id: string) => void;
  importOpportunitiesBatch: (
    rows: Array<{
      action: "create" | "update";
      id?: string;
      name: string;
      accountId: string;
      amount: number;
      closeDate: string;
      phase: string;
      kind: OpportunityKind;
      solutionId: string;
      mappingChecks?: Opportunity["mappingChecks"];
    }>,
  ) => { created: number; updated: number };
  setBusinessOutcomeValue: (
    opportunityId: string,
    fieldId: string,
    value: number,
  ) => void;
  setProcessAnswer: (
    opportunityId: string,
    questionId: string,
    patch: Partial<ProcessAnswer> & { status?: ProcessAnswerStatus },
  ) => void;
};

const OpportunityContext = createContext<OpportunityContextValue | null>(null);

export function OpportunityProvider({ children }: { children: ReactNode }) {
  const {
    billing,
    setActiveOpportunityCount,
    profile,
    loading: authLoading,
  } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const orgIdRef = useRef<string | null>(orgId);
  orgIdRef.current = orgId;

  const [state, setState] = useState<StoredState>(() => emptyStoredState());
  const [quotaError, setQuotaError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    (async () => {
      if (!orgId || !supabase) {
        if (!cancelled) setState(loadLocal());
        return;
      }
      try {
        const opportunities = await loadOrgOpportunities(orgId);
        if (cancelled) return;
        const next: StoredState = {
          opportunities,
          activeOpportunityId:
            opportunities.find((o) => o.active)?.id ?? null,
        };
        persistLocal(next);
        setState(next);
      } catch (err) {
        logSyncError("loadOpportunities", err);
        if (!cancelled) {
          const next = emptyStoredState();
          persistLocal(next);
          setState(next);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, orgId]);

  const pushOpportunity = useCallback((opportunity: Opportunity) => {
    const id = orgIdRef.current;
    if (!id || !supabase) return;
    void upsertOpportunityRemote(id, opportunity).catch((err) =>
      logSyncError("upsertOpportunity", err),
    );
  }, []);

  const commit = useCallback(
    (next: StoredState, syncIds?: string[]) => {
      setState(next);
      persistLocal(next);
      if (!syncIds?.length) return;
      for (const oid of syncIds) {
        const opp = next.opportunities.find((o) => o.id === oid);
        if (opp) pushOpportunity(opp);
      }
    },
    [pushOpportunity],
  );

  const activeOpportunities = useMemo(
    () => state.opportunities.filter((o) => o.active),
    [state.opportunities],
  );

  useEffect(() => {
    setActiveOpportunityCount(activeOpportunities.length);
  }, [activeOpportunities.length, setActiveOpportunityCount]);

  const clearQuotaError = useCallback(() => setQuotaError(null), []);

  const assertCanCreateOpportunity = useCallback((): string | null => {
    if (!billing.canWrite) {
      return "Abonnement en lecture seule — création d’opportunité impossible.";
    }
    if (billing.opportunitiesFull) {
      const limit = billing.usage.opportunitiesLimit;
      return `Quota d’opportunités actives atteint (${limit}). Passez à une formule supérieure.`;
    }
    return null;
  }, [billing]);

  const activeOpportunity = useMemo(
    () =>
      activeOpportunities.find((o) => o.id === state.activeOpportunityId) ??
      null,
    [activeOpportunities, state.activeOpportunityId],
  );

  const setActiveOpportunityId = useCallback(
    (id: string | null) => {
      commit({ ...state, activeOpportunityId: id });
    },
    [commit, state],
  );

  const addOpportunity = useCallback(
    (
      input: Omit<
        Opportunity,
        | "id"
        | "active"
        | "businessOutcomes"
        | "processAnswers"
        | "variables"
        | "mappingChecks"
        | "stakeholders"
        | "aiRecommendations"
        | "compellingEventIds"
        | "moduleIds"
        | "directionIds"
      > & {
        businessOutcomes?: BusinessOutcomeValues;
        processAnswers?: ProcessAnswers;
        variables?: OpportunityVariableValues;
        moduleIds?: string[];
        directionIds?: string[];
        compellingEventIds?: string[];
        mappingChecks?: Opportunity["mappingChecks"];
        stakeholders?: OpportunityStakeholder[];
      },
    ) => {
      const blocked = assertCanCreateOpportunity();
      if (blocked) {
        setQuotaError(blocked);
        return null;
      }
      setQuotaError(null);
      const id = uid("opp");
      const opportunity: Opportunity = {
        ...input,
        id,
        active: true,
        kind: input.kind ?? "prospect",
        solutionId: input.solutionId ?? "",
        moduleIds: input.moduleIds ?? [],
        directionIds: input.directionIds ?? [],
        compellingEventIds: input.compellingEventIds ?? [],
        variables: input.variables ?? {},
        businessOutcomes:
          input.businessOutcomes ?? defaultBusinessOutcomeValues(),
        processAnswers: input.processAnswers ?? {},
        mappingChecks: input.mappingChecks ?? {},
        stakeholders: migrateStakeholders(input.stakeholders ?? []),
        aiRecommendations: null,
      };
      commit(
        {
          opportunities: [...state.opportunities, opportunity],
          activeOpportunityId: id,
        },
        [id],
      );
      return id;
    },
    [assertCanCreateOpportunity, commit, state],
  );

  const updateOpportunity = useCallback(
    (id: string, patch: Partial<Opportunity>) => {
      commit(
        {
          ...state,
          opportunities: state.opportunities.map((o) =>
            o.id === id ? { ...o, ...patch, id: o.id } : o,
          ),
        },
        [id],
      );
    },
    [commit, state],
  );

  const removeOpportunity = useCallback(
    (id: string) => {
      const opportunities = state.opportunities.map((o) =>
        o.id === id ? { ...o, active: false } : o,
      );
      const activeOpportunityId =
        state.activeOpportunityId === id
          ? (opportunities.find((o) => o.active)?.id ?? null)
          : state.activeOpportunityId;
      commit({ opportunities, activeOpportunityId }, [id]);
    },
    [commit, state],
  );

  const importOpportunitiesBatch = useCallback(
    (
      rows: Array<{
        action: "create" | "update";
        id?: string;
        name: string;
        accountId: string;
        amount: number;
        closeDate: string;
        phase: string;
        kind: OpportunityKind;
        solutionId: string;
        mappingChecks?: Opportunity["mappingChecks"];
      }>,
    ) => {
      const prepared = rows.map((row) => ({
        ...row,
        resolvedId:
          row.action === "update" && row.id ? row.id : uid("opp"),
      }));
      let created = 0;
      let updated = 0;
      let skippedQuota = 0;
      setState((prev) => {
        let opportunities = [...prev.opportunities];
        created = 0;
        updated = 0;
        skippedQuota = 0;
        let activeCount = opportunities.filter((o) => o.active).length;
        const oppLimit = billing.usage.opportunitiesLimit;
        for (const row of prepared) {
          if (!row.accountId) continue;
          const existing = opportunities.some((o) => o.id === row.resolvedId);
          if (existing) {
            opportunities = opportunities.map((o) =>
              o.id === row.resolvedId
                ? {
                    ...o,
                    name: row.name.trim(),
                    amount: row.amount,
                    closeDate: row.closeDate,
                    primaryAccountId: row.accountId,
                    phase: row.phase,
                    kind: row.kind,
                    solutionId: row.solutionId,
                    active: true,
                  }
                : o,
            );
            updated++;
          } else {
            if (!billing.canWrite) {
              skippedQuota++;
              continue;
            }
            if (oppLimit != null && activeCount >= oppLimit) {
              skippedQuota++;
              continue;
            }
            opportunities.push({
              id: row.resolvedId,
              name: row.name.trim(),
              amount: row.amount,
              currency: "EUR",
              closeDate: row.closeDate,
              primaryAccountId: row.accountId,
              phase: row.phase,
              kind: row.kind,
              solutionId: row.solutionId,
              moduleIds: [],
              directionIds: [],
              compellingEventIds: [],
              variables: {},
              businessOutcomes: defaultBusinessOutcomeValues(),
              processAnswers: {},
              mappingChecks: row.mappingChecks ?? {},
              stakeholders: [],
              aiRecommendations: null,
              active: true,
            });
            created++;
            activeCount++;
          }
        }
        if (skippedQuota > 0) {
          setQuotaError(
            `${skippedQuota} opportunité(s) non importée(s) — quota ou abonnement lecture seule.`,
          );
        }
        const next = { ...prev, opportunities };
        persistLocal(next);
        return next;
      });
      const id = orgIdRef.current;
      if (id && supabase) {
        try {
          const raw = localStorage.getItem(OPPORTUNITIES_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as StoredState;
            void upsertOpportunitiesRemote(
              id,
              parsed.opportunities ?? [],
            ).catch((err) => logSyncError("importOpportunities", err));
          }
        } catch (err) {
          logSyncError("importOpportunitiesBatch", err);
        }
      }
      return { created, updated };
    },
    [billing.canWrite, billing.usage.opportunitiesLimit],
  );

  const setBusinessOutcomeValue = useCallback(
    (opportunityId: string, fieldId: string, value: number) => {
      commit(
        {
          ...state,
          opportunities: state.opportunities.map((o) =>
            o.id === opportunityId
              ? {
                  ...o,
                  businessOutcomes: {
                    ...o.businessOutcomes,
                    [fieldId]: value,
                  },
                }
              : o,
          ),
        },
        [opportunityId],
      );
    },
    [commit, state],
  );

  const setProcessAnswer = useCallback(
    (
      opportunityId: string,
      questionId: string,
      patch: Partial<ProcessAnswer> & { status?: ProcessAnswerStatus },
    ) => {
      const today = new Date().toISOString().slice(0, 10);
      commit(
        {
          ...state,
          opportunities: state.opportunities.map((o) => {
            if (o.id !== opportunityId) return o;
            const prev = o.processAnswers?.[questionId] ?? {
              status: "None" as const,
            };
            return {
              ...o,
              processAnswers: {
                ...o.processAnswers,
                [questionId]: {
                  ...prev,
                  ...patch,
                  status: patch.status ?? prev.status,
                  updatedAt: today,
                },
              },
            };
          }),
        },
        [opportunityId],
      );
    },
    [commit, state],
  );

  const value = useMemo(
    () => ({
      opportunities: state.opportunities,
      activeOpportunities,
      activeOpportunityId: state.activeOpportunityId,
      activeOpportunity,
      quotaError,
      clearQuotaError,
      setActiveOpportunityId,
      addOpportunity,
      updateOpportunity,
      removeOpportunity,
      importOpportunitiesBatch,
      setBusinessOutcomeValue,
      setProcessAnswer,
    }),
    [
      state.opportunities,
      state.activeOpportunityId,
      activeOpportunities,
      activeOpportunity,
      quotaError,
      clearQuotaError,
      setActiveOpportunityId,
      addOpportunity,
      updateOpportunity,
      removeOpportunity,
      importOpportunitiesBatch,
      setBusinessOutcomeValue,
      setProcessAnswer,
    ],
  );

  return (
    <OpportunityContext.Provider value={value}>
      {children}
    </OpportunityContext.Provider>
  );
}

export function useOpportunities() {
  const ctx = useContext(OpportunityContext);
  if (!ctx) {
    throw new Error("useOpportunities must be used within OpportunityProvider");
  }
  return ctx;
}
