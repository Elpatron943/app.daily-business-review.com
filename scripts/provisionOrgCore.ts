import { createClient, type User } from "@supabase/supabase-js";
import { PLAN_PACKAGES, type PlanCode } from "../src/billing/entitlements";

export type ProvisionOrgInput = {
  orgName: string;
  adminEmail: string;
  adminName?: string;
  planCode: "freemium" | "sales_solo" | "enterprise";
  redirectTo?: string;
};

export type ProvisionOrgResult =
  | { ok: true; orgId: string; userId: string; activated: boolean }
  | { ok: false; status: number; error: string };

export type ActivateOrgInput = {
  orgId: string;
};

function adminClient(url: string, serviceKey: string) {
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function userFromAccessToken(
  url: string,
  anonKey: string,
  accessToken: string,
): Promise<{ user: User | null; error: string | null }> {
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return { user: null, error: error?.message || "Session invalide." };
  }
  return { user: data.user, error: null };
}

async function assertPlatformAdmin(
  url: string,
  serviceKey: string,
  anonKey: string,
  accessToken: string,
): Promise<
  | { ok: true; user: User }
  | { ok: false; status: number; error: string }
> {
  const { user, error: authErr } = await userFromAccessToken(
    url,
    anonKey || serviceKey,
    accessToken,
  );
  if (!user) {
    return { ok: false, status: 401, error: authErr || "Session invalide." };
  }
  const admin = adminClient(url, serviceKey);
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile) {
    return { ok: false, status: 403, error: "Profil introuvable." };
  }
  if (profile.is_platform_admin !== true) {
    return {
      ok: false,
      status: 403,
      error: "Réservé aux super-admins plateforme.",
    };
  }
  return { ok: true, user };
}

export async function provisionOrganization(input: {
  url: string;
  serviceKey: string;
  anonKey: string;
  accessToken: string;
  body: ProvisionOrgInput;
}): Promise<ProvisionOrgResult> {
  const gate = await assertPlatformAdmin(
    input.url,
    input.serviceKey,
    input.anonKey,
    input.accessToken,
  );
  if (!gate.ok) return gate;

  const orgName = input.body.orgName?.trim();
  const adminEmail = input.body.adminEmail?.trim().toLowerCase();
  const planCode = input.body.planCode as PlanCode;
  if (!orgName || !adminEmail) {
    return { ok: false, status: 400, error: "Nom org et e-mail requis." };
  }
  const pkg = PLAN_PACKAGES[planCode as keyof typeof PLAN_PACKAGES];
  if (!pkg) {
    return { ok: false, status: 400, error: "Formule inconnue." };
  }

  const admin = adminClient(input.url, input.serviceKey);
  const { data: plan, error: planErr } = await admin
    .from("commercial_plans")
    .select("id, code, max_seats")
    .eq("code", planCode)
    .maybeSingle();
  if (planErr || !plan) {
    return {
      ok: false,
      status: 400,
      error: "Formule absente en base — lance la migration plans.",
    };
  }

  const status = pkg.activateOnCreate;
  const trialEndsAt =
    pkg.trialDays != null
      ? new Date(Date.now() + pkg.trialDays * 86400000).toISOString()
      : null;

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: orgName,
      commercial_plan_id: plan.id,
      seat_quantity: pkg.maxSeats,
      subscription_status: status,
      trial_ends_at: trialEndsAt,
    })
    .select("id")
    .single();
  if (orgErr || !org) {
    return {
      ok: false,
      status: 500,
      error: orgErr?.message || "Création org impossible.",
    };
  }

  const redirectTo =
    input.body.redirectTo ||
    `${process.env.URL || process.env.DEPLOY_PRIME_URL || "http://localhost:5173"}/`;

  const { data: invited, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(adminEmail, {
      data: {
        full_name: input.body.adminName?.trim() || null,
        organization_id: org.id,
        role: "admin",
      },
      redirectTo,
    });

  if (inviteErr || !invited.user) {
    await admin.from("organizations").delete().eq("id", org.id);
    return {
      ok: false,
      status: 500,
      error: inviteErr?.message || "Invitation admin échouée.",
    };
  }

  // Assurer le profil (trigger peut avoir tourné)
  await admin.from("profiles").upsert({
    id: invited.user.id,
    email: adminEmail,
    full_name: input.body.adminName?.trim() || null,
    role: "admin",
    organization_id: org.id,
  });

  return {
    ok: true,
    orgId: org.id,
    userId: invited.user.id,
    activated: status === "trialing" || status === "active",
  };
}

export async function activateOrganization(input: {
  url: string;
  serviceKey: string;
  anonKey: string;
  accessToken: string;
  orgId: string;
}): Promise<
  | { ok: true }
  | { ok: false; status: number; error: string }
> {
  const gate = await assertPlatformAdmin(
    input.url,
    input.serviceKey,
    input.anonKey,
    input.accessToken,
  );
  if (!gate.ok) return gate;

  const admin = adminClient(input.url, input.serviceKey);
  const { error } = await admin
    .from("organizations")
    .update({
      subscription_status: "active",
      trial_ends_at: null,
    })
    .eq("id", input.orgId);
  if (error) {
    return { ok: false, status: 500, error: error.message };
  }
  return { ok: true };
}
