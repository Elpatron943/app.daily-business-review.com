import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { PLAN_PACKAGES } from "../billing/entitlements";
import type { SubscriptionStatus } from "../billing/types";
import { supabase } from "../supabase/client";

type OrgRow = {
  id: string;
  name: string;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  seat_quantity: number | null;
  plan_code: string | null;
  plan_name: string | null;
  created_at: string;
};

type PlanOption = {
  id: string;
  code: string;
  name: string;
};

/**
 * Console plateforme : créer comptes DBR Sales / DBR Pilotage
 * et activer après paiement.
 */
export default function PlatformAdminPanel() {
  const { session, isPlatformAdmin } = useAuth();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [orgName, setOrgName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [planCode, setPlanCode] = useState<"freemium" | "sales_solo" | "enterprise">(
    "sales_solo",
  );

  const load = useCallback(async () => {
    if (!supabase || !isPlatformAdmin) return;
    setError(null);
    const [plansRes, orgsRes] = await Promise.all([
      supabase
        .from("commercial_plans")
        .select("id, code, name")
        .in("code", ["freemium", "sales_solo", "enterprise"])
        .order("sort_order"),
      supabase
        .from("organizations")
        .select(
          "id, name, subscription_status, trial_ends_at, seat_quantity, created_at, commercial_plan_id, commercial_plans(code, name)",
        )
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (plansRes.error) {
      setError(plansRes.error.message);
      return;
    }
    setPlans((plansRes.data ?? []) as PlanOption[]);

    if (orgsRes.error) {
      setError(
        orgsRes.error.message +
          " — applique la migration plateforme / droits RLS si besoin.",
      );
      return;
    }
    const rows = (orgsRes.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const planJoin = r.commercial_plans as
        | { code?: string; name?: string }
        | { code?: string; name?: string }[]
        | null;
      const plan = Array.isArray(planJoin) ? planJoin[0] : planJoin;
      return {
        id: String(r.id),
        name: String(r.name ?? ""),
        subscription_status: (r.subscription_status ??
          "none") as SubscriptionStatus,
        trial_ends_at:
          r.trial_ends_at == null ? null : String(r.trial_ends_at),
        seat_quantity:
          typeof r.seat_quantity === "number" ? r.seat_quantity : null,
        plan_code: plan?.code ?? null,
        plan_name: plan?.name ?? null,
        created_at: String(r.created_at ?? ""),
      } satisfies OrgRow;
    });
    setOrgs(rows);
  }, [isPlatformAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!session?.access_token) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/.netlify/functions/provision-org", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          orgName,
          adminEmail,
          adminName: adminName || undefined,
          planCode,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        orgId?: string;
        activated?: boolean;
      };
      if (!res.ok) {
        setError(data.error || `Erreur ${res.status}`);
        return;
      }
      setInfo(
        data.activated
          ? `Compte créé et actif (DBR Sales essai). Org ${data.orgId ?? ""}.`
          : `Compte créé — en attente de paiement. Active-le après règlement. Org ${data.orgId ?? ""}.`,
      );
      setOrgName("");
      setAdminEmail("");
      setAdminName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec provisionnement.");
    } finally {
      setBusy(false);
    }
  }

  async function activateOrg(orgId: string) {
    if (!session?.access_token) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/.netlify/functions/provision-org", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "activate", orgId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || `Erreur ${res.status}`);
        return;
      }
      setInfo("Abonnement activé — le compte est live.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec activation.");
    } finally {
      setBusy(false);
    }
  }

  if (!isPlatformAdmin) {
    return (
      <div className="data-page">
        <p className="muted">Accès réservé aux super-admins plateforme.</p>
      </div>
    );
  }

  const pkg = PLAN_PACKAGES[planCode];

  return (
    <div className="data-page platform-admin-page">
      <header className="data-page-head">
        <div>
          <h1>Console admin</h1>
          <p className="muted">
            Créer des comptes DBR Sales / DBR Pilotage. Sales et Pilotage
            passent live après paiement (bouton Activer). L’essai Sales
            démarre {PLAN_PACKAGES.freemium.trialDays} jours.
          </p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {info ? <p className="muted">{info}</p> : null}

      <section className="platform-admin-create">
        <h2>Nouveau compte</h2>
        <form className="settings-add" onSubmit={onCreate}>
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Nom organisation"
            required
          />
          <input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="E-mail admin"
            required
          />
          <input
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            placeholder="Nom admin (opt.)"
          />
          <select
            value={planCode}
            onChange={(e) =>
              setPlanCode(e.target.value as typeof planCode)
            }
            aria-label="Formule"
          >
            {(
              ["freemium", "sales_solo", "enterprise"] as const
            ).map((code) => (
              <option key={code} value={code}>
                {PLAN_PACKAGES[code].name}
                {plans.find((p) => p.code === code) ? "" : " (seed manquant)"}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy}>
            Créer + inviter
          </button>
        </form>
        <p className="muted platform-admin-pkg-hint">
          {pkg.name} · sièges {pkg.maxSeats ?? "∞"} · opp{" "}
          {pkg.maxActiveOpportunities ?? "∞"}
          {pkg.trialDays != null ? ` · ${pkg.trialDays} j` : ""} ·{" "}
          {pkg.activateOnCreate === "trialing"
            ? "actif (essai)"
            : "en attente paiement"}
        </p>
      </section>

      <section className="platform-admin-list">
        <h2>Organisations récentes</h2>
        <ul className="settings-list">
          {orgs.length === 0 ? (
            <li className="muted">Aucune org visible.</li>
          ) : (
            orgs.map((o) => (
              <li key={o.id} className="platform-admin-org-row">
                <div>
                  <strong>{o.name}</strong>
                  <em className="muted">
                    {" "}
                    · {o.plan_name ?? o.plan_code ?? "—"} ·{" "}
                    {o.subscription_status}
                    {o.trial_ends_at
                      ? ` · fin ${new Date(o.trial_ends_at).toLocaleDateString()}`
                      : ""}
                  </em>
                </div>
                {(o.subscription_status === "none" ||
                  o.subscription_status === "canceled") && (
                  <button
                    type="button"
                    className="primary-cta"
                    disabled={busy}
                    onClick={() => void activateOrg(o.id)}
                  >
                    Activer (paiement reçu)
                  </button>
                )}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
