import { supabase } from "../supabase/client";
import type { Account, Contact, SoldSolution } from "../data";
import type { Opportunity } from "../opportunities/OpportunityContext";
import {
  accountFromRow,
  contactFromRow,
  opportunityFromRow,
  soldSolutionFromRow,
  stakeholderFromRow,
} from "./mappers";

export type OrgCrmSnapshot = {
  accounts: Account[];
  contacts: Contact[];
  opportunities: Opportunity[];
  soldSolutions: SoldSolution[];
};

export async function loadOrgCrm(
  organizationId: string,
): Promise<OrgCrmSnapshot> {
  if (!supabase) {
    return { accounts: [], contacts: [], opportunities: [], soldSolutions: [] };
  }

  const [accountsRes, contactsRes, oppsRes, stakesRes, soldRes] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("*")
        .eq("organization_id", organizationId),
      supabase
        .from("contacts")
        .select("*")
        .eq("organization_id", organizationId),
      supabase
        .from("opportunities")
        .select("*")
        .eq("organization_id", organizationId),
      supabase
        .from("opportunity_stakeholders")
        .select("*")
        .eq("organization_id", organizationId),
      supabase
        .from("sold_solutions")
        .select("*")
        .eq("organization_id", organizationId),
    ]);

  for (const r of [accountsRes, contactsRes, oppsRes, stakesRes, soldRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const stakesByOpp = new Map<
    string,
    ReturnType<typeof stakeholderFromRow>[]
  >();
  for (const row of stakesRes.data ?? []) {
    const s = stakeholderFromRow(row as Record<string, unknown>);
    if (!s) continue;
    const oppId = String(
      (row as { opportunity_id?: string }).opportunity_id ?? "",
    );
    if (!oppId) continue;
    const list = stakesByOpp.get(oppId) ?? [];
    list.push(s);
    stakesByOpp.set(oppId, list);
  }

  return {
    accounts: (accountsRes.data ?? []).map((row) =>
      accountFromRow(row as Record<string, unknown>),
    ),
    contacts: (contactsRes.data ?? []).map((row) =>
      contactFromRow(row as Record<string, unknown>),
    ),
    opportunities: (oppsRes.data ?? []).map((row) => {
      const id = String((row as { id?: string }).id ?? "");
      const stakes = (stakesByOpp.get(id) ?? []).filter(
        (s): s is NonNullable<typeof s> => s != null,
      );
      return opportunityFromRow(row as Record<string, unknown>, stakes);
    }),
    soldSolutions: (soldRes.data ?? []).map((row) =>
      soldSolutionFromRow(row as Record<string, unknown>),
    ),
  };
}

export async function loadOrgAccountsContacts(
  organizationId: string,
): Promise<{ accounts: Account[]; contacts: Contact[] }> {
  const snap = await loadOrgCrm(organizationId);
  return { accounts: snap.accounts, contacts: snap.contacts };
}

export async function loadOrgOpportunities(
  organizationId: string,
): Promise<Opportunity[]> {
  const snap = await loadOrgCrm(organizationId);
  return snap.opportunities;
}

export async function loadOrgSoldSolutions(
  organizationId: string,
): Promise<SoldSolution[]> {
  const snap = await loadOrgCrm(organizationId);
  return snap.soldSolutions;
}
