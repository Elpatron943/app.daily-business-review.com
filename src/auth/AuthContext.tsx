import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../supabase/client";
import {
  isAppRole,
  type AppRole,
  type UserProfile,
} from "./types";
import {
  can,
  canAssignOwner,
  canViewAllAccounts,
  canWriteDomain,
  type Permission,
} from "./permissions";
import {
  countOrganizationSeats,
  loadOrganizationBilling,
} from "../billing/loadOrganizationBilling";
import {
  effectiveOppLimit,
  effectiveSeatLimit,
  isWriteLocked,
  type BillingState,
  type OrganizationBilling,
} from "../billing/types";
import { normalizeOptionalModules } from "../billing/optionalModules";

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: AppRole | null;
  isAdmin: boolean;
  /** Capacité RBAC (hors verrou billing). */
  can: (permission: Permission) => boolean;
  canWriteDomain: boolean;
  canViewAllAccounts: boolean;
  canAssignOwner: boolean;
  team: UserProfile[];
  profileError: string | null;
  /** True après clic sur le lien e-mail de reset (event PASSWORD_RECOVERY). */
  passwordRecovery: boolean;
  organization: OrganizationBilling | null;
  billing: BillingState;
  setActiveOpportunityCount: (count: number) => void;
  refreshBilling: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  /** Envoie un e-mail de reset de mot de passe. */
  resetPassword: (email: string) => Promise<string | null>;
  /** Définit le nouveau mot de passe pendant une session de recovery. */
  updatePassword: (password: string) => Promise<string | null>;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshTeam: () => Promise<void>;
  /** Invite un utilisateur (admin only). */
  inviteUser: (input: {
    email: string;
    fullName?: string;
    role?: AppRole;
  }) => Promise<string | null>;
  updateTeamMember: (
    userId: string,
    patch: { role?: AppRole; full_name?: string },
  ) => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function mapProfile(row: Record<string, unknown>): UserProfile | null {
  if (!row || typeof row.id !== "string") return null;
  const role = isAppRole(row.role) ? row.role : "user";
  return {
    id: row.id,
    email: typeof row.email === "string" ? row.email : "",
    full_name: typeof row.full_name === "string" ? row.full_name : null,
    role,
    organization_id:
      typeof row.organization_id === "string" ? row.organization_id : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

async function fetchProfile(userId: string): Promise<{
  profile: UserProfile | null;
  error: string | null;
}> {
  if (!supabase) {
    return {
      profile: null,
      error: "Service indisponible. Réessaie plus tard.",
    };
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || /relation .* does not exist/i.test(error.message)) {
      return {
        profile: null,
        error: "Profil indisponible. Contacte ton administrateur.",
      };
    }
    return { profile: null, error: error.message };
  }
  if (!data) {
    return {
      profile: null,
      error:
        "Profil introuvable. Déconnecte-toi puis reconnecte-toi, ou contacte ton administrateur.",
    };
  }
  return { profile: mapProfile(data as Record<string, unknown>), error: null };
}

async function fetchTeam(
  organizationId: string | null,
): Promise<UserProfile[]> {
  if (!supabase || !organizationId) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data
    .map((row) => mapProfile(row as Record<string, unknown>))
    .filter((p): p is UserProfile => Boolean(p));
}

function buildBilling(
  organization: OrganizationBilling | null,
  seatsUsed: number,
  activeOpportunities: number,
): BillingState {
  const seatsLimit = effectiveSeatLimit(organization);
  const opportunitiesLimit = effectiveOppLimit(organization);
  const seatsFull = seatsLimit != null && seatsUsed >= seatsLimit;
  const opportunitiesFull =
    opportunitiesLimit != null && activeOpportunities >= opportunitiesLimit;
  return {
    organization,
    usage: {
      seatsUsed,
      seatsLimit,
      activeOpportunities,
      opportunitiesLimit,
    },
    canWrite: !isWriteLocked(organization?.subscription_status),
    seatsFull,
    opportunitiesFull,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [team, setTeam] = useState<UserProfile[]>([]);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [organization, setOrganization] = useState<OrganizationBilling | null>(
    null,
  );
  const [seatsUsed, setSeatsUsed] = useState(0);
  const [activeOpportunityCount, setActiveOpportunityCount] = useState(0);
  /** Évite de remonter l’écran « Chargement… » sur TOKEN_REFRESHED (ex. Settings CRM). */
  const bootstrappedRef = useRef(false);
  const profileUserIdRef = useRef<string | null>(null);

  const refreshBilling = useCallback(async (orgId?: string | null) => {
    const id = orgId ?? null;
    if (!id) {
      setOrganization(null);
      setSeatsUsed(0);
      return;
    }
    const [org, seats] = await Promise.all([
      loadOrganizationBilling(id),
      countOrganizationSeats(id),
    ]);
    setOrganization(org);
    setSeatsUsed(seats);
  }, []);

  const hydrate = useCallback(
    async (next: Session | null) => {
      setSession(next);
      if (!next?.user) {
        setProfile(null);
        setTeam([]);
        setProfileError(null);
        setOrganization(null);
        setSeatsUsed(0);
        profileUserIdRef.current = null;
        bootstrappedRef.current = true;
        setLoading(false);
        return;
      }
      const sameUser = profileUserIdRef.current === next.user.id;
      // Premier chargement seulement : un refresh de session ne doit pas démonter l’UI.
      if (!bootstrappedRef.current || !sameUser) {
        setLoading(true);
      }
      const { profile: p, error } = await fetchProfile(next.user.id);
      if (p) {
        setProfile(p);
        setProfileError(error);
        profileUserIdRef.current = p.id;
        setTeam(await fetchTeam(p.organization_id));
        await refreshBilling(p.organization_id ?? null);
      } else if (!bootstrappedRef.current || !sameUser) {
        setProfile(null);
        setProfileError(error);
        profileUserIdRef.current = null;
        setTeam([]);
        await refreshBilling(null);
      } else if (error) {
        // Refresh token : garder le profil déjà affiché si le fetch échoue brièvement.
        setProfileError(error);
      }
      bootstrappedRef.current = true;
      setLoading(false);
    },
    [refreshBilling],
  );

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const hash = window.location.hash.replace(/^#/, "");
    const search = window.location.search.replace(/^\?/, "");
    const params = new URLSearchParams(hash || search);
    if (params.get("type") === "recovery") {
      setPasswordRecovery(true);
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      void hydrate(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }
      if (event === "SIGNED_OUT") {
        setPasswordRecovery(false);
      }
      void hydrate(next);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [hydrate]);

  /** Activation modules optionnels : push realtime depuis la console plateforme. */
  useEffect(() => {
    const client = supabase;
    const orgId = profile?.organization_id;
    if (!client || !orgId) return;

    const channel = client
      .channel(`org-modules-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "organizations",
          filter: `id=eq.${orgId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          setOrganization((prev) => {
            if (!prev || prev.id !== orgId) return prev;
            return {
              ...prev,
              name:
                typeof row.name === "string" && row.name.trim()
                  ? row.name
                  : prev.name,
              optional_modules: normalizeOptionalModules(row.optional_modules),
              seat_quantity:
                row.seat_quantity == null
                  ? null
                  : Number(row.seat_quantity),
              subscription_status:
                row.subscription_status === "none" ||
                row.subscription_status === "trialing" ||
                row.subscription_status === "active" ||
                row.subscription_status === "past_due" ||
                row.subscription_status === "canceled"
                  ? row.subscription_status
                  : prev.subscription_status,
              trial_ends_at:
                row.trial_ends_at == null
                  ? null
                  : String(row.trial_ends_at),
            };
          });
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [profile?.organization_id]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return "Service indisponible. Réessaie plus tard.";
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return error?.message ?? null;
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) return "Service indisponible. Réessaie plus tard.";
    const trimmed = email.trim();
    if (!trimmed) return "Indique ton e-mail.";
    const redirectTo = `${window.location.origin}/`;
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo,
    });
    return error?.message ?? null;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) return "Service indisponible. Réessaie plus tard.";
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return error.message;
    setPasswordRecovery(false);
    if (window.location.hash || window.location.search.includes("code=")) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    return null;
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setPasswordRecovery(false);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setPasswordRecovery(false);
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return;
    const { profile: p, error } = await fetchProfile(session.user.id);
    setProfile(p);
    setProfileError(error);
    await refreshBilling(p?.organization_id ?? null);
  }, [session, refreshBilling]);

  const refreshTeam = useCallback(async () => {
    if (!profile?.organization_id) {
      setTeam([]);
      return;
    }
    setTeam(await fetchTeam(profile.organization_id));
    await refreshBilling(profile.organization_id);
  }, [profile, refreshBilling]);

  const inviteUser = useCallback(
    async (input: {
      email: string;
      fullName?: string;
      role?: AppRole;
    }) => {
      if (!supabase) return "Service indisponible. Réessaie plus tard.";
      if (profile?.role !== "admin") {
        return "Seul un admin peut ajouter un utilisateur.";
      }
      // getSession() seul peut renvoyer un JWT expiré → 401 côté proxy.
      const { data: refreshed, error: refreshErr } =
        await supabase.auth.refreshSession();
      const accessToken = refreshed.session?.access_token;
      if (refreshErr || !accessToken) {
        return "Session expirée — reconnecte-toi.";
      }

      const res = await fetch("/api/invite-user", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: input.email,
          fullName: input.fullName,
          role: input.role ?? "user",
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };
      if (!res.ok) {
        return payload.error || `Invitation impossible (${res.status}).`;
      }
      await refreshTeam();
      return null;
    },
    [profile, refreshTeam],
  );

  const updateTeamMember = useCallback(
    async (
      userId: string,
      patch: { role?: AppRole; full_name?: string },
    ) => {
      if (!supabase) return "Service indisponible. Réessaie plus tard.";
      if (profile?.role !== "admin") {
        return "Seul un admin peut modifier un profil.";
      }
      if (!profile.organization_id) {
        return "Organisation manquante.";
      }

      const { data: target, error: targetErr } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", userId)
        .maybeSingle();
      if (targetErr) return targetErr.message;
      if (
        !target ||
        target.organization_id !== profile.organization_id
      ) {
        return "Profil hors de ton organisation.";
      }

      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", userId)
        .eq("organization_id", profile.organization_id);
      if (error) return error.message;
      await refreshTeam();
      if (userId === profile.id) await refreshProfile();
      return null;
    },
    [profile, refreshProfile, refreshTeam],
  );

  const role = profile?.role ?? null;
  const isAdmin = role === "admin";
  const canWriteDomainFlag = canWriteDomain(role);
  const canViewAllAccountsFlag = canViewAllAccounts(role);
  const canAssignOwnerFlag = canAssignOwner(role);

  const billing = useMemo(
    () => buildBilling(organization, seatsUsed, activeOpportunityCount),
    [organization, seatsUsed, activeOpportunityCount],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      role,
      isAdmin,
      can: (permission: Permission) => can(role, permission),
      canWriteDomain: canWriteDomainFlag,
      canViewAllAccounts: canViewAllAccountsFlag,
      canAssignOwner: canAssignOwnerFlag,
      team,
      profileError,
      passwordRecovery,
      organization,
      billing,
      setActiveOpportunityCount,
      refreshBilling: () => refreshBilling(profile?.organization_id ?? null),
      signIn,
      resetPassword,
      updatePassword,
      clearPasswordRecovery,
      signOut,
      refreshProfile,
      refreshTeam,
      inviteUser,
      updateTeamMember,
    }),
    [
      loading,
      session,
      profile,
      role,
      isAdmin,
      canWriteDomainFlag,
      canViewAllAccountsFlag,
      canAssignOwnerFlag,
      team,
      profileError,
      passwordRecovery,
      organization,
      billing,
      refreshBilling,
      signIn,
      resetPassword,
      updatePassword,
      clearPasswordRecovery,
      signOut,
      refreshProfile,
      refreshTeam,
      inviteUser,
      updateTeamMember,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { roleLabel, APP_ROLES } from "./types";
export type { AppRole, UserProfile } from "./types";
export type { Permission } from "./permissions";
