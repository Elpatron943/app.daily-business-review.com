import type { HubSpotCrmObject } from "./types";
import {
  DEFAULT_HUBSPOT_MAPPING,
  prop,
  resolveOwnerProfileId,
  type HubSpotMappingConfig,
} from "./mappingConfig";

export function dealToOpportunityPatch(
  obj: HubSpotCrmObject,
  mapping: HubSpotMappingConfig = DEFAULT_HUBSPOT_MAPPING,
): {
  hubspotDealId: string;
  name: string;
  amount: number;
  closeDate: string;
  phase: string;
  associatedCompanyId?: string;
  ownerProfileId: string | null;
  hubspotOwnerId?: string;
} {
  const stageRaw = prop(obj.properties, mapping.deal.stageProp);
  const stageKey = stageRaw.toLowerCase();
  const phase =
    mapping.stageToPhase[stageRaw] ||
    mapping.stageToPhase[stageKey] ||
    stageRaw ||
    "Whitespace";
  const amountRaw = prop(obj.properties, mapping.deal.amountProp);
  const amount = amountRaw !== "" ? Number(amountRaw) : 0;
  const close = prop(obj.properties, mapping.deal.closeDateProp).slice(0, 10);
  const hubspotOwnerId =
    prop(obj.properties, mapping.deal.ownerProp) || undefined;

  return {
    hubspotDealId: obj.id,
    name: prop(obj.properties, mapping.deal.nameProp) || `Deal ${obj.id}`,
    amount: Number.isFinite(amount) ? amount : 0,
    closeDate: close,
    phase,
    associatedCompanyId:
      prop(obj.properties, "associatedcompanyid") || undefined,
    hubspotOwnerId,
    ownerProfileId: resolveOwnerProfileId(hubspotOwnerId, mapping),
  };
}

export function opportunityToDealProperties(
  input: {
    name: string;
    amount: number;
    closeDate?: string;
    phase?: string;
  },
  mapping: HubSpotMappingConfig = DEFAULT_HUBSPOT_MAPPING,
): Record<string, string> {
  const props: Record<string, string> = {
    [mapping.deal.nameProp]: input.name,
    [mapping.deal.amountProp]: String(input.amount ?? 0),
  };
  if (input.closeDate && mapping.deal.closeDateProp) {
    props[mapping.deal.closeDateProp] = input.closeDate;
  }
  const stage =
    (input.phase && mapping.phaseToStage[input.phase]) || undefined;
  if (stage && mapping.deal.stageProp) {
    props[mapping.deal.stageProp] = stage;
  }
  return props;
}

export function dealPullProperties(
  mapping: HubSpotMappingConfig = DEFAULT_HUBSPOT_MAPPING,
): string[] {
  return [
    mapping.deal.nameProp,
    mapping.deal.amountProp,
    mapping.deal.closeDateProp,
    mapping.deal.stageProp,
    mapping.deal.ownerProp,
    "pipeline",
    "associatedcompanyid",
    "hs_lastmodifieddate",
  ].filter(Boolean);
}

export const DEAL_PULL_PROPERTIES = dealPullProperties();

export const HUBSPOT_STAGE_TO_PHASE = DEFAULT_HUBSPOT_MAPPING.stageToPhase;
export const PHASE_TO_HUBSPOT_STAGE = DEFAULT_HUBSPOT_MAPPING.phaseToStage;
