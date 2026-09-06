import type { Handler } from "@netlify/functions";
import {
  activateOrganization,
  provisionOrganization,
} from "../../scripts/provisionOrgCore";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!url || !serviceKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Supabase non configuré côté fonction." }),
    };
  }

  const auth = event.headers.authorization || event.headers.Authorization || "";
  const accessToken = auth.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return { statusCode: 401, body: JSON.stringify({ error: "Non authentifié." }) };
  }

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(event.body || "{}") as Record<string, unknown>;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "JSON invalide." }) };
  }

  if (body.action === "activate") {
    const orgId = typeof body.orgId === "string" ? body.orgId : "";
    const result = await activateOrganization({
      url,
      serviceKey,
      anonKey,
      accessToken,
      orgId,
    });
    if (!result.ok) {
      return {
        statusCode: result.status,
        body: JSON.stringify({ error: result.error }),
      };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  const planCode = body.planCode;
  if (
    planCode !== "freemium" &&
    planCode !== "sales_solo" &&
    planCode !== "enterprise"
  ) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "planCode invalide." }),
    };
  }

  const result = await provisionOrganization({
    url,
    serviceKey,
    anonKey,
    accessToken,
    body: {
      orgName: String(body.orgName || ""),
      adminEmail: String(body.adminEmail || ""),
      adminName:
        typeof body.adminName === "string" ? body.adminName : undefined,
      planCode,
      redirectTo:
        typeof body.redirectTo === "string" ? body.redirectTo : undefined,
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
      orgId: result.orgId,
      userId: result.userId,
      activated: result.activated,
    }),
  };
};
