import { adminClient, findAuthUserIdByEmail } from "./selfServeProvisionCore";

/** Statuts de l'enum public.subscription_status. */
export type AppSubscriptionStatus = "active" | "past_due" | "canceled";

/**
 * Traduit un statut d'abonnement Stripe en statut d'organisation DBR.
 * `null` = statut transitoire à ignorer (incomplete : paiement en cours).
 */
export function mapStripeStatus(
  stripeStatus: string,
  deleted = false,
): AppSubscriptionStatus | null {
  if (deleted) return "canceled";
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return null;
  }
}

/**
 * Applique le statut Stripe à l'organisation du compte (appelé par le webhook
 * Stripe du site). Ne touche jamais une organisation Pilotage (gérée sur devis).
 */
export async function syncSubscriptionStatus(input: {
  url: string;
  serviceKey: string;
  email: string;
  status: AppSubscriptionStatus;
}): Promise<
  | { ok: true; orgId: string; subscriptionStatus: AppSubscriptionStatus; changed: boolean }
  | { ok: false; status: number; error: string }
> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) {
    return { ok: false, status: 400, error: "E-mail invalide." };
  }

  const admin = adminClient(input.url, input.serviceKey);
  const userId = await findAuthUserIdByEmail(admin, email);
  if (!userId) {
    return { ok: false, status: 404, error: "Aucun compte avec cet e-mail." };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  const orgId = profile?.organization_id as string | undefined;
  if (!orgId) {
    return { ok: false, status: 404, error: "Compte sans organisation." };
  }

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id, subscription_status, commercial_plan_id")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr || !org) {
    return { ok: false, status: 500, error: orgErr?.message || "Organisation introuvable." };
  }

  const { data: plan } = org.commercial_plan_id
    ? await admin
        .from("commercial_plans")
        .select("code")
        .eq("id", org.commercial_plan_id)
        .maybeSingle()
    : { data: null };
  const planCode = (plan as { code?: string } | null)?.code;
  if (planCode === "enterprise") {
    return { ok: true, orgId, subscriptionStatus: input.status, changed: false };
  }

  if (org.subscription_status === input.status) {
    return { ok: true, orgId, subscriptionStatus: input.status, changed: false };
  }

  const { error: upErr } = await admin
    .from("organizations")
    .update({ subscription_status: input.status })
    .eq("id", orgId);
  if (upErr) {
    return { ok: false, status: 500, error: upErr.message };
  }

  return { ok: true, orgId, subscriptionStatus: input.status, changed: true };
}
