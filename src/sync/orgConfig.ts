import type { OrgConfig } from "../config/types";
import { supabase } from "../supabase/client";
import { logSyncError } from "./persistCrm";

function requireClient() {
  if (!supabase) throw new Error("Supabase non configuré.");
  return supabase;
}

/** Charge le blob OrgConfig de l’organisation (ou null si absent / vide). */
export async function loadOrgConfigRemote(
  organizationId: string,
): Promise<unknown | null> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("org_configs")
    .select("config")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const config = data?.config;
  if (config == null) return null;
  if (typeof config !== "object") return null;
  return config;
}

export function isRemoteOrgConfigEmpty(raw: unknown): boolean {
  if (raw == null || typeof raw !== "object") return true;
  const v = (raw as { version?: unknown }).version;
  return v !== 1;
}

/** Persiste le catalogue org (RLS : admin de l’org). */
export async function upsertOrgConfigRemote(
  organizationId: string,
  config: OrgConfig,
  updatedBy?: string | null,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("org_configs").upsert(
    {
      organization_id: organizationId,
      config,
      updated_by: updatedBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) throw new Error(error.message);
}

export function pushOrgConfigRemote(
  organizationId: string,
  config: OrgConfig,
  updatedBy?: string | null,
): void {
  void upsertOrgConfigRemote(organizationId, config, updatedBy).catch((err) =>
    logSyncError("upsertOrgConfig", err),
  );
}
