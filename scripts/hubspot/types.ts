export type HubSpotObjectType = "companies" | "contacts" | "deals";

export type HubSpotConnectionStatus =
  | "connected"
  | "error"
  | "disconnected";

export type HubSpotConnectionPublic = {
  status: HubSpotConnectionStatus;
  portalId: string | null;
  scopes: string[];
  lastPullAt: string | null;
  lastPushAt: string | null;
  lastError: string | null;
};

export type HubSpotTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
  portalId?: string | null;
};

export type HubSpotCrmProperties = Record<string, string | null | undefined>;

export type HubSpotCrmObject = {
  id: string;
  properties: HubSpotCrmProperties;
  updatedAt?: string;
};

export const HUBSPOT_OAUTH_SCOPES = [
  "crm.objects.companies.read",
  "crm.objects.companies.write",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "oauth",
] as const;

export type SyncCounts = {
  companies: number;
  contacts: number;
  deals: number;
  errors: string[];
};
