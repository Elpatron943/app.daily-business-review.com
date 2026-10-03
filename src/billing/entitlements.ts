/**
 * Deux produits sur une base commune :
 * - DBR Sales (freemium / sales_solo) → pack SALES_CORE
 * - DBR Pilotage (enterprise + legacy) → SALES_CORE + PILOTAGE
 *
 * Codes SQL inchangés. Source de vérité app — le seed SQL reprend codes / quotas.
 */

export type PlanCode =
  | "freemium"
  | "sales_solo"
  | "enterprise"
  /** Legacy catalogue (avant packaging site). */
  | "trial"
  | "team"
  | "business";

/** Ligne produit commerciale (indépendante du code SQL). */
export type ProductLine = "sales" | "pilotage";

export type Entitlement =
  | "nav.view"
  | "nav.saisie"
  | "nav.pilotage"
  | "nav.settings"
  | "opp.process"
  | "opp.mapping"
  | "opp.action_plan"
  | "team.invite";

/** Exécution deal — produit Sales (+ socle Pilotage). */
export const SALES_CORE: readonly Entitlement[] = [
  "nav.saisie",
  "nav.settings",
] as const;

/** Cockpit direction commerciale (en plus de SALES_CORE). */
export const PILOTAGE: readonly Entitlement[] = [
  "nav.view",
  "nav.pilotage",
  "opp.process",
  "opp.mapping",
  "opp.action_plan",
  "team.invite",
] as const;

/** Pack org Pilotage (et legacy full). */
export const PILOTAGE_ENTITLEMENTS: readonly Entitlement[] = [
  ...SALES_CORE,
  ...PILOTAGE,
] as const;

/** @deprecated alias — utiliser SALES_CORE */
export const SOLO_ENTITLEMENTS = SALES_CORE;

/** @deprecated alias — utiliser PILOTAGE_ENTITLEMENTS */
export const FULL_ENTITLEMENTS = PILOTAGE_ENTITLEMENTS;

export type PlanPackage = {
  code: PlanCode;
  name: string;
  productLine: ProductLine;
  /** Sièges max (1 = solo). null = illimité. */
  maxSeats: number | null;
  /** Opportunités actives max. null = illimité. */
  maxActiveOpportunities: number | null;
  /**
   * Durée freemium / essai (jours). null = pas de deadline auto.
   * Appliqué via trial_ends_at à la création.
   */
  trialDays: number | null;
  entitlements: readonly Entitlement[];
  /** Création : active immédiatement (freemium) ou attend paiement. */
  activateOnCreate: "trialing" | "none";
};

export const PLAN_PACKAGES: Record<
  "freemium" | "sales_solo" | "enterprise",
  PlanPackage
> = {
  freemium: {
    code: "freemium",
    name: "DBR Sales (essai)",
    productLine: "sales",
    maxSeats: 1,
    maxActiveOpportunities: 1,
    trialDays: 3,
    entitlements: SALES_CORE,
    activateOnCreate: "trialing",
  },
  sales_solo: {
    code: "sales_solo",
    name: "DBR Sales",
    productLine: "sales",
    maxSeats: 1,
    maxActiveOpportunities: 20,
    trialDays: null,
    entitlements: SALES_CORE,
    activateOnCreate: "none",
  },
  enterprise: {
    code: "enterprise",
    name: "DBR Pilotage",
    productLine: "pilotage",
    maxSeats: null,
    maxActiveOpportunities: null,
    trialDays: null,
    entitlements: PILOTAGE_ENTITLEMENTS,
    activateOnCreate: "none",
  },
};

const PILOTAGE_PLAN_CODES: PlanCode[] = [
  "trial",
  "team",
  "business",
  "enterprise",
];

export function normalizePlanCode(raw: string | null | undefined): PlanCode | null {
  if (!raw) return null;
  const c = raw.trim().toLowerCase();
  if (
    c === "freemium" ||
    c === "sales_solo" ||
    c === "enterprise" ||
    c === "trial" ||
    c === "team" ||
    c === "business"
  ) {
    return c;
  }
  return null;
}

export function productLineForPlanCode(
  code: string | null | undefined,
): ProductLine {
  const normalized = normalizePlanCode(code);
  if (!normalized) return "pilotage";
  if (normalized === "freemium" || normalized === "sales_solo") return "sales";
  if (PILOTAGE_PLAN_CODES.includes(normalized)) return "pilotage";
  return "pilotage";
}

export function entitlementsForPlanCode(
  code: string | null | undefined,
): readonly Entitlement[] {
  const line = productLineForPlanCode(code);
  return line === "sales" ? SALES_CORE : PILOTAGE_ENTITLEMENTS;
}

/**
 * Entitlements effectifs : dans une org Pilotage, le commercial (`user`)
 * reste en UX Sales (pas de cockpit manager).
 */
export function entitlementsForPlanAndRole(
  code: string | null | undefined,
  role: string | null | undefined,
): readonly Entitlement[] {
  const planEnts = entitlementsForPlanCode(code);
  if (productLineForPlanCode(code) === "pilotage" && role === "user") {
    return SALES_CORE;
  }
  return planEnts;
}

export function hasEntitlement(
  code: string | null | undefined,
  entitlement: Entitlement,
  role?: string | null,
): boolean {
  return entitlementsForPlanAndRole(code, role ?? null).includes(entitlement);
}

/** Settings sous-sections réservées au produit Pilotage. */
export const SETTINGS_SUBS_REQUIRING_PILOTAGE: ReadonlySet<string> = new Set([
  "process",
  "mapping",
]);

/** @deprecated alias — utiliser SETTINGS_SUBS_REQUIRING_PILOTAGE */
export const SETTINGS_SUBS_REQUIRING_FULL = SETTINGS_SUBS_REQUIRING_PILOTAGE;
