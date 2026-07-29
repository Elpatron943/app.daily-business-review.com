import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export function hubspotEnv() {
  return {
    supabaseUrl:
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
    serviceRoleKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      "",
    anonKey:
      process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
    clientId: process.env.HUBSPOT_CLIENT_ID || "",
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET || "",
    tokenSecret: process.env.HUBSPOT_TOKEN_SECRET || "",
    redirectUri:
      process.env.HUBSPOT_REDIRECT_URI ||
      (process.env.URL
        ? `${process.env.URL.replace(/\/$/, "")}/api/hubspot/oauth/callback`
        : "http://localhost:5173/api/hubspot/oauth/callback"),
    appUrl:
      process.env.VITE_APP_URL ||
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      "http://localhost:5173",
    clientSecretWebhook: process.env.HUBSPOT_CLIENT_SECRET || "",
  };
}

export function adminDb(url: string, serviceKey: string): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function authErrorMessage(raw: string | undefined): string {
  const msg = (raw || "").trim();
  if (
    /fetch failed|UNABLE_TO_VERIFY_LEAF_SIGNATURE|certificate|SSL|TLS/i.test(
      msg,
    )
  ) {
    return (
      "Le serveur local ne peut pas joindre Supabase (certificat TLS). " +
      "Ajoute SUPABASE_INSECURE_TLS=1 dans .env.local puis relance npm run dev."
    );
  }
  return msg || "Session invalide.";
}

export async function userFromAccessToken(
  url: string,
  anonKey: string,
  accessToken: string,
): Promise<{ user: User | null; error: string | null }> {
  const key = anonKey.trim();
  if (!key) {
    return { user: null, error: "Clé anon Supabase manquante côté serveur." };
  }
  // Même pattern que invite-user : JWT en Bearer + getUser() (pas service_role).
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return { user: null, error: authErrorMessage(error?.message) };
  }
  return { user: data.user, error: null };
}

export async function assertCallerAdmin(
  url: string,
  serviceKey: string,
  anonKey: string,
  accessToken: string,
): Promise<
  | { ok: true; user: User; organizationId: string }
  | { ok: false; status: number; error: string }
> {
  if (!anonKey.trim()) {
    return {
      ok: false,
      status: 500,
      error: "Configuration serveur incomplète (clé anon).",
    };
  }
  const { user, error: authErr } = await userFromAccessToken(
    url,
    anonKey,
    accessToken,
  );
  if (!user) {
    return {
      ok: false,
      status: 401,
      error: authErr || "Session invalide — reconnecte-toi.",
    };
  }

  const admin = adminDb(url, serviceKey);
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile) {
    return { ok: false, status: 403, error: "Profil introuvable." };
  }
  if (profile.role !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "Seul un admin peut gérer HubSpot.",
    };
  }
  if (!profile.organization_id) {
    return {
      ok: false,
      status: 400,
      error: "Organisation manquante sur le profil admin.",
    };
  }

  return {
    ok: true,
    user,
    organizationId: String(profile.organization_id),
  };
}
