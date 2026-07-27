import type { Account, Contact, Status } from "../data";
import { engagementLabel } from "../data";
import type { OrgConfig } from "../config/types";
import type { Opportunity } from "../opportunities/OpportunityContext";
import { computeProcessProgress } from "../opportunities/salesProcess";
import { opportunityKindLabel } from "../opportunities/OpportunityContext";
import { resolveUspCardLabel } from "../catalogue/uspCards";
import type { OpportunityAnalysisInput } from "./buildOpportunityAnalysisPrompt";

export type GeneratedPlanActionDraft = {
  title: string;
  dueDate?: string;
  owner?: string;
  rationale?: string;
};

type ContactTypeLite = { id: string; label: string };
type DirectionLite = { id: string; name: string };

function roleLabel(types: ContactTypeLite[], role: string) {
  return types.find((t) => t.id === role)?.label ?? role;
}

function dirLabel(dirs: DirectionLite[], id: string) {
  return dirs.find((d) => d.id === id)?.name ?? id;
}

function processGaps(config: OrgConfig, opportunity: Opportunity) {
  const prog = computeProcessProgress(
    config.processDomains,
    opportunity.processAnswers,
  );
  const gaps: {
    domain: string;
    question: string;
    status: string;
    note?: string;
  }[] = [];
  for (const d of prog.domains) {
    const domain = config.processDomains.find((x) => x.id === d.domainId);
    if (!domain) continue;
    for (const q of domain.questions ?? []) {
      if (!q.active) continue;
      const ans = opportunity.processAnswers?.[q.id];
      const st = ans?.status ?? "None";
      if (st === "Yes") continue;
      gaps.push({
        domain: domain.label,
        question: q.label,
        status: st,
        note: ans?.note,
      });
    }
  }
  return { overallPct: prog.overallPct, gaps };
}

function mappingReadable(
  config: OrgConfig,
  opportunity: Opportunity,
) {
  const mapping = opportunity.mappingChecks ?? {};
  const subtypeLabel = (id: string) => {
    const hit = (config.oppMappingSubtypes ?? []).find((x) => x.id === id);
    if (hit) return hit.label;
    const usp = resolveUspCardLabel(
      id,
      config.solutions,
      config.orgProfile,
    );
    return usp ? `USP · ${usp.label}` : id;
  };
  const mapCards = (
    entries:
      | {
          id: string;
          status?: string;
          covered?: boolean;
          comment?: string;
        }[]
      | undefined,
  ) =>
    (entries ?? []).map((e) => ({
      label: subtypeLabel(e.id),
      status:
        e.status === "covered" ||
        e.status === "not_mastered" ||
        e.status === "open"
          ? e.status
          : e.covered
            ? "covered"
            : "open",
      comment: e.comment ?? "",
    }));

  return {
    forces: mapCards(mapping.signaux_positifs),
    faiblesses: mapCards(mapping.risques),
    opportunites: mapCards(mapping.objectif),
    menaces: mapCards(mapping.initiatives),
  };
}

function buildOppContext(
  config: OrgConfig,
  opportunity: Opportunity,
  account: Account | null,
  holdingName: string | null,
  contacts: Contact[],
  contactTypes: ContactTypeLite[],
  directions: DirectionLite[],
) {
  const { overallPct, gaps } = processGaps(config, opportunity);
  const stakeholders = (opportunity.stakeholders ?? []).map((s) => {
    const c = contacts.find((x) => x.id === s.contactId);
    return {
      name: c?.name ?? s.contactId,
      title: c?.title ?? "",
      contactType: s.role ? roleLabel(contactTypes, s.role) : "?",
      direction: c ? dirLabel(directions, c.directionId) : "?",
      engagement: engagementLabel[s.status as Status] ?? s.status,
      notes: s.notes ?? "",
    };
  });

  return {
    deal: {
      name: opportunity.name,
      amount: opportunity.amount,
      phase: opportunity.phase,
      kind: opportunityKindLabel[opportunity.kind] ?? opportunity.kind,
      closeDate: opportunity.closeDate,
      solutionId: opportunity.solutionId,
    },
    account: account
      ? {
          name: account.name,
          sector: account.sector,
          size: account.size,
          commercialStatus: account.commercialStatus,
          holding: holdingName,
        }
      : null,
    processOverallPct: overallPct,
    processGaps: gaps.slice(0, 30),
    opportunityMapping: mappingReadable(config, opportunity),
    stakeholders,
  };
}

export type ActionPlanGenerationInput = OpportunityAnalysisInput & {
  planDueDate?: string;
  existingActions?: { title: string; dueDate?: string; status: string }[];
};

/**
 * Prompt pour générer un plan d’actions JSON éditable.
 */
export function buildActionPlanPrompt(
  input: ActionPlanGenerationInput,
): { system: string; user: string } {
  const ctx = buildOppContext(
    input.config,
    input.opportunity,
    input.account,
    input.holdingName,
    input.contacts,
    input.contactTypes,
    input.directions,
  );

  const today = new Date().toISOString().slice(0, 10);
  const horizon =
    input.planDueDate ||
    input.opportunity.closeDate ||
    today;

  const system = [
    "Tu es un sales coach enterprise. Tu génères un plan d’actions concret.",
    "Réponds UNIQUEMENT avec un JSON valide (pas de markdown, pas de texte hors JSON).",
    "Schéma exact :",
    '{ "actions": [ { "title": string, "dueDate": "YYYY-MM-DD" | null, "owner": string | null, "rationale": string } ] }',
    "Contraintes :",
    "- 5 à 8 actions maximum",
    "- title : verbe d’action + objet (ex. « Cartographier Economic Buyer chez Finance »)",
    "- dueDate : entre aujourd’hui et l’horizon du plan/close ; null si inconnu",
    "- owner : initiales ou rôle (ex. AE, SE, Champion) ; null si inconnu",
    "- rationale : 1 phrase courte (pourquoi cette action, liée au process/mapping/stakeholders)",
    "- Priorise : gaps process non Yes, mapping ouvert/risques, rôles manquants ou Opposed",
    "- Pas de doublons avec les actions déjà présentes",
    "- Français uniquement",
  ].join("\n");

  const user = [
    `# Horizon`,
    JSON.stringify({ today, planOrCloseHorizon: horizon }),
    `# Actions déjà présentes (ne pas dupliquer)`,
    JSON.stringify(input.existingActions ?? []),
    `# Contexte deal`,
    JSON.stringify(ctx, null, 2),
  ].join("\n\n");

  return { system, user };
}

/** Extrait un tableau d’actions depuis une réponse modèle (JSON brut ou fence). */
export function parseGeneratedActions(raw: string): GeneratedPlanActionDraft[] {
  const trimmed = raw.trim();
  let jsonText = trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) jsonText = fence[1].trim();

  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start >= 0 && end > start) {
    jsonText = jsonText.slice(start, end + 1);
  }

  const parsed = JSON.parse(jsonText) as {
    actions?: unknown;
  };
  if (!Array.isArray(parsed.actions)) {
    throw new Error("JSON invalide : champ actions manquant");
  }

  const out: GeneratedPlanActionDraft[] = [];
  for (const item of parsed.actions) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = String(row.title ?? "").trim();
    if (!title) continue;
    const dueRaw = row.dueDate;
    const dueDate =
      typeof dueRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dueRaw)
        ? dueRaw
        : undefined;
    const owner =
      typeof row.owner === "string" && row.owner.trim()
        ? row.owner.trim()
        : undefined;
    const rationale =
      typeof row.rationale === "string" && row.rationale.trim()
        ? row.rationale.trim()
        : undefined;
    out.push({ title, dueDate, owner, rationale });
  }

  if (out.length === 0) {
    throw new Error("Aucune action exploitable dans la réponse");
  }
  return out.slice(0, 10);
}
