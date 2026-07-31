import type {
  Opportunity,
  OpportunityAction,
  OpportunityActionStatus,
  OpportunityStakeholder,
} from "../opportunities/OpportunityContext";
import { ENGAGEMENT_STATUSES, normalizeSoldSolution } from "../data";
import type {
  Account,
  CompanyRelation,
  CompanyRelationType,
  Contact,
  ContactRelation,
  ContactRelationType,
  SoldSolution,
  Status,
} from "../data";
import type {
  AccountPlan,
  ObjectiveStatus,
  PlanObjective,
  PlanStatus,
} from "../accountPlans/AccountPlanContext";

function asEngagementStatus(v: unknown): Status {
  return typeof v === "string" &&
    (ENGAGEMENT_STATUSES as readonly string[]).includes(v)
    ? (v as Status)
    : "Identified";
}

export function accountToRow(organizationId: string, a: Account) {
  return {
    id: a.id,
    organization_id: organizationId,
    name: a.name,
    type: a.type,
    commercial_status: a.commercialStatus,
    holding_id: a.holdingId,
    sector: a.sector ?? null,
    size: a.size ?? null,
    x: a.x,
    y: a.y,
    active: a.active !== false,
    owner_profile_id: a.ownerProfileId ?? null,
    hubspot_company_id: a.hubspotCompanyId ?? null,
    hubspot_synced_at: a.hubspotSyncedAt ?? null,
    // Édition locale → à pousser vers HubSpot (HubSpot wins au prochain pull).
    hubspot_dirty: a.hubspotDirty ?? true,
  };
}

export function accountFromRow(row: Record<string, unknown>): Account {
  const typeRaw = String(row.type ?? "Entreprise");
  const type = typeRaw === "Holding" ? "Holding" : "Entreprise";
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    type,
    commercialStatus: (() => {
      const s = String(row.commercial_status ?? "Prospect");
      if (s === "Other" || s === "SameSector") return "Prospect";
      if (s === "Competitor") return "Concurrent";
      return s;
    })(),
    holdingId:
      row.holding_id == null || row.holding_id === ""
        ? null
        : String(row.holding_id),
    sector:
      row.sector == null || row.sector === ""
        ? undefined
        : String(row.sector),
    size:
      row.size == null || row.size === "" ? undefined : String(row.size),
    x: Number(row.x) || 0,
    y: Number(row.y) || 0,
    active: row.active !== false,
    ownerProfileId:
      row.owner_profile_id == null || row.owner_profile_id === ""
        ? null
        : String(row.owner_profile_id),
    hubspotCompanyId:
      row.hubspot_company_id == null || row.hubspot_company_id === ""
        ? null
        : String(row.hubspot_company_id),
    hubspotSyncedAt:
      row.hubspot_synced_at == null || row.hubspot_synced_at === ""
        ? null
        : String(row.hubspot_synced_at),
    hubspotDirty: row.hubspot_dirty === true,
  };
}

export function contactToRow(organizationId: string, c: Contact) {
  // Écrit `direction_id` (schéma actuel) ; lit persona_id OU direction_id en fromRow.
  // Après migration SQL rename → persona_id, basculer la clé d’écriture.
  return {
    id: c.id,
    organization_id: organizationId,
    account_id: c.accountId,
    direction_id: c.personaId || "",
    name: c.name,
    first_name: c.firstName ?? null,
    last_name: c.lastName ?? null,
    title: c.title || "",
    email: c.email ?? null,
    phone: c.phone ?? null,
    x: c.x,
    y: c.y,
    active: c.active !== false,
    owner_profile_id: c.ownerProfileId ?? null,
    hubspot_contact_id: c.hubspotContactId ?? null,
    hubspot_synced_at: c.hubspotSyncedAt ?? null,
    hubspot_dirty: c.hubspotDirty ?? true,
  };
}

export function contactFromRow(row: Record<string, unknown>): Contact {
  // Lecture legacy : `direction_id` (ou `persona_id` si migration SQL future).
  const personaId =
    row.persona_id != null && row.persona_id !== ""
      ? String(row.persona_id)
      : String(row.direction_id ?? "");
  return {
    id: String(row.id),
    accountId: String(row.account_id ?? ""),
    personaId,
    name: String(row.name ?? ""),
    firstName:
      row.first_name == null || row.first_name === ""
        ? null
        : String(row.first_name),
    lastName:
      row.last_name == null || row.last_name === ""
        ? null
        : String(row.last_name),
    title: String(row.title ?? ""),
    email:
      row.email == null || row.email === "" ? null : String(row.email),
    phone:
      row.phone == null || row.phone === "" ? null : String(row.phone),
    x: Number(row.x) || 0,
    y: Number(row.y) || 0,
    active: row.active !== false,
    ownerProfileId:
      row.owner_profile_id == null || row.owner_profile_id === ""
        ? null
        : String(row.owner_profile_id),
    hubspotContactId:
      row.hubspot_contact_id == null || row.hubspot_contact_id === ""
        ? null
        : String(row.hubspot_contact_id),
    hubspotSyncedAt:
      row.hubspot_synced_at == null || row.hubspot_synced_at === ""
        ? null
        : String(row.hubspot_synced_at),
    hubspotDirty: row.hubspot_dirty === true,
  };
}

export function opportunityToRow(organizationId: string, o: Opportunity) {
  const close =
    typeof o.closeDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(o.closeDate)
      ? o.closeDate.slice(0, 10)
      : null;
  // Écrit `direction_ids` tant que la migration rename n’est pas appliquée en prod.
  return {
    id: o.id,
    organization_id: organizationId,
    name: o.name,
    amount: o.amount,
    currency: o.currency || "EUR",
    close_date: close,
    primary_account_id: o.primaryAccountId,
    phase: o.phase || "Whitespace",
    kind: o.kind || "prospect",
    solution_id: o.solutionId || "",
    module_ids: o.moduleIds ?? [],
    direction_ids: o.personaIds ?? [],
    compelling_event_ids: o.compellingEventIds ?? [],
    variables: o.variables ?? {},
    business_outcomes: o.businessOutcomes ?? {},
    process_answers: o.processAnswers ?? {},
    mapping_checks: o.mappingChecks ?? {},
    ai_recommendations: o.aiRecommendations ?? null,
    active: o.active !== false,
    owner_profile_id: o.ownerProfileId ?? null,
    hubspot_deal_id: o.hubspotDealId ?? null,
    hubspot_synced_at: o.hubspotSyncedAt ?? null,
    hubspot_dirty: o.hubspotDirty ?? true,
  };
}

export function opportunityFromRow(
  row: Record<string, unknown>,
  stakeholders: OpportunityStakeholder[] = [],
  actions: OpportunityAction[] = [],
): Opportunity {
  const personaIds = Array.isArray(row.persona_ids)
    ? row.persona_ids.filter((x): x is string => typeof x === "string")
    : Array.isArray(row.direction_ids)
      ? row.direction_ids.filter((x): x is string => typeof x === "string")
      : [];
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    amount: Number(row.amount) || 0,
    currency: String(row.currency ?? "EUR"),
    closeDate:
      row.close_date == null || row.close_date === ""
        ? ""
        : String(row.close_date).slice(0, 10),
    primaryAccountId: String(row.primary_account_id ?? ""),
    phase: String(row.phase ?? "Whitespace"),
    kind: String(row.kind ?? "prospect"),
    solutionId: String(row.solution_id ?? ""),
    moduleIds: Array.isArray(row.module_ids)
      ? row.module_ids.filter((x): x is string => typeof x === "string")
      : [],
    personaIds,
    compellingEventIds: Array.isArray(row.compelling_event_ids)
      ? row.compelling_event_ids.filter(
          (x): x is string => typeof x === "string",
        )
      : [],
    variables:
      row.variables && typeof row.variables === "object"
        ? (row.variables as Opportunity["variables"])
        : {},
    businessOutcomes:
      row.business_outcomes && typeof row.business_outcomes === "object"
        ? (row.business_outcomes as Opportunity["businessOutcomes"])
        : {},
    processAnswers:
      row.process_answers && typeof row.process_answers === "object"
        ? (row.process_answers as Opportunity["processAnswers"])
        : {},
    mappingChecks:
      row.mapping_checks && typeof row.mapping_checks === "object"
        ? (row.mapping_checks as Opportunity["mappingChecks"])
        : {},
    stakeholders,
    actions,
    aiRecommendations:
      row.ai_recommendations && typeof row.ai_recommendations === "object"
        ? (row.ai_recommendations as Opportunity["aiRecommendations"])
        : null,
    active: row.active !== false,
    ownerProfileId:
      row.owner_profile_id == null || row.owner_profile_id === ""
        ? null
        : String(row.owner_profile_id),
    hubspotDealId:
      row.hubspot_deal_id == null || row.hubspot_deal_id === ""
        ? null
        : String(row.hubspot_deal_id),
    hubspotSyncedAt:
      row.hubspot_synced_at == null || row.hubspot_synced_at === ""
        ? null
        : String(row.hubspot_synced_at),
    hubspotDirty: row.hubspot_dirty === true,
  };
}

export function stakeholderToRow(
  organizationId: string,
  opportunityId: string,
  s: OpportunityStakeholder,
) {
  return {
    organization_id: organizationId,
    opportunity_id: opportunityId,
    contact_id: s.contactId,
    role: s.role || "",
    status: asEngagementStatus(s.status),
    notes: s.notes ?? null,
  };
}

export function stakeholderFromRow(
  row: Record<string, unknown>,
): OpportunityStakeholder | null {
  const contactId = String(row.contact_id ?? "");
  if (!contactId) return null;
  return {
    contactId,
    role: String(row.role ?? ""),
    status: asEngagementStatus(row.status),
    notes:
      row.notes == null || row.notes === ""
        ? undefined
        : String(row.notes),
  };
}

export function soldSolutionToRow(organizationId: string, s: SoldSolution) {
  const personaIds =
    Array.isArray(s.personaIds) && s.personaIds.length > 0
      ? s.personaIds
      : s.personaId
        ? [s.personaId]
        : [];
  return {
    id: s.id,
    organization_id: organizationId,
    solution_id: s.solutionId,
    account_id: s.accountId,
    direction_ids: personaIds,
    module_ids: Array.isArray(s.moduleIds) ? s.moduleIds : [],
    currency: s.currency || "EUR",
    billed_amount: Math.max(0, Number(s.billedAmount) || 0),
  };
}

export function soldSolutionFromRow(row: Record<string, unknown>): SoldSolution {
  const legacyIds = Array.isArray(row.direction_ids)
    ? (row.direction_ids as unknown[]).map(String).filter(Boolean)
    : [];
  const personaIds = Array.isArray(row.persona_ids)
    ? (row.persona_ids as unknown[]).map(String).filter(Boolean)
    : legacyIds;
  return normalizeSoldSolution({
    id: String(row.id),
    solutionId: String(row.solution_id ?? ""),
    accountId: String(row.account_id ?? ""),
    personaId: personaIds[0] ?? null,
    personaIds,
    moduleIds: Array.isArray(row.module_ids)
      ? (row.module_ids as unknown[]).map(String).filter(Boolean)
      : [],
    currency: "EUR",
    billedAmount: Number(row.billed_amount) || 0,
  });
}

export function companyRelationToRow(
  organizationId: string,
  r: CompanyRelation,
) {
  return {
    id: r.id,
    organization_id: organizationId,
    source_id: r.source,
    target_id: r.target,
    relation: r.relation,
  };
}

export function companyRelationFromRow(
  row: Record<string, unknown>,
): CompanyRelation {
  return {
    id: String(row.id),
    source: String(row.source_id ?? ""),
    target: String(row.target_id ?? ""),
    relation: String(row.relation ?? "PartnerOf") as CompanyRelationType,
  };
}

export function contactRelationToRow(
  organizationId: string,
  r: ContactRelation,
) {
  return {
    id: r.id,
    organization_id: organizationId,
    source_id: r.source,
    target_id: r.target,
    relation: r.relation,
  };
}

export function contactRelationFromRow(
  row: Record<string, unknown>,
): ContactRelation {
  return {
    id: String(row.id),
    source: String(row.source_id ?? ""),
    target: String(row.target_id ?? ""),
    relation: String(row.relation ?? "Knows") as ContactRelationType,
  };
}

export function accountPlanToRow(organizationId: string, p: AccountPlan) {
  return {
    id: p.id,
    organization_id: organizationId,
    account_id: p.accountId,
    start_date: (p.startDate || "").slice(0, 10),
    due_date: (p.dueDate || "").slice(0, 10),
    status: (p.status || "Todo") as PlanStatus,
    owner: p.owner ?? null,
    vision: p.vision ?? "",
    active: p.active !== false,
  };
}

export function planObjectiveToRow(
  organizationId: string,
  planId: string,
  o: PlanObjective,
  sortOrder: number,
) {
  return {
    id: o.id,
    organization_id: organizationId,
    plan_id: planId,
    label: o.label,
    status: o.status as ObjectiveStatus,
    sort_order: sortOrder,
  };
}

export function opportunityActionToRow(
  organizationId: string,
  opportunityId: string,
  a: OpportunityAction,
  sortOrder: number,
) {
  const due =
    typeof a.dueDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(a.dueDate)
      ? a.dueDate.slice(0, 10)
      : null;
  return {
    id: a.id,
    organization_id: organizationId,
    opportunity_id: opportunityId,
    title: a.title,
    due_date: due,
    owner: a.owner ?? null,
    status: (a.status || "Todo") as OpportunityActionStatus,
    sort_order: sortOrder,
  };
}

export function opportunityActionFromRow(
  row: Record<string, unknown>,
): OpportunityAction {
  const statusRaw = String(row.status ?? "Todo");
  const status: OpportunityActionStatus =
    statusRaw === "Doing" || statusRaw === "Done" || statusRaw === "Todo"
      ? statusRaw
      : "Todo";
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    dueDate:
      row.due_date == null || row.due_date === ""
        ? undefined
        : String(row.due_date).slice(0, 10),
    owner:
      row.owner == null || row.owner === "" ? undefined : String(row.owner),
    status,
  };
}

export function accountPlanFromParts(
  planRow: Record<string, unknown>,
  opportunityIds: string[],
  objectives: PlanObjective[],
): AccountPlan {
  return {
    id: String(planRow.id),
    accountId: String(planRow.account_id ?? ""),
    opportunityIds,
    startDate: String(planRow.start_date ?? "").slice(0, 10),
    dueDate: String(planRow.due_date ?? "").slice(0, 10),
    status: (String(planRow.status ?? "Todo") as PlanStatus) || "Todo",
    owner:
      planRow.owner == null || planRow.owner === ""
        ? undefined
        : String(planRow.owner),
    vision: String(planRow.vision ?? ""),
    objectives,
    active: planRow.active !== false,
  };
}

export function planObjectiveFromRow(row: Record<string, unknown>): PlanObjective {
  return {
    id: String(row.id),
    label: String(row.label ?? ""),
    status: (String(row.status ?? "NotStarted") as ObjectiveStatus) || "NotStarted",
  };
}
