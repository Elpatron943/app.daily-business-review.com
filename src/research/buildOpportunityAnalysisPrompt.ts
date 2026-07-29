import type { Account, Contact, Status } from "../data";
import { engagementLabel } from "../data";
import type { OrgConfig } from "../config/types";
import { buildCompetitiveIntelSnapshot } from "../config/competitiveIntel";
import type { Opportunity } from "../opportunities/OpportunityContext";
import { computeProcessProgress } from "../opportunities/salesProcess";
import { resolveUspCardLabel } from "../catalogue/uspCards";

type ContactTypeLite = { id: string; label: string };
type DirectionLite = { id: string; name: string };

export type OpportunityAnalysisInput = {
  config: OrgConfig;
  opportunity: Opportunity;
  account: Account | null;
  holdingName: string | null;
  contacts: Contact[];
  contactTypes: ContactTypeLite[];
  directions: DirectionLite[];
};

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

/**
 * Prompt structure pour l'IA — analyse deal + recos actionnables.
 */
export function buildOpportunityAnalysisPrompt(
  input: OpportunityAnalysisInput,
): { system: string; user: string } {
  const intel = buildCompetitiveIntelSnapshot(
    input.config,
    input.opportunity,
  );
  const { overallPct, gaps } = processGaps(
    input.config,
    input.opportunity,
  );

  const stakeholders = (input.opportunity.stakeholders ?? []).map((s) => {
    const c = input.contacts.find((x) => x.id === s.contactId);
    return {
      name: c?.name ?? s.contactId,
      title: c?.title ?? "",
      contactType: s.role
        ? roleLabel(input.contactTypes, s.role)
        : "?",
      direction: c ? dirLabel(input.directions, c.directionId) : "?",
      engagement: engagementLabel[s.status as Status] ?? s.status,
      notes: s.notes ?? "",
      active: c?.active !== false,
    };
  });

  const mapping = input.opportunity.mappingChecks ?? {};
  const subtypeLabel = (id: string) => {
    const hit = (input.config.oppMappingSubtypes ?? []).find(
      (x) => x.id === id,
    );
    if (hit) return hit.label;
    const usp = resolveUspCardLabel(
      id,
      input.config.solutions,
      input.config.orgProfile,
    );
    return usp ? `USP · ${usp.label}` : id;
  };

  const compellingEvents = (input.opportunity.compellingEventIds ?? [])
    .map((id) => {
      const ce = (input.config.compellingEvents ?? []).find((c) => c.id === id);
      return ce
        ? { id: ce.id, label: ce.label, description: ce.description }
        : { id, label: id, description: "" };
    });

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
        e.status === "covered" || e.status === "not_mastered" || e.status === "open"
          ? e.status
          : e.covered
            ? "covered"
            : "open",
      comment: e.comment ?? "",
    }));

  const mappingReadable = {
    forces: mapCards(mapping.signaux_positifs),
    faiblesses: mapCards(mapping.risques),
    opportunites: mapCards(mapping.objectif),
    menaces: mapCards(mapping.initiatives),
  };

  const system = [
    "Tu es un coach sales enterprise (power mapping + qualification process).",
    "Tu réponds en français, de façon directe et actionnable.",
    "Structure ta réponse en Markdown avec ces sections obligatoires :",
    "1. ## Diagnostic (5–8 lignes max)",
    "2. ## Pouvoir & engagement (qui prioriser, risques politiques)",
    "3. ## Gaps process (questions bloquantes + comment les débloquer)",
    "4. ## Positionnement / USP (arguments vs concurrent, features à pousser)",
    "5. ## SWOT deal (Forces / Faiblesses / Opportunités / Menaces → actions)",
    "6. ## Plan d’actions (5 à 8 bullets numérotés, propriétaires implicites = rôles contacts)",
    "Pas de blabla générique. Cite les noms/titres/USP quand pertinents.",
  ].join("\n");

  const user = [
    `# Contexte opportunité`,
    JSON.stringify(
      {
        deal: {
          name: input.opportunity.name,
          amount: input.opportunity.amount,
          phase: input.opportunity.phase,
          kind: input.opportunity.kind,
          closeDate: input.opportunity.closeDate,
        },
        account: input.account
          ? {
              name: input.account.name,
              sector: input.account.sector,
              size: input.account.size,
              commercialStatus: input.account.commercialStatus,
              holding: input.holdingName,
            }
          : null,
        processOverallPct: overallPct,
        processGaps: gaps.slice(0, 40),
        compellingEvents,
        opportunityMapping: mappingReadable,
        stakeholders,
        competitiveIntel: intel,
      },
      null,
      2,
    ),
  ].join("\n\n");

  return { system, user };
}
