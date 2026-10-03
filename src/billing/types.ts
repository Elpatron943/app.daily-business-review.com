import type { OptionalModulesState } from "./optionalModules";
import {
  entitlementsForPlanAndRole,
  productLineForPlanCode,
  type Entitlement,
  type ProductLine,
} from "./entitlements";

export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export type CommercialPlan = {
  id: string;
  code: string;
  name: string;
  description: string;
  tagline: string;
  price_cents_month: number | null;
  currency: string;
  max_seats: number | null;
  max_active_opportunities: number | null;
  max_exports_month: number | null;
  features: string[];
  is_active: boolean;
};

export type OrganizationBilling = {
  id: string;
  name: string;
  commercial_plan_id: string | null;
  seat_quantity: number | null;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  optional_modules: OptionalModulesState;
  plan: CommercialPlan | null;
  /** Null = chatbot démarrage encore à présenter au 1er admin. */
  onboarding_completed_at: string | null;
  onboarding_completed_by: string | null;
};

export type BillingUsage = {
  seatsUsed: number;
  seatsLimit: number | null;
  activeOpportunities: number;
  opportunitiesLimit: number | null;
};

export type BillingState = {
  organization: OrganizationBilling | null;
  usage: BillingUsage;
  canWrite: boolean;
  seatsFull: boolean;
  opportunitiesFull: boolean;
  /** true si freemium/essai expiré ou paiement en attente. */
  subscriptionBlocked: boolean;
  /** Ligne produit org (sales | pilotage). */
  productLine: ProductLine;
  /** Entitlements effectifs (plan × rôle). */
  entitlements: readonly Entitlement[];
};

export function effectiveSeatLimit(org: OrganizationBilling | null): number | null {
  if (!org) return null;
  if (org.seat_quantity != null) return org.seat_quantity;
  return org.plan?.max_seats ?? null;
}

export function effectiveOppLimit(org: OrganizationBilling | null): number | null {
  return org?.plan?.max_active_opportunities ?? null;
}

export function isTrialExpired(org: OrganizationBilling | null): boolean {
  if (!org?.trial_ends_at) return false;
  if (org.subscription_status === "active") return false;
  const end = Date.parse(org.trial_ends_at);
  return Number.isFinite(end) && end < Date.now();
}

export function isWriteLocked(
  status: SubscriptionStatus | undefined,
  org?: OrganizationBilling | null,
): boolean {
  if (status === "past_due" || status === "canceled" || status === "none") {
    return true;
  }
  if (org && isTrialExpired(org)) return true;
  return false;
}

export function formatQuotaLabel(used: number, limit: number | null): string {
  if (limit == null) return `${used}/∞`;
  return `${used}/${limit}`;
}

export function planEntitlements(
  org: OrganizationBilling | null,
  role?: string | null,
): readonly Entitlement[] {
  return entitlementsForPlanAndRole(org?.plan?.code, role ?? null);
}

export function orgProductLine(
  org: OrganizationBilling | null,
): ProductLine {
  return productLineForPlanCode(org?.plan?.code);
}

export function orgHasEntitlement(
  org: OrganizationBilling | null,
  entitlement: Entitlement,
  role?: string | null,
): boolean {
  return planEntitlements(org, role).includes(entitlement);
}
