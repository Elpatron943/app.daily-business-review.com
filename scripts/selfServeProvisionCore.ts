import { createClient } from "@supabase/supabase-js";
import { PLAN_PACKAGES, type PlanCode } from "../src/billing/entitlements";

export type SelfServePlan = "freemium" | "sales";

export type SelfServeProvisionBody = {
  email: string;
  name: string;
  phone?: string;
  company?: string;
  plan: SelfServePlan;
  password?: string;
  trialDays?: number;
  maxOpportunities?: number;
  locale?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
};

export type SelfServeProvisionResult =
  | {
      ok: true;
      loginUrl: string;
      orgId: string;
      userId: string;
      /**
       * Lien personnel « Créer mon mot de passe » (compte sans mot de passe).
       * Le site l'envoie lui-même dans l'e-mail de bienvenue DBR : Supabase n'envoie
       * plus d'e-mail d'invitation (expéditeur générique, en anglais, souvent en Promotions).
       */
      setPasswordUrl?: string;
    }
  | { ok: false; status: number; error: string };

/** Lien vers l'app, vérifié par l'app elle-même (verifyOtp), sans redirection Supabase. */
export function buildSetPasswordUrl(
  loginUrl: string,
  hashedToken: string,
  type: "invite" | "recovery",
): string {
  const u = new URL(loginUrl);
  u.searchParams.set("token_hash", hashedToken);
  u.searchParams.set("type", type);
  return u.toString();
}

/** Compte existant qui ne s'est jamais connecté : lien pour choisir son mot de passe. */
async function recoveryLinkIfNeverSignedIn(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  email: string,
  loginUrl: string,
): Promise<string | undefined> {
  const { data } = await admin.auth.admin.getUserById(userId);
  if (!data?.user || data.user.last_sign_in_at) return undefined;
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: loginUrl },
  });
  const hashed = link?.properties?.hashed_token;
  if (error || !hashed) return undefined;
  return buildSetPasswordUrl(loginUrl, hashed, "recovery");
}

export function adminClient(url: string, serviceKey: string) {
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function mapPlan(plan: SelfServePlan): PlanCode {
  return plan === "sales" ? "sales_solo" : "freemium";
}

export async function findAuthUserIdByEmail(
  admin: ReturnType<typeof adminClient>,
  email: string,
): Promise<string | null> {
  const perPage = 200;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const found = users.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    if (found) return found.id;
    if (users.length < perPage) break;
  }
  return null;
}

/**
 * Provisionnement appelé par le site marketing (clé API, pas session admin).
 * Freemium → org trialing + user avec mot de passe fourni.
 * Sales → org active (paiement déjà confirmé côté Stripe) + user.
 */
export async function selfServeProvision(input: {
  url: string;
  serviceKey: string;
  body: SelfServeProvisionBody;
  appLoginUrl: string;
}): Promise<SelfServeProvisionResult> {
  const email = input.body.email.trim().toLowerCase();
  const name = input.body.name.trim() || email.split("@")[0];
  const planCode = mapPlan(input.body.plan);
  const pkg = PLAN_PACKAGES[planCode as keyof typeof PLAN_PACKAGES];
  if (!email || !email.includes("@") || !pkg) {
    return { ok: false, status: 400, error: "E-mail ou formule invalide." };
  }

  const admin = adminClient(input.url, input.serviceKey);
  const loginUrl = input.appLoginUrl.replace(/\/$/, "") + "/";

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

  const existingUserId = await findAuthUserIdByEmail(admin, email);
  if (existingUserId) {
    if (input.body.plan === "freemium") {
      return {
        ok: false,
        status: 409,
        error: "Un compte existe déjà avec cet e-mail.",
      };
    }

    // Sales : activer / upgrader l’org existante après paiement Stripe
    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", existingUserId)
      .maybeSingle();

    if (profile?.organization_id) {
      const { error: upErr } = await admin
        .from("organizations")
        .update({
          commercial_plan_id: plan.id,
          seat_quantity: pkg.maxSeats,
          subscription_status: "active",
          trial_ends_at: null,
        })
        .eq("id", profile.organization_id);
      if (upErr) {
        return { ok: false, status: 500, error: upErr.message };
      }
      return {
        ok: true,
        loginUrl,
        orgId: profile.organization_id,
        userId: existingUserId,
        setPasswordUrl: await recoveryLinkIfNeverSignedIn(
          admin,
          existingUserId,
          email,
          loginUrl,
        ),
      };
    }

    return {
      ok: false,
      status: 409,
      error: "Un compte existe déjà avec cet e-mail (sans organisation).",
    };
  }

  const trialDays =
    input.body.trialDays ??
    (pkg.trialDays != null ? pkg.trialDays : null);
  // Après paiement Stripe, Sales est immédiatement actif.
  const status =
    input.body.plan === "sales"
      ? "active"
      : pkg.activateOnCreate === "trialing"
        ? "trialing"
        : "active";
  const trialEndsAt =
    status === "trialing" && trialDays != null
      ? new Date(Date.now() + trialDays * 86400000).toISOString()
      : null;

  const orgName =
    input.body.company?.trim() ||
    `${name} — ${input.body.plan === "sales" ? "Sales" : "Freemium"}`;

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

  const password = input.body.password?.trim() || "";

  if (input.body.plan === "freemium" && password.length < 8) {
    await admin.from("organizations").delete().eq("id", org.id);
    return {
      ok: false,
      status: 400,
      error: "Mot de passe requis (8 caractères min.).",
    };
  }

  if (password.length >= 8) {
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: name,
          role: "admin",
          organization_id: org.id,
          phone: input.body.phone || null,
          stripe_customer_id: input.body.stripeCustomerId || null,
          stripe_subscription_id: input.body.stripeSubscriptionId || null,
        },
      });

    if (createErr || !created.user) {
      await admin.from("organizations").delete().eq("id", org.id);
      return {
        ok: false,
        status: 500,
        error: createErr?.message || "Création utilisateur échouée.",
      };
    }

    await admin.from("profiles").upsert({
      id: created.user.id,
      email,
      full_name: name,
      role: "admin",
      organization_id: org.id,
    });

    return {
      ok: true,
      loginUrl,
      orgId: org.id,
      userId: created.user.id,
    };
  }

  // Sales sans mot de passe : on crée l'utilisateur et un lien d'invitation SANS e-mail
  // Supabase ; le lien part dans l'e-mail de bienvenue DBR envoyé par le site (Resend).
  const { data: invited, error: inviteErr } =
    await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: {
          full_name: name,
          organization_id: org.id,
          role: "admin",
          phone: input.body.phone || null,
          stripe_customer_id: input.body.stripeCustomerId || null,
          stripe_subscription_id: input.body.stripeSubscriptionId || null,
        },
        redirectTo: loginUrl,
      },
    });

  const hashedToken = invited?.properties?.hashed_token;
  if (inviteErr || !invited?.user || !hashedToken) {
    await admin.from("organizations").delete().eq("id", org.id);
    return {
      ok: false,
      status: 500,
      error: inviteErr?.message || "Invitation utilisateur échouée.",
    };
  }

  await admin.from("profiles").upsert({
    id: invited.user.id,
    email,
    full_name: name,
    role: "admin",
    organization_id: org.id,
  });

  return {
    ok: true,
    loginUrl,
    orgId: org.id,
    userId: invited.user.id,
    setPasswordUrl: buildSetPasswordUrl(loginUrl, hashedToken, "invite"),
  };
}

export function assertProvisionApiKey(
  authHeader: string | undefined,
  expectedKey: string,
): boolean {
  if (!expectedKey) return false;
  const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === expectedKey;
}
