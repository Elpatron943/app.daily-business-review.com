import { createClient, type User } from "@supabase/supabase-js";

export type InviteUserInput = {
  email: string;
  fullName?: string;
  role?: "admin" | "user";
  redirectTo?: string;
};

export type InviteUserResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

function adminClient(url: string, serviceKey: string) {
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function assertCallerAdmin(
  url: string,
  serviceKey: string,
  accessToken: string,
): Promise<
  | { ok: true; user: User; organizationId: string }
  | { ok: false; status: number; error: string }
> {
  const admin = adminClient(url, serviceKey);
  const { data: userData, error: userErr } = await admin.auth.getUser(
    accessToken,
  );
  if (userErr || !userData.user) {
    return { ok: false, status: 401, error: "Session invalide." };
  }

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileErr || !profile) {
    return { ok: false, status: 403, error: "Profil introuvable." };
  }
  if (profile.role !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "Seul un admin peut ajouter un utilisateur.",
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
    user: userData.user,
    organizationId: String(profile.organization_id),
  };
}

async function seatQuotaAllows(
  url: string,
  serviceKey: string,
  organizationId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const admin = adminClient(url, serviceKey);

  const { count, error: countErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (countErr) {
    return { ok: false, status: 500, error: countErr.message };
  }
  const seatsUsed = count ?? 0;

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select(
      `
      seat_quantity,
      commercial_plans ( max_seats )
    `,
    )
    .eq("id", organizationId)
    .maybeSingle();

  if (orgErr || !org) {
    return { ok: false, status: 400, error: "Organisation introuvable." };
  }

  const planRaw = (org as { commercial_plans?: unknown }).commercial_plans;
  let planMax: number | null = null;
  if (planRaw && typeof planRaw === "object" && !Array.isArray(planRaw)) {
    const ms = (planRaw as { max_seats?: unknown }).max_seats;
    planMax = ms == null ? null : Number(ms);
  }
  const seatQty = (org as { seat_quantity?: unknown }).seat_quantity;
  const limit =
    seatQty == null ? planMax : Number(seatQty);

  if (limit != null && seatsUsed >= limit) {
    return {
      ok: false,
      status: 403,
      error: `Quota de sièges atteint (${seatsUsed}/${limit}). Passez à une formule supérieure.`,
    };
  }
  return { ok: true };
}

/** Invite / crée un user Auth + metadata org (trigger profiles). */
export async function inviteOrganizationUser(
  env: {
    supabaseUrl: string;
    serviceRoleKey: string;
  },
  accessToken: string,
  input: InviteUserInput,
): Promise<InviteUserResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, status: 400, error: "E-mail invalide." };
  }
  const role = input.role === "admin" ? "admin" : "user";
  const fullName = input.fullName?.trim() || "";

  const caller = await assertCallerAdmin(
    env.supabaseUrl,
    env.serviceRoleKey,
    accessToken,
  );
  if (!caller.ok) return caller;

  const quota = await seatQuotaAllows(
    env.supabaseUrl,
    env.serviceRoleKey,
    caller.organizationId,
  );
  if (!quota.ok) return quota;

  const admin = adminClient(env.supabaseUrl, env.serviceRoleKey);
  const redirectTo =
    input.redirectTo?.trim() ||
    (typeof process !== "undefined" && process.env.URL
      ? `${process.env.URL.replace(/\/$/, "")}/`
      : undefined);

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      organization_id: caller.organizationId,
      role,
    },
    redirectTo,
  });

  if (error) {
    return { ok: false, status: 400, error: error.message };
  }
  if (!data.user?.id) {
    return { ok: false, status: 500, error: "Invitation sans utilisateur." };
  }

  // Sécurise le profil (si trigger a déjà créé la ligne)
  await admin
    .from("profiles")
    .update({
      organization_id: caller.organizationId,
      role,
      full_name: fullName || null,
      email,
    })
    .eq("id", data.user.id);

  return { ok: true, userId: data.user.id };
}
