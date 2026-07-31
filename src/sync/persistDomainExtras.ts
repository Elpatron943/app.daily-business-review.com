import type {
  CompanyRelation,
  ContactRelation,
} from "../data";
import type { AccountPlan } from "../accountPlans/AccountPlanContext";
import { supabase } from "../supabase/client";
import {
  accountPlanFromParts,
  accountPlanToRow,
  companyRelationFromRow,
  companyRelationToRow,
  contactRelationFromRow,
  contactRelationToRow,
  planObjectiveFromRow,
  planObjectiveToRow,
} from "./mappers";
import { logSyncError } from "./persistCrm";

function requireClient() {
  if (!supabase) throw new Error("Supabase non configuré.");
  return supabase;
}

export async function loadOrgRelations(
  organizationId: string,
): Promise<{
  companyRelations: CompanyRelation[];
  contactRelations: ContactRelation[];
}> {
  const sb = requireClient();
  const [co, ct] = await Promise.all([
    sb
      .from("company_relations")
      .select("*")
      .eq("organization_id", organizationId),
    sb
      .from("contact_relations")
      .select("*")
      .eq("organization_id", organizationId),
  ]);
  if (co.error) throw new Error(co.error.message);
  if (ct.error) throw new Error(ct.error.message);
  return {
    companyRelations: (co.data ?? []).map((row) =>
      companyRelationFromRow(row as Record<string, unknown>),
    ),
    contactRelations: (ct.data ?? []).map((row) =>
      contactRelationFromRow(row as Record<string, unknown>),
    ),
  };
}

export async function loadOrgLayoutPositions(
  organizationId: string,
): Promise<Record<string, { x: number; y: number }>> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("domain_ui_state")
    .select("layout_positions")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const raw = data?.layout_positions;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, { x: number; y: number }> = {};
  for (const [id, pos] of Object.entries(raw as Record<string, unknown>)) {
    if (!pos || typeof pos !== "object") continue;
    const p = pos as { x?: unknown; y?: unknown };
    const x = typeof p.x === "number" ? p.x : Number(p.x);
    const y = typeof p.y === "number" ? p.y : Number(p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[id] = { x, y };
  }
  return out;
}

export async function upsertCompanyRelationRemote(
  organizationId: string,
  relation: CompanyRelation,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("company_relations").upsert(
    companyRelationToRow(organizationId, relation),
    { onConflict: "organization_id,id" },
  );
  if (error) throw new Error(error.message);
}

export async function deleteCompanyRelationRemote(
  organizationId: string,
  relationId: string,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("company_relations")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", relationId);
  if (error) throw new Error(error.message);
}

export async function upsertCompanyRelationsRemote(
  organizationId: string,
  relations: CompanyRelation[],
): Promise<void> {
  if (relations.length === 0) return;
  const sb = requireClient();
  const { error } = await sb.from("company_relations").upsert(
    relations.map((r) => companyRelationToRow(organizationId, r)),
    { onConflict: "organization_id,id" },
  );
  if (error) throw new Error(error.message);
}

export async function upsertContactRelationRemote(
  organizationId: string,
  relation: ContactRelation,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("contact_relations").upsert(
    contactRelationToRow(organizationId, relation),
    { onConflict: "organization_id,id" },
  );
  if (error) throw new Error(error.message);
}

export async function deleteContactRelationRemote(
  organizationId: string,
  relationId: string,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("contact_relations")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", relationId);
  if (error) throw new Error(error.message);
}

export async function upsertContactRelationsRemote(
  organizationId: string,
  relations: ContactRelation[],
): Promise<void> {
  if (relations.length === 0) return;
  const sb = requireClient();
  const { error } = await sb.from("contact_relations").upsert(
    relations.map((r) => contactRelationToRow(organizationId, r)),
    { onConflict: "organization_id,id" },
  );
  if (error) throw new Error(error.message);
}

/** Remplace les ReportsTo d’un contact enfant (hiérarchie). */
export async function replaceContactReportsToRemote(
  organizationId: string,
  childId: string,
  relation: ContactRelation | null,
): Promise<void> {
  const sb = requireClient();
  const { error: delError } = await sb
    .from("contact_relations")
    .delete()
    .eq("organization_id", organizationId)
    .eq("source_id", childId)
    .eq("relation", "ReportsTo");
  if (delError) throw new Error(delError.message);
  if (!relation) return;
  await upsertContactRelationRemote(organizationId, relation);
}

export async function upsertDomainUiStateRemote(
  organizationId: string,
  layoutPositions: Record<string, { x: number; y: number }>,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("domain_ui_state").upsert(
    {
      organization_id: organizationId,
      layout_positions: layoutPositions,
    },
    { onConflict: "organization_id" },
  );
  if (error) throw new Error(error.message);
}

export function pushDomainUiStateRemote(
  organizationId: string,
  layoutPositions: Record<string, { x: number; y: number }>,
) {
  void upsertDomainUiStateRemote(organizationId, layoutPositions).catch((err) =>
    logSyncError("upsertDomainUiState", err),
  );
}

export async function loadOrgAccountPlans(
  organizationId: string,
): Promise<AccountPlan[]> {
  const sb = requireClient();
  const [plansRes, linksRes, objsRes] = await Promise.all([
    sb.from("account_plans").select("*").eq("organization_id", organizationId),
    sb
      .from("account_plan_opportunities")
      .select("*")
      .eq("organization_id", organizationId),
    sb.from("plan_objectives").select("*").eq("organization_id", organizationId),
  ]);
  for (const r of [plansRes, linksRes, objsRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const oppsByPlan = new Map<string, string[]>();
  for (const row of linksRes.data ?? []) {
    const planId = String(
      (row as { plan_id?: string }).plan_id ?? "",
    );
    const oppId = String(
      (row as { opportunity_id?: string }).opportunity_id ?? "",
    );
    if (!planId || !oppId) continue;
    const list = oppsByPlan.get(planId) ?? [];
    list.push(oppId);
    oppsByPlan.set(planId, list);
  }

  const objsByPlan = new Map<string, ReturnType<typeof planObjectiveFromRow>[]>();
  for (const row of (objsRes.data ?? []).sort(
    (a, b) =>
      Number((a as { sort_order?: number }).sort_order ?? 0) -
      Number((b as { sort_order?: number }).sort_order ?? 0),
  )) {
    const planId = String((row as { plan_id?: string }).plan_id ?? "");
    if (!planId) continue;
    const list = objsByPlan.get(planId) ?? [];
    list.push(planObjectiveFromRow(row as Record<string, unknown>));
    objsByPlan.set(planId, list);
  }

  return (plansRes.data ?? []).map((row) => {
    const id = String((row as { id?: string }).id ?? "");
    return accountPlanFromParts(
      row as Record<string, unknown>,
      oppsByPlan.get(id) ?? [],
      objsByPlan.get(id) ?? [],
    );
  });
}

export async function upsertAccountPlanRemote(
  organizationId: string,
  plan: AccountPlan,
): Promise<void> {
  const sb = requireClient();
  const { error: planErr } = await sb.from("account_plans").upsert(
    accountPlanToRow(organizationId, plan),
    { onConflict: "organization_id,id" },
  );
  if (planErr) throw new Error(planErr.message);

  const { error: delLinks } = await sb
    .from("account_plan_opportunities")
    .delete()
    .eq("organization_id", organizationId)
    .eq("plan_id", plan.id);
  if (delLinks) throw new Error(delLinks.message);

  const oppIds = [...new Set(plan.opportunityIds.filter(Boolean))];
  if (oppIds.length > 0) {
    const { error: insLinks } = await sb.from("account_plan_opportunities").insert(
      oppIds.map((opportunity_id) => ({
        organization_id: organizationId,
        plan_id: plan.id,
        opportunity_id,
      })),
    );
    if (insLinks) throw new Error(insLinks.message);
  }

  const { error: delObjs } = await sb
    .from("plan_objectives")
    .delete()
    .eq("organization_id", organizationId)
    .eq("plan_id", plan.id);
  if (delObjs) throw new Error(delObjs.message);

  if (plan.objectives.length > 0) {
    const { error: insObjs } = await sb.from("plan_objectives").insert(
      plan.objectives.map((o, i) =>
        planObjectiveToRow(organizationId, plan.id, o, i),
      ),
    );
    if (insObjs) throw new Error(insObjs.message);
  }
}

export async function upsertAccountPlansRemote(
  organizationId: string,
  plans: AccountPlan[],
): Promise<void> {
  for (const plan of plans) {
    await upsertAccountPlanRemote(organizationId, plan);
  }
}

export function pushAccountPlanRemote(
  organizationId: string,
  plan: AccountPlan,
) {
  void upsertAccountPlanRemote(organizationId, plan).catch((err) =>
    logSyncError("upsertAccountPlan", err),
  );
}

export function pushAccountPlansRemote(
  organizationId: string,
  plans: AccountPlan[],
) {
  void upsertAccountPlansRemote(organizationId, plans).catch((err) =>
    logSyncError("upsertAccountPlans", err),
  );
}
