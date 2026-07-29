import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createCrmObject,
  updateCrmObject,
  withOrgHubSpotClient,
} from "./client";
import { accountToCompanyProperties } from "./mapCompany";
import { contactToHubSpotProperties } from "./mapContact";
import { opportunityToDealProperties } from "./mapDeal";
import { loadHubSpotMapping } from "./mappingConfig";
import type { SyncCounts } from "./types";

export async function pushHubSpotOrg(input: {
  db: SupabaseClient;
  organizationId: string;
  clientId: string;
  clientSecret: string;
  tokenSecret: string;
  limit?: number;
}): Promise<SyncCounts> {
  const counts: SyncCounts = {
    companies: 0,
    contacts: 0,
    deals: 0,
    errors: [],
  };
  const limit = input.limit ?? 100;
  const hs = await withOrgHubSpotClient(input.db, input.organizationId, {
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    tokenSecret: input.tokenSecret,
  });
  const mapping = await loadHubSpotMapping(input.db, input.organizationId);

  const { data: dirtyAccounts, error: accErr } = await input.db
    .from("accounts")
    .select("id, name, sector, hubspot_company_id")
    .eq("organization_id", input.organizationId)
    .eq("hubspot_dirty", true)
    .limit(limit);
  if (accErr) throw new Error(accErr.message);

  for (const row of dirtyAccounts || []) {
    try {
      const props = accountToCompanyProperties(
        {
          name: String(row.name),
          sector: row.sector as string | null,
        },
        mapping,
      );
      let hubspotId = row.hubspot_company_id
        ? String(row.hubspot_company_id)
        : null;
      if (hubspotId) {
        await updateCrmObject(hs.request, "companies", hubspotId, props);
      } else {
        const created = await createCrmObject(hs.request, "companies", props);
        hubspotId = created.id;
      }
      await input.db
        .from("accounts")
        .update({
          hubspot_company_id: hubspotId,
          hubspot_dirty: false,
          hubspot_synced_at: new Date().toISOString(),
        })
        .eq("organization_id", input.organizationId)
        .eq("id", row.id);
      counts.companies += 1;
    } catch (e) {
      counts.errors.push(
        `account ${row.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const { data: dirtyContacts, error: ctErr } = await input.db
    .from("contacts")
    .select("id, name, title, email, phone, hubspot_contact_id")
    .eq("organization_id", input.organizationId)
    .eq("hubspot_dirty", true)
    .limit(limit);
  if (ctErr) throw new Error(ctErr.message);

  for (const row of dirtyContacts || []) {
    try {
      const props = contactToHubSpotProperties(
        {
          name: String(row.name),
          title: (row.title as string) || "",
          email: (row.email as string) || undefined,
          phone: (row.phone as string) || undefined,
        },
        mapping,
      );
      let hubspotId = row.hubspot_contact_id
        ? String(row.hubspot_contact_id)
        : null;
      if (hubspotId) {
        await updateCrmObject(hs.request, "contacts", hubspotId, props);
      } else {
        const created = await createCrmObject(hs.request, "contacts", props);
        hubspotId = created.id;
      }
      await input.db
        .from("contacts")
        .update({
          hubspot_contact_id: hubspotId,
          hubspot_dirty: false,
          hubspot_synced_at: new Date().toISOString(),
        })
        .eq("organization_id", input.organizationId)
        .eq("id", row.id);
      counts.contacts += 1;
    } catch (e) {
      counts.errors.push(
        `contact ${row.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const { data: dirtyDeals, error: dealErr } = await input.db
    .from("opportunities")
    .select("id, name, amount, close_date, phase, hubspot_deal_id")
    .eq("organization_id", input.organizationId)
    .eq("hubspot_dirty", true)
    .limit(limit);
  if (dealErr) throw new Error(dealErr.message);

  for (const row of dirtyDeals || []) {
    try {
      const props = opportunityToDealProperties(
        {
          name: String(row.name),
          amount: Number(row.amount) || 0,
          closeDate: row.close_date ? String(row.close_date).slice(0, 10) : "",
          phase: row.phase ? String(row.phase) : undefined,
        },
        mapping,
      );
      let hubspotId = row.hubspot_deal_id ? String(row.hubspot_deal_id) : null;
      if (hubspotId) {
        await updateCrmObject(hs.request, "deals", hubspotId, props);
      } else {
        const created = await createCrmObject(hs.request, "deals", props);
        hubspotId = created.id;
      }
      await input.db
        .from("opportunities")
        .update({
          hubspot_deal_id: hubspotId,
          hubspot_dirty: false,
          hubspot_synced_at: new Date().toISOString(),
        })
        .eq("organization_id", input.organizationId)
        .eq("id", row.id);
      counts.deals += 1;
    } catch (e) {
      counts.errors.push(
        `deal ${row.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  await input.db
    .from("crm_connections")
    .update({
      last_push_at: new Date().toISOString(),
      last_error: counts.errors.length
        ? counts.errors.slice(0, 5).join(" | ")
        : null,
      status: "connected",
    })
    .eq("organization_id", input.organizationId)
    .eq("provider", "hubspot");

  return counts;
}
