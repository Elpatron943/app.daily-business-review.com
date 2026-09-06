import type { Handler } from "@netlify/functions";
import {
  assertProvisionApiKey,
  selfServeProvision,
  type SelfServePlan,
} from "../../scripts/selfServeProvisionCore";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const expectedKey = process.env.DBR_PROVISION_API_KEY || "";
  const auth =
    event.headers.authorization || event.headers.Authorization || "";
  if (!assertProvisionApiKey(auth, expectedKey)) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Non autorisé." }),
    };
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Supabase non configuré." }),
    };
  }

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(event.body || "{}") as Record<string, unknown>;
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "JSON invalide." }),
    };
  }

  const planRaw = String(body.plan || "");
  const plan: SelfServePlan | null =
    planRaw === "freemium" || planRaw === "sales" ? planRaw : null;
  if (!plan) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "plan invalide (freemium|sales)." }),
    };
  }

  const appLoginUrl =
    process.env.VITE_APP_URL ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    "https://app.daily-business-review.com";

  const result = await selfServeProvision({
    url,
    serviceKey,
    appLoginUrl,
    body: {
      email: String(body.email || ""),
      name: String(body.name || ""),
      phone: typeof body.phone === "string" ? body.phone : undefined,
      company: typeof body.company === "string" ? body.company : undefined,
      plan,
      password: typeof body.password === "string" ? body.password : undefined,
      trialDays:
        typeof body.trialDays === "number" ? body.trialDays : undefined,
      maxOpportunities:
        typeof body.maxOpportunities === "number"
          ? body.maxOpportunities
          : undefined,
      locale: typeof body.locale === "string" ? body.locale : undefined,
      stripeCustomerId:
        typeof body.stripeCustomerId === "string"
          ? body.stripeCustomerId
          : undefined,
      stripeSubscriptionId:
        typeof body.stripeSubscriptionId === "string"
          ? body.stripeSubscriptionId
          : undefined,
    },
  });

  if (!result.ok) {
    return {
      statusCode: result.status,
      body: JSON.stringify({ error: result.error }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      loginUrl: result.loginUrl,
      orgId: result.orgId,
      userId: result.userId,
    }),
  };
};
