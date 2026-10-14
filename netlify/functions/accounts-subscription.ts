import type { Handler } from "@netlify/functions";
import { assertProvisionApiKey } from "../../scripts/selfServeProvisionCore";
import {
  mapStripeStatus,
  syncSubscriptionStatus,
} from "../../scripts/subscriptionSyncCore";

/**
 * Mise à jour du statut d'abonnement d'une organisation, appelée par le webhook
 * Stripe du site marketing (même clé que /accounts/provision).
 * Body : { email, stripeStatus, deleted? }
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const expectedKey = process.env.DBR_PROVISION_API_KEY || "";
  const auth = event.headers.authorization || event.headers.Authorization || "";
  if (!assertProvisionApiKey(auth, expectedKey)) {
    return { statusCode: 401, body: JSON.stringify({ error: "Non autorisé." }) };
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Supabase non configuré." }) };
  }

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(event.body || "{}") as Record<string, unknown>;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "JSON invalide." }) };
  }

  const status = mapStripeStatus(String(body.stripeStatus || ""), body.deleted === true);
  if (!status) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, ignored: true }) };
  }

  const result = await syncSubscriptionStatus({
    url,
    serviceKey,
    email: String(body.email || ""),
    status,
  });

  if ("error" in result) {
    return { statusCode: result.status, body: JSON.stringify({ error: result.error }) };
  }
  return { statusCode: 200, body: JSON.stringify(result) };
};
