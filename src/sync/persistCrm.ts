import { supabase } from "../supabase/client";
import type { Account, Contact, SoldSolution } from "../data";
import type {
  Opportunity,
  OpportunityStakeholder,
} from "../opportunities/OpportunityContext";
import {
  accountToRow,
  contactToRow,
  opportunityActionToRow,
  opportunityToRow,
  soldSolutionToRow,
  stakeholderToRow,
} from "./mappers";
import type { OpportunityAction } from "../opportunities/OpportunityContext";

function requireClient() {
  if (!supabase) throw new Error("Supabase non configuré.");
  return supabase;
}

/** Holdings d’abord (FK holding_id), puis le reste. */
function sortAccountsForUpsert(accounts: Account[]): Account[] {
  const holdings = accounts.filter((a) => a.type === "Holding");
  const rest = accounts.filter((a) => a.type !== "Holding");
  return [...holdings, ...rest];
}

export async function upsertAccountRemote(
  organizationId: string,
  account: Account,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("accounts")
    .upsert(accountToRow(organizationId, account), {
      onConflict: "organization_id,id",
    });
  if (error) throw new Error(error.message);
}

export async function upsertAccountsRemote(
  organizationId: string,
  accounts: Account[],
): Promise<void> {
  if (accounts.length === 0) return;
  const sb = requireClient();
  const rows = sortAccountsForUpsert(accounts).map((a) =>
    accountToRow(organizationId, a),
  );
  const { error } = await sb.from("accounts").upsert(rows, {
    onConflict: "organization_id,id",
  });
  if (error) throw new Error(error.message);
}

export async function upsertContactRemote(
  organizationId: string,
  contact: Contact,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("contacts")
    .upsert(contactToRow(organizationId, contact), {
      onConflict: "organization_id,id",
    });
  if (error) throw new Error(error.message);
}

export async function upsertContactsRemote(
  organizationId: string,
  contacts: Contact[],
): Promise<void> {
  if (contacts.length === 0) return;
  const sb = requireClient();
  const rows = contacts.map((c) => contactToRow(organizationId, c));
  const { error } = await sb.from("contacts").upsert(rows, {
    onConflict: "organization_id,id",
  });
  if (error) throw new Error(error.message);
}

export async function upsertOpportunityRemote(
  organizationId: string,
  opportunity: Opportunity,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("opportunities")
    .upsert(opportunityToRow(organizationId, opportunity), {
      onConflict: "organization_id,id",
    });
  if (error) throw new Error(error.message);
  await replaceOpportunityStakeholdersRemote(
    organizationId,
    opportunity.id,
    opportunity.stakeholders ?? [],
  );
  await replaceOpportunityActionsRemote(
    organizationId,
    opportunity.id,
    opportunity.actions ?? [],
  );
}

export async function upsertOpportunitiesRemote(
  organizationId: string,
  opportunities: Opportunity[],
): Promise<void> {
  if (opportunities.length === 0) return;
  const sb = requireClient();
  const rows = opportunities.map((o) => opportunityToRow(organizationId, o));
  const { error } = await sb.from("opportunities").upsert(rows, {
    onConflict: "organization_id,id",
  });
  if (error) throw new Error(error.message);
  for (const o of opportunities) {
    await replaceOpportunityStakeholdersRemote(
      organizationId,
      o.id,
      o.stakeholders ?? [],
    );
    await replaceOpportunityActionsRemote(
      organizationId,
      o.id,
      o.actions ?? [],
    );
  }
}

export async function replaceOpportunityStakeholdersRemote(
  organizationId: string,
  opportunityId: string,
  stakeholders: OpportunityStakeholder[],
): Promise<void> {
  const sb = requireClient();
  const { error: delError } = await sb
    .from("opportunity_stakeholders")
    .delete()
    .eq("organization_id", organizationId)
    .eq("opportunity_id", opportunityId);
  if (delError) throw new Error(delError.message);

  const valid = stakeholders.filter((s) => s.contactId);
  if (valid.length === 0) return;

  const rows = valid.map((s) =>
    stakeholderToRow(organizationId, opportunityId, s),
  );
  const { error } = await sb.from("opportunity_stakeholders").insert(rows);
  if (error) throw new Error(error.message);
}

export async function replaceOpportunityActionsRemote(
  organizationId: string,
  opportunityId: string,
  actions: OpportunityAction[],
): Promise<void> {
  const sb = requireClient();
  const { error: delError } = await sb
    .from("opportunity_actions")
    .delete()
    .eq("organization_id", organizationId)
    .eq("opportunity_id", opportunityId);
  if (delError) throw new Error(delError.message);

  if (actions.length === 0) return;
  const rows = actions.map((a, i) =>
    opportunityActionToRow(organizationId, opportunityId, a, i),
  );
  const { error } = await sb.from("opportunity_actions").insert(rows);
  if (error) throw new Error(error.message);
}

export async function upsertSoldSolutionsRemote(
  organizationId: string,
  lines: SoldSolution[],
): Promise<void> {
  if (lines.length === 0) return;
  const sb = requireClient();
  const rows = lines.map((s) => soldSolutionToRow(organizationId, s));
  const { error } = await sb.from("sold_solutions").upsert(rows, {
    onConflict: "organization_id,id",
  });
  if (error) throw new Error(error.message);
}

export async function deleteSoldSolutionRemote(
  organizationId: string,
  soldSolutionId: string,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("sold_solutions")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", soldSolutionId);
  if (error) throw new Error(error.message);
}

export function logSyncError(scope: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[sync:${scope}]`, msg);
}
