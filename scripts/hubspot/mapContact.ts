import type { HubSpotCrmObject } from "./types";
import {
  DEFAULT_HUBSPOT_MAPPING,
  prop,
  resolveOwnerProfileId,
  type HubSpotMappingConfig,
} from "./mappingConfig";

export function contactToContactPatch(
  obj: HubSpotCrmObject,
  mapping: HubSpotMappingConfig = DEFAULT_HUBSPOT_MAPPING,
): {
  hubspotContactId: string;
  firstName: string;
  lastName: string;
  name: string;
  title: string;
  email?: string;
  phone?: string;
  associatedCompanyId?: string;
  ownerProfileId: string | null;
  hubspotOwnerId?: string;
} {
  const firstName = prop(obj.properties, mapping.contact.firstnameProp);
  const lastName = prop(obj.properties, mapping.contact.lastnameProp);
  const email = prop(obj.properties, mapping.contact.emailProp) || undefined;
  const phone = prop(obj.properties, mapping.contact.phoneProp) || undefined;
  const name =
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    email ||
    `Contact ${obj.id}`;
  const hubspotOwnerId =
    prop(obj.properties, mapping.contact.ownerProp) || undefined;
  return {
    hubspotContactId: obj.id,
    firstName,
    lastName,
    name,
    title: prop(obj.properties, mapping.contact.titleProp),
    email,
    phone,
    associatedCompanyId:
      prop(obj.properties, "associatedcompanyid") || undefined,
    hubspotOwnerId,
    ownerProfileId: resolveOwnerProfileId(hubspotOwnerId, mapping),
  };
}

export function contactToHubSpotProperties(
  input: {
    name: string;
    title?: string;
    email?: string;
    phone?: string;
  },
  mapping: HubSpotMappingConfig = DEFAULT_HUBSPOT_MAPPING,
): Record<string, string> {
  const parts = input.name.trim().split(/\s+/);
  const firstname = parts[0] || input.name;
  const lastname = parts.slice(1).join(" ") || "-";
  const props: Record<string, string> = {
    [mapping.contact.firstnameProp]: firstname,
    [mapping.contact.lastnameProp]: lastname,
  };
  if (input.title && mapping.contact.titleProp) {
    props[mapping.contact.titleProp] = input.title;
  }
  if (input.email && mapping.contact.emailProp) {
    props[mapping.contact.emailProp] = input.email;
  }
  if (input.phone && mapping.contact.phoneProp) {
    props[mapping.contact.phoneProp] = input.phone;
  }
  return props;
}

export function contactPullProperties(
  mapping: HubSpotMappingConfig = DEFAULT_HUBSPOT_MAPPING,
): string[] {
  return [
    mapping.contact.firstnameProp,
    mapping.contact.lastnameProp,
    mapping.contact.emailProp,
    mapping.contact.phoneProp,
    mapping.contact.titleProp,
    mapping.contact.ownerProp,
    "associatedcompanyid",
    "hs_lastmodifieddate",
  ].filter(Boolean);
}

export const CONTACT_PULL_PROPERTIES = contactPullProperties();
