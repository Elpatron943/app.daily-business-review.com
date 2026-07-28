import type { Account, Contact, Status } from "../data";
import { ENGAGEMENT_STATUSES } from "../data";
import type {
  Opportunity,
  OpportunityStakeholder,
} from "../opportunities/OpportunityContext";

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
    research_brief: a.researchBrief ?? null,
  };
}

export function accountFromRow(row: Record<string, unknown>): Account {
  const typeRaw = String(row.type ?? "Entreprise");
  const type = typeRaw === "Holding" ? "Holding" : "Entreprise";
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    type,
    commercialStatus: String(row.commercial_status ?? "Prospect"),
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
    researchBrief:
      row.research_brief && typeof row.research_brief === "object"
        ? (row.research_brief as Account["researchBrief"])
        : null,
  };
}

export function contactToRow(organizationId: string, c: Contact) {
  return {
    id: c.id,
    organization_id: organizationId,
    account_id: c.accountId,
    direction_id: c.directionId || "",
    name: c.name,
    title: c.title || "",
    x: c.x,
    y: c.y,
    active: c.active !== false,
  };
}

export function contactFromRow(row: Record<string, unknown>): Contact {
  return {
    id: String(row.id),
    accountId: String(row.account_id ?? ""),
    directionId: String(row.direction_id ?? ""),
    name: String(row.name ?? ""),
    title: String(row.title ?? ""),
    x: Number(row.x) || 0,
    y: Number(row.y) || 0,
    active: row.active !== false,
  };
}

export function opportunityToRow(organizationId: string, o: Opportunity) {
  const close =
    typeof o.closeDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(o.closeDate)
      ? o.closeDate.slice(0, 10)
      : null;
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
    direction_ids: o.directionIds ?? [],
    compelling_event_ids: o.compellingEventIds ?? [],
    variables: o.variables ?? {},
    business_outcomes: o.businessOutcomes ?? {},
    process_answers: o.processAnswers ?? {},
    mapping_checks: o.mappingChecks ?? {},
    ai_recommendations: o.aiRecommendations ?? null,
    active: o.active !== false,
  };
}

export function opportunityFromRow(
  row: Record<string, unknown>,
  stakeholders: OpportunityStakeholder[] = [],
): Opportunity {
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
    directionIds: Array.isArray(row.direction_ids)
      ? row.direction_ids.filter((x): x is string => typeof x === "string")
      : [],
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
    aiRecommendations:
      row.ai_recommendations && typeof row.ai_recommendations === "object"
        ? (row.ai_recommendations as Opportunity["aiRecommendations"])
        : null,
    active: row.active !== false,
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
