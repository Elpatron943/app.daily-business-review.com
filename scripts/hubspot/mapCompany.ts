import type { HubSpotCrmObject } from "./types";
import {
  DEFAULT_HUBSPOT_MAPPING,
  prop,
  resolveOwnerProfileId,
  type HubSpotMappingConfig,
} from "./mappingConfig";

/** Company HubSpot → account DBR (inbound). */
export function companyToAccountPatch(
  obj: HubSpotCrmObject,
  mapping: HubSpotMappingConfig = DEFAULT_HUBSPOT_MAPPING,
): {
  hubspotCompanyId: string;
  name: string;
  sector?: string;
  ownerProfileId: string | null;
  hubspotOwnerId?: string;
} {
  const name =
    prop(obj.properties, mapping.company.nameProp) ||
    prop(obj.properties, mapping.company.domainProp) ||
    `Company ${obj.id}`;
  const sector = prop(obj.properties, mapping.company.sectorProp) || undefined;
  const hubspotOwnerId =
    prop(obj.properties, mapping.company.ownerProp) || undefined;
  return {
    hubspotCompanyId: obj.id,
    name,
    sector,
    hubspotOwnerId,
    ownerProfileId: resolveOwnerProfileId(hubspotOwnerId, mapping),
  };
}

export function accountToCompanyProperties(
  input: { name: string; sector?: string | null },
  mapping: HubSpotMappingConfig = DEFAULT_HUBSPOT_MAPPING,
): Record<string, string> {
  const props: Record<string, string> = {
    [mapping.company.nameProp]: input.name,
  };
  if (input.sector && mapping.company.sectorProp) {
    props[mapping.company.sectorProp] = input.sector;
  }
  return props;
}

export function companyPullProperties(
  mapping: HubSpotMappingConfig = DEFAULT_HUBSPOT_MAPPING,
): string[] {
  return [
    mapping.company.nameProp,
    mapping.company.domainProp,
    mapping.company.sectorProp,
    mapping.company.ownerProp,
    mapping.company.soldSolutionProp,
    mapping.company.soldModulesProp,
    mapping.company.soldAmountProp,
    "hs_lastmodifieddate",
  ].filter(Boolean);
}

export const COMPANY_PULL_PROPERTIES = companyPullProperties();
