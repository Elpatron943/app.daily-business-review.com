/**
 * Entitlements par formule commerciale (Freemium / Sales Solo / Entreprise).
 * Source de vérité côté app — le seed SQL reprend les mêmes codes / quotas.
 */

export type PlanCode =
  | "freemium"
  | "sales_solo"
  | "enterprise"
  /** Legacy catalogue (avant packaging site). */
  | "trial"
  | "team"
  | "business";

export type Entitlement =
  | "nav.view"
  | "nav.saisie"
  | "nav.pilotage"
  | "nav.settings"
  | "opp.process"
  | "opp.mapping"
  | "opp.action_plan"
  | "team.invite";

/** Périmètre Sales Solo (= Freemium fonctionnalités). */
export const SOLO_ENTITLEMENTS: readonly Entitlement[] = [
  "nav.saisie",
  "nav.settings",
] as const;

/** Périmètre Entreprise (produit complet). */
export const FULL_ENTITLEMENTS: readonly Entitlement[] = [
  "nav.view",
  "nav.saisie",
  "nav.pilotage",
  "nav.settings",
  "opp.process",
  "opp.mapping",
  "opp.action_plan",
  "team.invite",
] as const;

export type PlanPackage = {
  code: PlanCode;
  name: string;
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
    name: "Freemium",
    maxSeats: 1,
    maxActiveOpportunities: 5,
    trialDays: 14,
    entitlements: SOLO_ENTITLEMENTS,
    activateOnCreate: "trialing",
  },
  sales_solo: {
    code: "sales_solo",
    name: "Sales Solo",
    maxSeats: 1,
    maxActiveOpportunities: 20,
    trialDays: null,
    entitlements: SOLO_ENTITLEMENTS,
    activateOnCreate: "none",
  },
  enterprise: {
    code: "enterprise",
    name: "Entreprise",
    maxSeats: null,
    maxActiveOpportunities: null,
    trialDays: null,
    entitlements: FULL_ENTITLEMENTS,
    activateOnCreate: "none",
  },
};

const LEGACY_FULL: PlanCode[] = ["trial", "team", "business", "enterprise"];

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

export function entitlementsForPlanCode(
  code: string | null | undefined,
): readonly Entitlement[] {
  const normalized = normalizePlanCode(code);
  if (!normalized) return FULL_ENTITLEMENTS;
  if (normalized === "freemium" || normalized === "sales_solo") {
    return SOLO_ENTITLEMENTS;
  }
  if (LEGACY_FULL.includes(normalized)) return FULL_ENTITLEMENTS;
  return FULL_ENTITLEMENTS;
}

export function hasEntitlement(
  code: string | null | undefined,
  entitlement: Entitlement,
): boolean {
  return entitlementsForPlanCode(code).includes(entitlement);
}

/** Settings sous-sections réservées au pack complet. */
export const SETTINGS_SUBS_REQUIRING_FULL: ReadonlySet<string> = new Set([
  "process",
  "mapping",
]);
