import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import HubspotMappingPanel from "./HubspotMappingPanel";
import HubspotLogo from "./logos/HubspotLogo";

export type HubspotStatus = {
  status: "connected" | "error" | "disconnected";
  portalId: string | null;
  scopes: string[];
  lastPullAt: string | null;
  lastPushAt: string | null;
  lastError: string | null;
  platformConfigured?: boolean;
  setupHint?: string;
};

async function accessToken(forceRefresh = false): Promise<string | null> {
  if (!supabase) return null;
  if (forceRefresh) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) return null;
    return data.session.access_token;
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) return token;
  const { data: refreshed, error } = await supabase.auth.refreshSession();
  if (error || !refreshed.session?.access_token) return null;
  return refreshed.session.access_token;
}

export async function hubspotFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data?: T; error?: string; status: number }> {
  const token = await accessToken(false);
  if (!token) {
    return { status: 401, error: "Session expirée — reconnecte-toi." };
  }
  const buildHeaders = (access: string): HeadersInit => ({
    Authorization: `Bearer ${access}`,
    "Content-Type": "application/json",
    ...(init?.headers || {}),
  });
  let res = await fetch(`/api/hubspot${path}`, {
    ...init,
    headers: buildHeaders(token),
  });
  // JWT expiré → un seul refresh puis retry
  if (res.status === 401) {
    const fresh = await accessToken(true);
    if (!fresh) {
      return { status: 401, error: "Session expirée — reconnecte-toi." };
    }
    res = await fetch(`/api/hubspot${path}`, {
      ...init,
      headers: buildHeaders(fresh),
    });
  }
  const payload = (await res.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!res.ok) {
    return {
      status: res.status,
      error: payload.error || `Erreur HubSpot (${res.status})`,
    };
  }
  return { status: res.status, data: payload as T };
}

const statusLabel: Record<HubspotStatus["status"], string> = {
  connected: "Connecté",
  error: "Erreur",
  disconnected: "Non connecté",
};

/** Bloc admin — connexion & sync HubSpot. */
export default function HubspotConnectorPanel() {
  const [status, setStatus] = useState<HubspotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const { data, error: err } = await hubspotFetch<HubspotStatus>("/status");
    if (err) {
      setError(err);
      setStatus(null);
    } else if (data) {
      setStatus(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function connect() {
    setBusy("connect");
    setError(null);
    setInfo(null);
    const { data, error: err } = await hubspotFetch<{ url: string }>(
      "/oauth/start",
    );
    setBusy(null);
    if (err || !data?.url) {
      setError(err || "URL OAuth manquante.");
      return;
    }
    window.location.href = data.url;
  }

  async function disconnect() {
    setBusy("disconnect");
    setError(null);
    setInfo(null);
    const { error: err } = await hubspotFetch("/disconnect", {
      method: "POST",
      body: "{}",
    });
    setBusy(null);
    if (err) {
      setError(err);
      return;
    }
    setInfo("HubSpot déconnecté.");
    await refresh();
  }

  async function pull() {
    setBusy("pull");
    setError(null);
    setInfo(null);
    const { data, error: err } = await hubspotFetch<{
      counts?: {
        companies: number;
        contacts: number;
        deals: number;
        soldSolutions?: number;
        errors: string[];
      };
    }>("/sync/pull", { method: "POST", body: "{}" });
    setBusy(null);
    if (err) {
      setError(err);
      await refresh();
      return;
    }
    const c = data?.counts;
    setInfo(
      c
        ? `Pull : ${c.companies} sociétés, ${c.contacts} contacts, ${c.deals} deals${
            c.soldSolutions ? `, ${c.soldSolutions} solutions vendues` : ""
          }.`
        : "Pull terminé.",
    );
    if (c?.errors?.length) {
      setError(c.errors.slice(0, 3).join(" · "));
    }
    await refresh();
  }

  async function push() {
    setBusy("push");
    setError(null);
    setInfo(null);
    const { data, error: err } = await hubspotFetch<{
      counts?: {
        companies: number;
        contacts: number;
        deals: number;
        errors: string[];
      };
    }>("/sync/push", { method: "POST", body: "{}" });
    setBusy(null);
    if (err) {
      setError(err);
      await refresh();
      return;
    }
    const c = data?.counts;
    setInfo(
      c
        ? `Push : ${c.companies} sociétés, ${c.contacts} contacts, ${c.deals} deals.`
        : "Push terminé.",
    );
    if (c?.errors?.length) {
      setError(c.errors.slice(0, 3).join(" · "));
    }
    await refresh();
  }

  const connected = status?.status === "connected";

  return (
    <section className="team-invite-block hubspot-connector">
      <div className="crm-connector-head">
        <HubspotLogo size={32} />
        <div>
          <h3>HubSpot</h3>
          <p className="muted team-admin-hint" style={{ margin: 0 }}>
            Lie le portail HubSpot de ton entreprise (sociétés, contacts,
            deals). HubSpot reste la source de vérité pour les champs CRM.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : (
        <>
          <p>
            Statut :{" "}
            <strong>
              {status ? statusLabel[status.status] : "Inconnu"}
            </strong>
            {status?.portalId ? (
              <span className="meta"> · portail {status.portalId}</span>
            ) : null}
          </p>
          {status?.lastPullAt ? (
            <p className="muted meta">
              Dernier pull :{" "}
              {new Date(status.lastPullAt).toLocaleString("fr-FR")}
            </p>
          ) : null}
          {status?.lastPushAt ? (
            <p className="muted meta">
              Dernier push :{" "}
              {new Date(status.lastPushAt).toLocaleString("fr-FR")}
            </p>
          ) : null}
          {status?.lastError ? (
            <p className="auth-error">{status.lastError}</p>
          ) : null}
          {status?.platformConfigured === false ? (
            <p className="muted warn-hint">
              Le connecteur HubSpot n’est pas encore activé sur cette
              instance. Le bouton « Connecter » sera disponible dès que
              l’intégration plateforme sera en place.
            </p>
          ) : null}
          {status?.setupHint ? (
            <p className="muted warn-hint">{status.setupHint}</p>
          ) : null}
        </>
      )}

      {error ? <p className="auth-error">{error}</p> : null}
      {info ? <p className="auth-info">{info}</p> : null}

      <div className="settings-head-actions" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
        {!connected ? (
          <button
            type="button"
            className="primary-cta"
            disabled={Boolean(busy) || status?.platformConfigured === false}
            onClick={() => void connect()}
            title={
              status?.platformConfigured === false
                ? "Connecteur pas encore activé"
                : undefined
            }
          >
            {busy === "connect" ? "…" : "Connecter HubSpot"}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="primary-cta"
              disabled={Boolean(busy)}
              onClick={() => void pull()}
            >
              {busy === "pull" ? "…" : "Synchroniser (pull)"}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={Boolean(busy)}
              onClick={() => void push()}
            >
              {busy === "push" ? "…" : "Pousser"}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={Boolean(busy)}
              onClick={() => void disconnect()}
            >
              {busy === "disconnect" ? "…" : "Déconnecter"}
            </button>
          </>
        )}
        <button
          type="button"
          className="ghost"
          disabled={Boolean(busy)}
          onClick={() => void refresh()}
        >
          Actualiser statut
        </button>
      </div>

      <HubspotMappingPanel
        hubspotFetch={hubspotFetch}
        connected={connected}
      />
    </section>
  );
}
