import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../supabase/client";
import {
  isAppRole,
  roleLabel,
  type AppRole,
  type UserProfile,
} from "./types";
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

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: AppRole | null;
  isAdmin: boolean;
  team: UserProfile[];
  profileError: string | null;
  /** True après clic sur le lien e-mail de reset (event PASSWORD_RECOVERY). */
  passwordRecovery: boolean;
  organization: OrganizationBilling | null;
  billing: BillingState;
  setActiveOpportunityCount: (count: number) => void;
  refreshBilling: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  /** Envoie un e-mail de reset (via SMTP Resend une fois configuré). */
  resetPassword: (email: string) => Promise<string | null>;
  /** Définit le nouveau mot de passe pendant une session de recovery. */
  updatePassword: (password: string) => Promise<string | null>;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshTeam: () => Promise<void>;
  updateTeamMember: (
    userId: string,
    patch: { role?: AppRole; manager_id?: string | null; full_name?: string },
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
    manager_id: typeof row.manager_id === "string" ? row.manager_id : null,
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
  if (!supabase) return { profile: null, error: "Supabase non configuré." };
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || /relation .* does not exist/i.test(error.message)) {
      return {
        profile: null,
        error:
          "Table profiles absente — exécute supabase/schema.sql dans le SQL Editor Supabase.",
      };
    }
    return { profile: null, error: error.message };
  }
  if (!data) {
    return {
      profile: null,
      error:
        "Profil introuvable. Vérifie le trigger handle_new_user (schema.sql).",
    };
  }
  return { profile: mapProfile(data as Record<string, unknown>), error: null };
}

async function fetchTeam(isAdmin: boolean): Promise<UserProfile[]> {
  if (!supabase || !isAdmin) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
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
        setLoading(false);
        return;
      }
      setLoading(true);
      const { profile: p, error } = await fetchProfile(next.user.id);
      setProfile(p);
      setProfileError(error);
      if (p?.role === "admin") {
        setTeam(await fetchTeam(true));
      } else {
        setTeam([]);
      }
      await refreshBilling(p?.organization_id ?? null);
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

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return "Supabase n’est pas configuré.";
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return error?.message ?? null;
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) return "Supabase n’est pas configuré.";
    const trimmed = email.trim();
    if (!trimmed) return "Indique ton e-mail.";
    const redirectTo = `${window.location.origin}/`;
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo,
    });
    return error?.message ?? null;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) return "Supabase n’est pas configuré.";
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
    if (profile?.role !== "admin") {
      setTeam([]);
      return;
    }
    setTeam(await fetchTeam(true));
    await refreshBilling(profile.organization_id);
  }, [profile, refreshBilling]);

  const updateTeamMember = useCallback(
    async (
      userId: string,
      patch: { role?: AppRole; manager_id?: string | null; full_name?: string },
    ) => {
      if (!supabase) return "Supabase n’est pas configuré.";
      if (profile?.role !== "admin") return "Réservé aux admins.";
      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", userId);
      if (error) return error.message;
      await refreshTeam();
      if (userId === profile.id) await refreshProfile();
      return null;
    },
    [profile, refreshProfile, refreshTeam],
  );

  const role = profile?.role ?? null;
  const isAdmin = role === "admin";

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
      updateTeamMember,
    }),
    [
      loading,
      session,
      profile,
      role,
      isAdmin,
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

export { roleLabel };
export type { AppRole, UserProfile };
