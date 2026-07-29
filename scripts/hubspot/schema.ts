import type { SupabaseClient } from "@supabase/supabase-js";
import { withOrgHubSpotClient } from "./client";

export type HubSpotPropOption = {
  name: string;
  label: string;
  type?: string;
};

export type HubSpotStageOption = {
  id: string;
  label: string;
  pipelineId: string;
  pipelineLabel: string;
};

async function listProperties(
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
  objectType: "companies" | "contacts" | "deals",
): Promise<HubSpotPropOption[]> {
  const data = await request<{
    results?: Array<{
      name?: string;
      label?: string;
      type?: string;
      hidden?: boolean;
      calculated?: boolean;
    }>;
  }>(`/crm/v3/properties/${objectType}`);
  return (data.results || [])
    .filter((p) => p.name && !p.hidden)
    .map((p) => ({
      name: String(p.name),
      label: String(p.label || p.name),
      type: p.type,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

async function listDealStages(
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
): Promise<HubSpotStageOption[]> {
  const data = await request<{
    results?: Array<{
      id?: string;
      label?: string;
      stages?: Array<{ id?: string; label?: string }>;
    }>;
  }>("/crm/v3/pipelines/deals");
  const out: HubSpotStageOption[] = [];
  for (const pipe of data.results || []) {
    const pipelineId = String(pipe.id || "");
    const pipelineLabel = String(pipe.label || pipelineId);
    for (const st of pipe.stages || []) {
      if (!st.id) continue;
      out.push({
        id: String(st.id),
        label: String(st.label || st.id),
        pipelineId,
        pipelineLabel,
      });
    }
  }
  return out;
}

export type HubSpotOwnerOption = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  label: string;
};

async function listOwners(
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
): Promise<HubSpotOwnerOption[]> {
  const data = await request<{
    results?: Array<{
      id?: string | number;
      email?: string;
      firstName?: string;
      lastName?: string;
    }>;
  }>("/crm/v3/owners?limit=500");
  return (data.results || [])
    .filter((o) => o.id != null)
    .map((o) => {
      const firstName = String(o.firstName || "").trim();
      const lastName = String(o.lastName || "").trim();
      const email = String(o.email || "").trim();
      const name = [firstName, lastName].filter(Boolean).join(" ").trim();
      return {
        id: String(o.id),
        email,
        firstName,
        lastName,
        label: name || email || String(o.id),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

export async function loadHubSpotSchema(input: {
  db: SupabaseClient;
  organizationId: string;
  clientId: string;
  clientSecret: string;
  tokenSecret: string;
}): Promise<{
  companyProps: HubSpotPropOption[];
  contactProps: HubSpotPropOption[];
  dealProps: HubSpotPropOption[];
  stages: HubSpotStageOption[];
  owners: HubSpotOwnerOption[];
}> {
  const hs = await withOrgHubSpotClient(input.db, input.organizationId, {
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    tokenSecret: input.tokenSecret,
  });
  const [companyProps, contactProps, dealProps, stages, owners] =
    await Promise.all([
      listProperties(hs.request, "companies"),
      listProperties(hs.request, "contacts"),
      listProperties(hs.request, "deals"),
      listDealStages(hs.request),
      listOwners(hs.request),
    ]);
  return { companyProps, contactProps, dealProps, stages, owners };
}
