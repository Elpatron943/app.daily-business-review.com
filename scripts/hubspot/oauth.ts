import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  exchangeCodeForTokens,
  fetchPortalId,
} from "./client";
import { encryptSecret } from "./crypto";
import { CRM_PROVIDER_HUBSPOT } from "./crmProvider";
import { HUBSPOT_OAUTH_SCOPES } from "./types";

export function buildAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: HUBSPOT_OAUTH_SCOPES.join(" "),
    state: input.state,
  });
  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
}

/** state = orgId.base64url(nonce).hmac — simplifié : orgId:nonce:sig */
export function createOAuthState(
  organizationId: string,
  secret: string,
): string {
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${organizationId}.${nonce}`;
  const sig = createHash("sha256")
    .update(`${payload}.${secret}`)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function parseOAuthState(
  state: string,
  secret: string,
): { organizationId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [organizationId, nonce, sig] = parts;
  const payload = `${organizationId}.${nonce}`;
  const expected = createHash("sha256")
    .update(`${payload}.${secret}`)
    .digest("base64url");
  if (sig !== expected) return null;
  return { organizationId };
}

export async function completeOAuthCallback(input: {
  db: SupabaseClient;
  code: string;
  organizationId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenSecret: string;
}): Promise<{ portalId: string | null }> {
  const tokens = await exchangeCodeForTokens({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    redirectUri: input.redirectUri,
    code: input.code,
  });
  const portalId = await fetchPortalId(tokens.accessToken);

  const { error } = await input.db.from("crm_connections").upsert(
    {
      organization_id: input.organizationId,
      provider: CRM_PROVIDER_HUBSPOT,
      external_portal_id: portalId,
      access_token_enc: encryptSecret(tokens.accessToken, input.tokenSecret),
      refresh_token_enc: encryptSecret(tokens.refreshToken, input.tokenSecret),
      token_expires_at: tokens.expiresAt?.toISOString() ?? null,
      scopes: tokens.scopes,
      status: "connected",
      last_error: null,
    },
    { onConflict: "organization_id,provider" },
  );
  if (error) throw new Error(error.message);
  return { portalId };
}

export async function disconnectHubSpot(
  db: SupabaseClient,
  organizationId: string,
): Promise<void> {
  const { error } = await db
    .from("crm_connections")
    .update({
      status: "disconnected",
      access_token_enc: null,
      refresh_token_enc: null,
      token_expires_at: null,
      last_error: null,
    })
    .eq("organization_id", organizationId)
    .eq("provider", CRM_PROVIDER_HUBSPOT);
  if (error) throw new Error(error.message);
}

export async function getConnectionStatus(
  db: SupabaseClient,
  organizationId: string,
): Promise<{
  status: "connected" | "error" | "disconnected";
  portalId: string | null;
  scopes: string[];
  lastPullAt: string | null;
  lastPushAt: string | null;
  lastError: string | null;
}> {
  const { data, error } = await db
    .from("crm_connections")
    .select(
      "status, external_portal_id, scopes, last_pull_at, last_push_at, last_error",
    )
    .eq("organization_id", organizationId)
    .eq("provider", CRM_PROVIDER_HUBSPOT)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    return {
      status: "disconnected",
      portalId: null,
      scopes: [],
      lastPullAt: null,
      lastPushAt: null,
      lastError: null,
    };
  }
  return {
    status: (data.status as "connected" | "error" | "disconnected") ||
      "disconnected",
    portalId: data.external_portal_id
      ? String(data.external_portal_id)
      : null,
    scopes: Array.isArray(data.scopes)
      ? data.scopes.map(String)
      : [],
    lastPullAt: data.last_pull_at ? String(data.last_pull_at) : null,
    lastPushAt: data.last_push_at ? String(data.last_push_at) : null,
    lastError: data.last_error ? String(data.last_error) : null,
  };
}
