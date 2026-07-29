import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "./crypto";
import type { HubSpotCrmObject, HubSpotTokens } from "./types";
import { CRM_PROVIDER_HUBSPOT } from "./crmProvider";

const API = "https://api.hubapi.com";
const TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";

export class HubSpotApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function exchangeCodeForTokens(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<HubSpotTokens & { scopes: string[] }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    message?: string;
  };
  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new HubSpotApiError(
      res.status,
      data.message || "Échange OAuth HubSpot impossible.",
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null,
    scopes: (data.scope || "").split(" ").filter(Boolean),
  };
}

export async function refreshAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<HubSpotTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    message?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new HubSpotApiError(
      res.status,
      data.message || "Refresh token HubSpot impossible.",
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || input.refreshToken,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null,
  };
}

export async function fetchPortalId(accessToken: string): Promise<string | null> {
  const res = await fetch(`${API}/oauth/v1/access-tokens/${accessToken}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { hub_id?: number | string };
  return data.hub_id != null ? String(data.hub_id) : null;
}

type ConnectionRow = {
  organization_id: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  external_portal_id: string | null;
};

/** Client HubSpot lié à une org (refresh auto + persistance). */
export async function withOrgHubSpotClient(
  db: SupabaseClient,
  organizationId: string,
  env: {
    clientId: string;
    clientSecret: string;
    tokenSecret: string;
  },
): Promise<{
  accessToken: string;
  portalId: string | null;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
}> {
  const { data: row, error } = await db
    .from("crm_connections")
    .select(
      "organization_id, access_token_enc, refresh_token_enc, token_expires_at, external_portal_id, status",
    )
    .eq("organization_id", organizationId)
    .eq("provider", CRM_PROVIDER_HUBSPOT)
    .maybeSingle();

  if (error || !row) {
    throw new Error("HubSpot non connecté pour cette organisation.");
  }
  const conn = row as ConnectionRow & { status?: string };
  if (conn.status && conn.status !== "connected") {
    throw new Error("Connexion HubSpot inactive.");
  }
  if (!conn.access_token_enc || !conn.refresh_token_enc) {
    throw new Error("Tokens HubSpot manquants.");
  }

  let accessToken = decryptSecret(conn.access_token_enc, env.tokenSecret);
  let refreshToken = decryptSecret(conn.refresh_token_enc, env.tokenSecret);
  const expiresAt = conn.token_expires_at
    ? new Date(conn.token_expires_at)
    : null;

  if (!expiresAt || expiresAt.getTime() < Date.now() + 60_000) {
    const refreshed = await refreshAccessToken({
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      refreshToken,
    });
    accessToken = refreshed.accessToken;
    refreshToken = refreshed.refreshToken;
    await db
      .from("crm_connections")
      .update({
        access_token_enc: encryptSecret(accessToken, env.tokenSecret),
        refresh_token_enc: encryptSecret(refreshToken, env.tokenSecret),
        token_expires_at: refreshed.expiresAt?.toISOString() ?? null,
        last_error: null,
        status: "connected",
      })
      .eq("organization_id", organizationId)
      .eq("provider", CRM_PROVIDER_HUBSPOT);
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new HubSpotApiError(
        res.status,
        text || `HubSpot HTTP ${res.status}`,
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    accessToken,
    portalId: conn.external_portal_id,
    request,
  };
}

export async function listCrmObjects(
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
  objectType: "companies" | "contacts" | "deals",
  properties: string[],
  options?: { after?: string; limit?: number },
): Promise<{ results: HubSpotCrmObject[]; nextAfter?: string }> {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? 100));
  for (const p of properties) params.append("properties", p);
  if (options?.after) params.set("after", options.after);

  const data = await request<{
    results?: Array<{
      id: string;
      properties?: Record<string, string | null>;
      updatedAt?: string;
    }>;
    paging?: { next?: { after?: string } };
  }>(`/crm/v3/objects/${objectType}?${params.toString()}`);

  return {
    results: (data.results || []).map((r) => ({
      id: r.id,
      properties: r.properties || {},
      updatedAt: r.updatedAt,
    })),
    nextAfter: data.paging?.next?.after,
  };
}

export async function createCrmObject(
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
  objectType: "companies" | "contacts" | "deals",
  properties: Record<string, string>,
): Promise<HubSpotCrmObject> {
  const data = await request<{
    id: string;
    properties?: Record<string, string | null>;
  }>(`/crm/v3/objects/${objectType}`, {
    method: "POST",
    body: JSON.stringify({ properties }),
  });
  return { id: data.id, properties: data.properties || {} };
}

export async function updateCrmObject(
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
  objectType: "companies" | "contacts" | "deals",
  id: string,
  properties: Record<string, string>,
): Promise<HubSpotCrmObject> {
  const data = await request<{
    id: string;
    properties?: Record<string, string | null>;
  }>(`/crm/v3/objects/${objectType}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
  return { id: data.id, properties: data.properties || {} };
}
