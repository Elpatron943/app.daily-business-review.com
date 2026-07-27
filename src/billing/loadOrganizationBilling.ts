import { supabase } from "../supabase/client";
import type {
  CommercialPlan,
  OrganizationBilling,
  SubscriptionStatus,
} from "./types";

function asFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function mapPlan(row: Record<string, unknown>): CommercialPlan {
  return {
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    tagline: String(row.tagline ?? ""),
    price_cents_month:
      row.price_cents_month == null ? null : Number(row.price_cents_month),
    currency: String(row.currency ?? "EUR"),
    max_seats: row.max_seats == null ? null : Number(row.max_seats),
    max_active_opportunities:
      row.max_active_opportunities == null
        ? null
        : Number(row.max_active_opportunities),
    max_exports_month:
      row.max_exports_month == null ? null : Number(row.max_exports_month),
    features: asFeatures(row.features),
    is_active: Boolean(row.is_active),
  };
}

function mapStatus(raw: unknown): SubscriptionStatus {
  if (
    raw === "none" ||
    raw === "trialing" ||
    raw === "active" ||
    raw === "past_due" ||
    raw === "canceled"
  ) {
    return raw;
  }
  return "none";
}

export async function loadOrganizationBilling(
  organizationId: string,
): Promise<OrganizationBilling | null> {
  if (!supabase || !organizationId) return null;

  const { data, error } = await supabase
    .from("organizations")
    .select(
      `
      id, name, commercial_plan_id, seat_quantity, subscription_status, trial_ends_at,
      commercial_plans (
        id, code, name, description, tagline, price_cents_month, currency,
        max_seats, max_active_opportunities, max_exports_month, features, is_active
      )
    `,
    )
    .eq("id", organizationId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const planRaw = row.commercial_plans;
  let plan: CommercialPlan | null = null;
  if (planRaw && typeof planRaw === "object" && !Array.isArray(planRaw)) {
    plan = mapPlan(planRaw as Record<string, unknown>);
  }

  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    commercial_plan_id:
      row.commercial_plan_id == null ? null : String(row.commercial_plan_id),
    seat_quantity: row.seat_quantity == null ? null : Number(row.seat_quantity),
    subscription_status: mapStatus(row.subscription_status),
    trial_ends_at: row.trial_ends_at == null ? null : String(row.trial_ends_at),
    plan,
  };
}

export async function countOrganizationSeats(
  organizationId: string,
): Promise<number> {
  if (!supabase || !organizationId) return 0;
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (error) return 0;
  return count ?? 0;
}
