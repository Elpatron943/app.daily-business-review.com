import type { SupabaseClient } from "@supabase/supabase-js";
import { CRM_PROVIDER_HUBSPOT } from "./crmProvider";

/** Mapping configurable par organisation (stocké dans crm_connections.meta.hubspotMapping). */
export type HubSpotMappingConfig = {
  company: {
    nameProp: string;
    domainProp: string;
    sectorProp: string;
    /** Propriété HS owner → accounts.owner_profile_id */
    ownerProp: string;
  };
  contact: {
    firstnameProp: string;
    lastnameProp: string;
    titleProp: string;
    emailProp: string;
    phoneProp: string;
    ownerProp: string;
  };
  deal: {
    nameProp: string;
    amountProp: string;
    closeDateProp: string;
    stageProp: string;
    ownerProp: string;
  };
  stageToPhase: Record<string, string>;
  phaseToStage: Record<string, string>;
  /**
   * HubSpot owner id → DBR profiles.id
   * (gestionnaire compte / affaire / contact)
   */
  ownerToProfile: Record<string, string>;
};

export const DBR_PHASE_OPTIONS = [
  "Whitespace",
  "Discovery",
  "Solution Validation",
  "Negotiation",
  "Power Validation",
  "Closed Won",
  "Closed Lost",
] as const;

export const DEFAULT_HUBSPOT_MAPPING: HubSpotMappingConfig = {
  company: {
    nameProp: "name",
    domainProp: "domain",
    sectorProp: "industry",
    ownerProp: "hubspot_owner_id",
  },
  contact: {
    firstnameProp: "firstname",
    lastnameProp: "lastname",
    titleProp: "jobtitle",
    emailProp: "email",
    phoneProp: "phone",
    ownerProp: "hubspot_owner_id",
  },
  deal: {
    nameProp: "dealname",
    amountProp: "amount",
    closeDateProp: "closedate",
    stageProp: "dealstage",
    ownerProp: "hubspot_owner_id",
  },
  stageToPhase: {
    appointmentscheduled: "Whitespace",
    qualifiedtobuy: "Solution Validation",
    presentationscheduled: "Solution Validation",
    decisionmakerboughtin: "Power Validation",
    contractsent: "Negotiation",
    closedwon: "Closed Won",
    closedlost: "Closed Lost",
  },
  phaseToStage: {
    Whitespace: "appointmentscheduled",
    Discovery: "appointmentscheduled",
    "Solution Validation": "qualifiedtobuy",
    Negotiation: "contractsent",
    "Power Validation": "decisionmakerboughtin",
    "Closed Won": "closedwon",
    "Closed Lost": "closedlost",
  },
  ownerToProfile: {},
};

function asRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string" && val.trim()) out[k] = val.trim();
  }
  return out;
}

function mergeObject<T extends Record<string, string>>(
  base: T,
  patch: unknown,
): T {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const next = { ...base };
  for (const key of Object.keys(base) as (keyof T)[]) {
    const v = (patch as Record<string, unknown>)[key as string];
    if (typeof v === "string" && v.trim()) {
      next[key] = v.trim() as T[keyof T];
    }
  }
  return next;
}

export function normalizeHubSpotMapping(
  raw: unknown,
): HubSpotMappingConfig {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    company: mergeObject(DEFAULT_HUBSPOT_MAPPING.company, src.company),
    contact: mergeObject(DEFAULT_HUBSPOT_MAPPING.contact, src.contact),
    deal: mergeObject(DEFAULT_HUBSPOT_MAPPING.deal, src.deal),
    stageToPhase: {
      ...DEFAULT_HUBSPOT_MAPPING.stageToPhase,
      ...asRecord(src.stageToPhase),
    },
    phaseToStage: {
      ...DEFAULT_HUBSPOT_MAPPING.phaseToStage,
      ...asRecord(src.phaseToStage),
    },
    ownerToProfile: asRecord(src.ownerToProfile),
  };
}

export async function loadHubSpotMapping(
  db: SupabaseClient,
  organizationId: string,
): Promise<HubSpotMappingConfig> {
  const { data, error } = await db
    .from("crm_connections")
    .select("meta")
    .eq("organization_id", organizationId)
    .eq("provider", CRM_PROVIDER_HUBSPOT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const meta =
    data?.meta && typeof data.meta === "object"
      ? (data.meta as Record<string, unknown>)
      : {};
  return normalizeHubSpotMapping(meta.hubspotMapping);
}

export async function saveHubSpotMapping(
  db: SupabaseClient,
  organizationId: string,
  mapping: HubSpotMappingConfig,
): Promise<HubSpotMappingConfig> {
  const normalized = normalizeHubSpotMapping(mapping);
  const { data: existing, error: readErr } = await db
    .from("crm_connections")
    .select("meta, status")
    .eq("organization_id", organizationId)
    .eq("provider", CRM_PROVIDER_HUBSPOT)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);

  const prevMeta =
    existing?.meta && typeof existing.meta === "object"
      ? (existing.meta as Record<string, unknown>)
      : {};
  const meta = { ...prevMeta, hubspotMapping: normalized };

  if (existing) {
    const { error } = await db
      .from("crm_connections")
      .update({ meta })
      .eq("organization_id", organizationId)
      .eq("provider", CRM_PROVIDER_HUBSPOT);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from("crm_connections").insert({
      organization_id: organizationId,
      provider: CRM_PROVIDER_HUBSPOT,
      meta,
      status: "disconnected",
    });
    if (error) throw new Error(error.message);
  }
  return normalized;
}

export function prop(
  properties: Record<string, string | null | undefined>,
  key: string,
): string {
  if (!key) return "";
  const v = properties[key];
  return v == null ? "" : String(v).trim();
}

export function resolveOwnerProfileId(
  hubspotOwnerId: string | undefined,
  mapping: HubSpotMappingConfig,
): string | null {
  if (!hubspotOwnerId) return null;
  return mapping.ownerToProfile[hubspotOwnerId] || null;
}
