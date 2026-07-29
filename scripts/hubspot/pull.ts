import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listCrmObjects, withOrgHubSpotClient } from "./client";
import { companyPullProperties, companyToAccountPatch } from "./mapCompany";
import { contactPullProperties, contactToContactPatch } from "./mapContact";
import { dealPullProperties, dealToOpportunityPatch } from "./mapDeal";
import { loadHubSpotMapping } from "./mappingConfig";
import type { SyncCounts } from "./types";

function newLocalId(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

async function saveCursor(
  db: SupabaseClient,
  organizationId: string,
  objectType: "companies" | "contacts" | "deals",
  after: string | undefined,
) {
  await db.from("hubspot_sync_cursors").upsert(
    {
      organization_id: organizationId,
      object_type: objectType,
      cursor: after ?? null,
      updated_after: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,object_type" },
  );
}

export async function pullHubSpotOrg(input: {
  db: SupabaseClient;
  organizationId: string;
  clientId: string;
  clientSecret: string;
  tokenSecret: string;
  maxPages?: number;
}): Promise<SyncCounts> {
  const counts: SyncCounts = {
    companies: 0,
    contacts: 0,
    deals: 0,
    errors: [],
  };
  const hs = await withOrgHubSpotClient(input.db, input.organizationId, {
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    tokenSecret: input.tokenSecret,
  });
  const mapping = await loadHubSpotMapping(input.db, input.organizationId);

  const maxPages = input.maxPages ?? 20;
  const companyIdByHubspot = new Map<string, string>();

  // --- Companies → accounts ---
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const batch = await listCrmObjects(
      hs.request,
      "companies",
      companyPullProperties(mapping),
      { after, limit: 100 },
    );
    for (const obj of batch.results) {
      try {
        const patch = companyToAccountPatch(obj, mapping);
        const { data: existing } = await input.db
          .from("accounts")
          .select("id, x, y, type, holding_id, commercial_status, research_brief, active")
          .eq("organization_id", input.organizationId)
          .eq("hubspot_company_id", patch.hubspotCompanyId)
          .maybeSingle();

        const id = existing?.id ? String(existing.id) : newLocalId("hs-co");
        const row = {
          id,
          organization_id: input.organizationId,
          name: patch.name,
          type: (existing?.type as string) || "Entreprise",
          commercial_status:
            (existing?.commercial_status as string) || "Prospect",
          holding_id: existing?.holding_id ?? null,
          sector: patch.sector ?? null,
          x: existing?.x != null ? Number(existing.x) : 0,
          y: existing?.y != null ? Number(existing.y) : 0,
          active: existing?.active !== false,
          research_brief: existing?.research_brief ?? null,
          hubspot_company_id: patch.hubspotCompanyId,
          hubspot_synced_at: new Date().toISOString(),
          hubspot_dirty: false,
          owner_profile_id: patch.ownerProfileId,
        };
        const { error } = await input.db.from("accounts").upsert(row, {
          onConflict: "organization_id,id",
        });
        if (error) throw new Error(error.message);
        companyIdByHubspot.set(patch.hubspotCompanyId, id);
        counts.companies += 1;
      } catch (e) {
        counts.errors.push(
          `company ${obj.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    after = batch.nextAfter;
    await saveCursor(input.db, input.organizationId, "companies", after);
    if (!after) break;
  }

  // Preload all hubspot company maps for contacts/deals
  const { data: allCos } = await input.db
    .from("accounts")
    .select("id, hubspot_company_id")
    .eq("organization_id", input.organizationId)
    .not("hubspot_company_id", "is", null);
  for (const row of allCos || []) {
    if (row.hubspot_company_id) {
      companyIdByHubspot.set(String(row.hubspot_company_id), String(row.id));
    }
  }

  // --- Contacts ---
  after = undefined;
  for (let page = 0; page < maxPages; page++) {
    const batch = await listCrmObjects(
      hs.request,
      "contacts",
      contactPullProperties(mapping),
      { after, limit: 100 },
    );
    for (const obj of batch.results) {
      try {
        const patch = contactToContactPatch(obj, mapping);
        let accountId =
          (patch.associatedCompanyId &&
            companyIdByHubspot.get(patch.associatedCompanyId)) ||
          null;

        if (!accountId) {
          // Fallback : premier compte org ou compte placeholder
          const { data: anyAcc } = await input.db
            .from("accounts")
            .select("id")
            .eq("organization_id", input.organizationId)
            .limit(1)
            .maybeSingle();
          if (!anyAcc) {
            counts.errors.push(
              `contact ${obj.id}: aucun compte pour rattachement`,
            );
            continue;
          }
          accountId = String(anyAcc.id);
        }

        const { data: existing } = await input.db
          .from("contacts")
          .select("id, x, y, direction_id, active")
          .eq("organization_id", input.organizationId)
          .eq("hubspot_contact_id", patch.hubspotContactId)
          .maybeSingle();

        const id = existing?.id ? String(existing.id) : newLocalId("hs-ct");
        const { error } = await input.db.from("contacts").upsert(
          {
            id,
            organization_id: input.organizationId,
            account_id: accountId,
            direction_id: existing?.direction_id || "",
            name: patch.name,
            first_name: patch.firstName || null,
            last_name: patch.lastName || null,
            title: patch.title,
            email: patch.email || null,
            phone: patch.phone || null,
            x: existing?.x != null ? Number(existing.x) : 0,
            y: existing?.y != null ? Number(existing.y) : 0,
            active: existing?.active !== false,
            hubspot_contact_id: patch.hubspotContactId,
            hubspot_synced_at: new Date().toISOString(),
            hubspot_dirty: false,
            owner_profile_id: patch.ownerProfileId,
          },
          { onConflict: "organization_id,id" },
        );
        if (error) throw new Error(error.message);
        counts.contacts += 1;
      } catch (e) {
        counts.errors.push(
          `contact ${obj.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    after = batch.nextAfter;
    await saveCursor(input.db, input.organizationId, "contacts", after);
    if (!after) break;
  }

  // --- Deals ---
  after = undefined;
  for (let page = 0; page < maxPages; page++) {
    const batch = await listCrmObjects(
      hs.request,
      "deals",
      dealPullProperties(mapping),
      { after, limit: 100 },
    );
    for (const obj of batch.results) {
      try {
        const patch = dealToOpportunityPatch(obj, mapping);
        let primaryAccountId =
          (patch.associatedCompanyId &&
            companyIdByHubspot.get(patch.associatedCompanyId)) ||
          null;
        if (!primaryAccountId) {
          const { data: anyAcc } = await input.db
            .from("accounts")
            .select("id")
            .eq("organization_id", input.organizationId)
            .limit(1)
            .maybeSingle();
          if (!anyAcc) {
            counts.errors.push(`deal ${obj.id}: aucun compte pour rattachement`);
            continue;
          }
          primaryAccountId = String(anyAcc.id);
        }

        const { data: existing } = await input.db
          .from("opportunities")
          .select(
            "id, kind, solution_id, module_ids, direction_ids, compelling_event_ids, variables, business_outcomes, process_answers, mapping_checks, ai_recommendations, currency, active",
          )
          .eq("organization_id", input.organizationId)
          .eq("hubspot_deal_id", patch.hubspotDealId)
          .maybeSingle();

        const id = existing?.id ? String(existing.id) : newLocalId("hs-deal");
        const { error } = await input.db.from("opportunities").upsert(
          {
            id,
            organization_id: input.organizationId,
            name: patch.name,
            amount: patch.amount,
            currency: (existing?.currency as string) || "EUR",
            close_date: patch.closeDate || null,
            primary_account_id: primaryAccountId,
            phase: patch.phase,
            kind: (existing?.kind as string) || "prospect",
            solution_id: (existing?.solution_id as string) || "",
            module_ids: existing?.module_ids || [],
            direction_ids: existing?.direction_ids || [],
            compelling_event_ids: existing?.compelling_event_ids || [],
            variables: existing?.variables || {},
            business_outcomes: existing?.business_outcomes || {},
            process_answers: existing?.process_answers || {},
            mapping_checks: existing?.mapping_checks || {},
            ai_recommendations: existing?.ai_recommendations ?? null,
            active: existing?.active !== false,
            hubspot_deal_id: patch.hubspotDealId,
            hubspot_synced_at: new Date().toISOString(),
            hubspot_dirty: false,
            owner_profile_id: patch.ownerProfileId,
          },
          { onConflict: "organization_id,id" },
        );
        if (error) throw new Error(error.message);
        counts.deals += 1;
      } catch (e) {
        counts.errors.push(
          `deal ${obj.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    after = batch.nextAfter;
    await saveCursor(input.db, input.organizationId, "deals", after);
    if (!after) break;
  }

  await input.db
    .from("crm_connections")
    .update({
      last_pull_at: new Date().toISOString(),
      last_error: counts.errors.length
        ? counts.errors.slice(0, 5).join(" | ")
        : null,
      status: "connected",
    })
    .eq("organization_id", input.organizationId)
    .eq("provider", "hubspot");

  return counts;
}
