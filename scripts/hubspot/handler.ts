import { adminDb, assertCallerAdmin, hubspotEnv } from "./env";
import {
  buildAuthorizeUrl,
  completeOAuthCallback,
  createOAuthState,
  disconnectHubSpot,
  getConnectionStatus,
  parseOAuthState,
} from "./oauth";
import { pullHubSpotOrg } from "./pull";
import { pushHubSpotOrg } from "./push";
import {
  DBR_PHASE_OPTIONS,
  DEFAULT_HUBSPOT_MAPPING,
  loadHubSpotMapping,
  normalizeHubSpotMapping,
  saveHubSpotMapping,
  type HubSpotMappingConfig,
} from "./mappingConfig";
import { loadHubSpotSchema } from "./schema";
import { ingestWebhookEvents, verifyHubSpotSignature } from "./webhooks";
import type { HubSpotWebhookEvent } from "./webhooks";

export type HubSpotHttpResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
  /** Redirect Location */
  location?: string;
};

function json(statusCode: number, body: unknown): HubSpotHttpResult {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function redirect(location: string): HubSpotHttpResult {
  return { statusCode: 302, location, headers: { Location: location } };
}

function bearer(authHeader: string | undefined): string {
  if (!authHeader?.startsWith("Bearer ")) return "";
  return authHeader.slice(7);
}

function routePath(pathname: string): string {
  const marker = "/api/hubspot";
  const i = pathname.indexOf(marker);
  if (i < 0) return pathname;
  return pathname.slice(i + marker.length) || "/";
}

/**
 * Routeur unique `/api/hubspot/*` (Vite proxy + Netlify function).
 */
export async function handleHubSpotRequest(input: {
  method: string;
  pathname: string;
  query: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  rawBody: string | null;
}): Promise<HubSpotHttpResult> {
  const env = hubspotEnv();
  const path = routePath(input.pathname.split("?")[0] || "/");
  const method = input.method.toUpperCase();

  if (method === "OPTIONS") {
    return { statusCode: 204, body: "" };
  }

  // --- Webhook (pas de session user) ---
  if (path === "/webhook" && method === "POST") {
    const raw = input.rawBody || "";
    const ok = verifyHubSpotSignature({
      clientSecret: env.clientSecret,
      rawBody: raw,
      signatureHeader:
        input.headers["x-hubspot-signature"] ||
        input.headers["X-HubSpot-Signature"],
      signatureV3:
        input.headers["x-hubspot-signature-v3"] ||
        input.headers["X-HubSpot-Signature-v3"],
      method: "POST",
      uri: input.pathname,
      timestamp:
        input.headers["x-hubspot-request-timestamp"] ||
        input.headers["X-HubSpot-Request-Timestamp"],
    });
    // En dev sans signature : refuse sauf HUBSPOT_WEBHOOK_SKIP_VERIFY=1
    if (!ok && process.env.HUBSPOT_WEBHOOK_SKIP_VERIFY !== "1") {
      return json(401, { error: "Signature HubSpot invalide." });
    }
    if (!env.supabaseUrl || !env.serviceRoleKey) {
      return json(500, { error: "Supabase non configuré." });
    }
    let events: HubSpotWebhookEvent[] = [];
    try {
      const parsed = JSON.parse(raw || "[]") as unknown;
      events = Array.isArray(parsed)
        ? (parsed as HubSpotWebhookEvent[])
        : [parsed as HubSpotWebhookEvent];
    } catch {
      return json(400, { error: "JSON webhook invalide." });
    }
    const db = adminDb(env.supabaseUrl, env.serviceRoleKey);
    const result = await ingestWebhookEvents({ db, events });
    return json(200, { ok: true, ...result });
  }

  // --- OAuth callback (redirect browser, state porte l’org) ---
  if (path === "/oauth/callback" && method === "GET") {
    const appUrl = env.appUrl.replace(/\/$/, "");
    if (!env.clientId || !env.clientSecret || !env.tokenSecret) {
      return redirect(`${appUrl}/?hubspot=config_error`);
    }
    const err = input.query.error;
    if (err) {
      return redirect(
        `${appUrl}/?hubspot=denied&error=${encodeURIComponent(err)}`,
      );
    }
    const code = input.query.code || "";
    const state = input.query.state || "";
    const parsed = parseOAuthState(state, env.tokenSecret);
    if (!code || !parsed) {
      return redirect(`${appUrl}/?hubspot=invalid_state`);
    }
    if (!env.supabaseUrl || !env.serviceRoleKey) {
      return redirect(`${appUrl}/?hubspot=config_error`);
    }
    try {
      const db = adminDb(env.supabaseUrl, env.serviceRoleKey);
      await completeOAuthCallback({
        db,
        code,
        organizationId: parsed.organizationId,
        clientId: env.clientId,
        clientSecret: env.clientSecret,
        redirectUri: env.redirectUri,
        tokenSecret: env.tokenSecret,
      });
      return redirect(`${appUrl}/?hubspot=connected`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "oauth_failed";
      return redirect(
        `${appUrl}/?hubspot=error&error=${encodeURIComponent(msg)}`,
      );
    }
  }

  // --- Routes admin authentifiées ---
  if (!env.supabaseUrl || !env.serviceRoleKey) {
    return json(500, {
      error: "Service indisponible. Contacte ton administrateur.",
    });
  }

  const token = bearer(
    input.headers.authorization || input.headers.Authorization,
  );
  if (!token) {
    return json(401, { error: "Session expirée — reconnecte-toi." });
  }

  const caller = await assertCallerAdmin(
    env.supabaseUrl,
    env.serviceRoleKey,
    env.anonKey,
    token,
  );
  if (!caller.ok) {
    return json(caller.status, { error: caller.error });
  }

  const db = adminDb(env.supabaseUrl, env.serviceRoleKey);
  const orgId = caller.organizationId;
  const hubspotAppReady = Boolean(
    env.clientId && env.clientSecret && env.tokenSecret,
  );

  // Lecture statut / mapping : OK sans app OAuth plateforme (affichage Settings).
  if (path === "/status" && method === "GET") {
    try {
      const status = await getConnectionStatus(db, orgId);
      return json(200, {
        ...status,
        platformConfigured: hubspotAppReady,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Statut indisponible";
      // Table absente ou pas encore migrée → UI utilisable
      if (/relation|does not exist|crm_connections/i.test(msg)) {
        return json(200, {
          status: "disconnected",
          portalId: null,
          scopes: [],
          lastPullAt: null,
          lastPushAt: null,
          lastError: null,
          platformConfigured: hubspotAppReady,
          setupHint:
            "La base n’est pas encore prête pour les connexions CRM. Réessaie plus tard ou contacte le support.",
        });
      }
      return json(500, { error: msg });
    }
  }

  if (path === "/mapping" && method === "GET") {
    try {
      const mapping = await loadHubSpotMapping(db, orgId);
      const { data: teamRows } = await db
        .from("profiles")
        .select("id, email, full_name, role")
        .eq("organization_id", orgId)
        .order("email", { ascending: true });
      const team = (teamRows || []).map((p) => ({
        id: String(p.id),
        email: String(p.email || ""),
        fullName: p.full_name ? String(p.full_name) : null,
        role: String(p.role || "user"),
      }));
      return json(200, {
        mapping,
        defaults: DEFAULT_HUBSPOT_MAPPING,
        dbrPhases: [...DBR_PHASE_OPTIONS],
        team,
        platformConfigured: hubspotAppReady,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Mapping indisponible";
      if (/relation|does not exist|crm_connections/i.test(msg)) {
        return json(200, {
          mapping: DEFAULT_HUBSPOT_MAPPING,
          defaults: DEFAULT_HUBSPOT_MAPPING,
          dbrPhases: [...DBR_PHASE_OPTIONS],
          team: [],
          platformConfigured: hubspotAppReady,
          setupHint:
            "La base n’est pas encore prête pour les connexions CRM. Réessaie plus tard ou contacte le support.",
        });
      }
      return json(500, { error: msg });
    }
  }

  if (path === "/mapping" && (method === "PUT" || method === "POST")) {
    let body: { mapping?: HubSpotMappingConfig } = {};
    try {
      body = JSON.parse(input.rawBody || "{}") as {
        mapping?: HubSpotMappingConfig;
      };
    } catch {
      return json(400, { error: "JSON invalide." });
    }
    try {
      const saved = await saveHubSpotMapping(
        db,
        orgId,
        normalizeHubSpotMapping(body.mapping),
      );
      return json(200, { ok: true, mapping: saved });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Enregistrement impossible";
      return json(500, { error: msg });
    }
  }

  // Actions OAuth / sync : secrets plateforme requis
  if (!hubspotAppReady) {
    return json(503, {
      error:
        "Le connecteur HubSpot n’est pas encore activé. Réessaie plus tard.",
      platformConfigured: false,
    });
  }

  if (path === "/oauth/start" && method === "GET") {
    const state = createOAuthState(orgId, env.tokenSecret);
    const url = buildAuthorizeUrl({
      clientId: env.clientId,
      redirectUri: env.redirectUri,
      state,
    });
    return json(200, { url });
  }

  if (path === "/disconnect" && method === "POST") {
    await disconnectHubSpot(db, orgId);
    return json(200, { ok: true });
  }

  if (path === "/schema" && method === "GET") {
    try {
      const schema = await loadHubSpotSchema({
        db,
        organizationId: orgId,
        clientId: env.clientId,
        clientSecret: env.clientSecret,
        tokenSecret: env.tokenSecret,
      });
      return json(200, schema);
    } catch (e) {
      return json(500, {
        error: e instanceof Error ? e.message : "Schéma HubSpot indisponible",
      });
    }
  }

  if (path === "/sync/pull" && method === "POST") {
    try {
      const counts = await pullHubSpotOrg({
        db,
        organizationId: orgId,
        clientId: env.clientId,
        clientSecret: env.clientSecret,
        tokenSecret: env.tokenSecret,
      });
      return json(200, { ok: true, counts });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Pull échoué";
      await db
        .from("crm_connections")
        .update({ status: "error", last_error: msg })
        .eq("organization_id", orgId)
        .eq("provider", "hubspot");
      return json(500, { error: msg });
    }
  }

  if (path === "/sync/push" && method === "POST") {
    try {
      const counts = await pushHubSpotOrg({
        db,
        organizationId: orgId,
        clientId: env.clientId,
        clientSecret: env.clientSecret,
        tokenSecret: env.tokenSecret,
      });
      return json(200, { ok: true, counts });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Push échoué";
      await db
        .from("crm_connections")
        .update({ status: "error", last_error: msg })
        .eq("organization_id", orgId)
        .eq("provider", "hubspot");
      return json(500, { error: msg });
    }
  }

  return json(404, { error: `Route HubSpot inconnue: ${path}` });
}
