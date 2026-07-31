import type { Account, Contact, Status } from "../data";
import { engagementLabel } from "../data";
import type { OrgConfig } from "../config/types";
import { buildCompetitiveIntelSnapshot } from "../config/competitiveIntel";
import type { Opportunity } from "../opportunities/OpportunityContext";
import { computeProcessProgress } from "../opportunities/salesProcess";
import { opportunityKindLabel } from "../opportunities/OpportunityContext";
import { resolveUspCardLabel } from "../catalogue/uspCards";
import type { GeneratedPlanActionDraft } from "./buildActionPlanPrompt";

type ContactTypeLite = { id: string; label: string };
type PersonaLite = { id: string; name: string };

/** Blocs que l’utilisateur peut inclure / exclure de l’analyse. */
export type OpportunityAnalysisSectionId =
  | "process"
  | "mapping"
  | "usp"
  | "stakeholders"
  | "compellingEvents"
  | "plan"
  | "businessOutcomes"
  | "competitiveIntel";

export type OpportunityAnalysisIncludes =
  Record<OpportunityAnalysisSectionId, boolean>;

export const ANALYSIS_SECTION_OPTIONS: {
  id: OpportunityAnalysisSectionId;
  label: string;
  hint: string;
}[] = [
  {
    id: "process",
    label: "Process de vente",
    hint: "Domaines, questions et gaps de qualification",
  },
  {
    id: "mapping",
    label: "Mapping / SWOT",
    hint: "Forces, faiblesses, opportunités, menaces (hors USP)",
  },
  {
    id: "usp",
    label: "USP",
    hint: "USP org, catalogue et cartes USP du mapping",
  },
  {
    id: "stakeholders",
    label: "Stakeholders",
    hint: "Contacts d’influence et engagement",
  },
  {
    id: "compellingEvents",
    label: "Compelling Events",
    hint: "Événements déclencheurs sélectionnés",
  },
  {
    id: "plan",
    label: "Plan d’actions",
    hint: "Actions déjà au plan (éviter les doublons)",
  },
  {
    id: "businessOutcomes",
    label: "Business Outcomes / ROI",
    hint: "Champs de valeur et horizon",
  },
  {
    id: "competitiveIntel",
    label: "Intel concurrentiel",
    hint: "Concurrents et différenciation",
  },
];

export function defaultAnalysisIncludes(): OpportunityAnalysisIncludes {
  return {
    process: true,
    mapping: true,
    usp: true,
    stakeholders: true,
    compellingEvents: true,
    plan: true,
    businessOutcomes: true,
    competitiveIntel: true,
  };
}

export type OpportunityAnalysisInput = {
  config: OrgConfig;
  opportunity: Opportunity;
  account: Account | null;
  holdingName: string | null;
  contacts: Contact[];
  contactTypes: ContactTypeLite[];
  personae: PersonaLite[];
  /** Actions déjà au plan (pour proposer des complémentaires). */
  existingPlanActions?: {
    title: string;
    dueDate?: string;
    status: string;
    owner?: string;
  }[];
  planDueDate?: string;
  /** Blocs à injecter dans le prompt (défaut = tout). */
  includes?: OpportunityAnalysisIncludes;
};

function roleLabel(types: ContactTypeLite[], role: string) {
  return types.find((t) => t.id === role)?.label ?? role;
}

function personaLabel(personae: PersonaLite[], id: string) {
  return personae.find((d) => d.id === id)?.name ?? id;
}

function processSnapshot(config: OrgConfig, opportunity: Opportunity) {
  const prog = computeProcessProgress(
    config.processDomains,
    opportunity.processAnswers,
  );
  const domains = prog.domains.map((d) => {
    const domain = config.processDomains.find((x) => x.id === d.domainId);
    const questions = (domain?.questions ?? [])
      .filter((q) => q.active)
      .map((q) => {
        const ans = opportunity.processAnswers?.[q.id];
        return {
          question: q.label,
          status: ans?.status ?? "None",
          note: ans?.note ?? "",
        };
      });
    return {
      domain: domain?.label ?? d.domainId,
      pct: d.pct,
      questions,
    };
  });
  const gaps = domains.flatMap((d) =>
    d.questions
      .filter((q) => q.status !== "Yes")
      .map((q) => ({
        domain: d.domain,
        question: q.question,
        status: q.status,
        note: q.note || undefined,
      })),
  );
  return { overallPct: prog.overallPct, domains, gaps };
}

type MappingCard = {
  label: string;
  isUsp: boolean;
  uspSource: string;
  status: string;
  comment: string;
};

function mappingReadable(config: OrgConfig, opportunity: Opportunity) {
  const mapping = opportunity.mappingChecks ?? {};
  const subtypeLabel = (id: string) => {
    const hit = (config.oppMappingSubtypes ?? []).find((x) => x.id === id);
    if (hit) return hit.label;
    const usp = resolveUspCardLabel(id, config.solutions, config.orgProfile);
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
  ): MappingCard[] =>
    (entries ?? []).map((e) => {
      const usp = resolveUspCardLabel(
        e.id,
        config.solutions,
        config.orgProfile,
      );
      return {
        label: subtypeLabel(e.id),
        isUsp: Boolean(usp),
        uspSource: usp?.sourceLabel ?? "",
        status:
          e.status === "covered" ||
          e.status === "not_mastered" ||
          e.status === "open"
            ? e.status
            : e.covered
              ? "covered"
              : "open",
        comment: e.comment ?? "",
      };
    });

  return {
    forces: mapCards(mapping.signaux_positifs),
    faiblesses: mapCards(mapping.risques),
    opportunites: mapCards(mapping.objectif),
    menaces: mapCards(mapping.initiatives),
  };
}

function filterMappingCards(
  mapping: ReturnType<typeof mappingReadable>,
  includeMapping: boolean,
  includeUsp: boolean,
) {
  if (!includeMapping && !includeUsp) return null;
  const keep = (cards: MappingCard[]) =>
    cards.filter((c) => {
      if (c.isUsp) return includeUsp;
      return includeMapping;
    });
  const next = {
    forces: keep(mapping.forces),
    faiblesses: keep(mapping.faiblesses),
    opportunites: keep(mapping.opportunites),
    menaces: keep(mapping.menaces),
  };
  const total =
    next.forces.length +
    next.faiblesses.length +
    next.opportunites.length +
    next.menaces.length;
  return total > 0 ? next : null;
}

/**
 * Prompt structure pour l'IA — analyse deal + recos actionnables.
 * (rétrocompat : markdown seul si le modèle ignore le JSON).
 */
export function buildOpportunityAnalysisPrompt(
  input: OpportunityAnalysisInput,
): { system: string; user: string } {
  const ensemble = buildEnsembleDealReviewPrompt(input);
  return { system: ensemble.system, user: ensemble.user };
}

/**
 * Analyse d’ensemble (process, SWOT, CE, USP, plan) + actions complémentaires JSON.
 */
export function buildEnsembleDealReviewPrompt(
  input: OpportunityAnalysisInput,
): { system: string; user: string } {
  const includes = { ...defaultAnalysisIncludes(), ...input.includes };
  const intelRaw = buildCompetitiveIntelSnapshot(
    input.config,
    input.opportunity,
  );
  const process = includes.process
    ? processSnapshot(input.config, input.opportunity)
    : null;
  const mappingFull = mappingReadable(input.config, input.opportunity);
  const opportunityMapping = filterMappingCards(
    mappingFull,
    includes.mapping,
    includes.usp,
  );

  const stakeholders = includes.stakeholders
    ? (input.opportunity.stakeholders ?? []).map((s) => {
        const c = input.contacts.find((x) => x.id === s.contactId);
        return {
          name: c?.name ?? s.contactId,
          title: c?.title ?? "",
          contactType: s.role ? roleLabel(input.contactTypes, s.role) : "?",
          persona: c ? personaLabel(input.personae, c.personaId) : "?",
          engagement: engagementLabel[s.status as Status] ?? s.status,
          notes: s.notes ?? "",
          active: c?.active !== false,
        };
      })
    : null;

  const compellingEvents = includes.compellingEvents
    ? (input.opportunity.compellingEventIds ?? []).map((id) => {
        const ce = (input.config.compellingEvents ?? []).find((c) => c.id === id);
        return ce
          ? { id: ce.id, label: ce.label, description: ce.description }
          : { id, label: id, description: "" };
      })
    : null;

  const bo = input.opportunity.businessOutcomes ?? {};
  const businessOutcomes = includes.businessOutcomes
    ? {
        oneTimeInvestment: bo.oneTimeInvestment,
        horizonYears: bo.horizonYears,
        highlightedFields: Object.entries(bo)
          .filter(
            ([k, v]) =>
              !["oneTimeInvestment", "horizonYears"].includes(k) &&
              typeof v === "number" &&
              v !== 0,
          )
          .slice(0, 12)
          .map(([id, value]) => {
            const field = (input.config.boFields ?? []).find((f) => f.id === id);
            return { id, label: field?.label ?? id, value };
          }),
      }
    : null;

  const competitiveIntel =
    includes.competitiveIntel || includes.usp
      ? {
          ...(includes.usp
            ? {
                vendor: intelRaw.vendor,
                solutions: intelRaw.solutions,
              }
            : {}),
          ...(includes.competitiveIntel
            ? { competitors: intelRaw.competitors }
            : {}),
        }
      : null;

  const today = new Date().toISOString().slice(0, 10);
  const horizon =
    input.planDueDate || input.opportunity.closeDate || today;

  const selectedLabels = ANALYSIS_SECTION_OPTIONS.filter(
    (o) => includes[o.id],
  ).map((o) => o.label);

  const markdownSections = [
    "1. ## Diagnostic (5–8 lignes)",
    "2. ## Verdict dirco (Go / Watch / No-go + pourquoi)",
  ];
  let n = 3;
  if (includes.process) {
    markdownSections.push(
      `${n}. ## Process — trous & preuves manquantes`,
    );
    n += 1;
  }
  if (includes.mapping || includes.usp) {
    markdownSections.push(
      `${n}. ## SWOT / mapping — forces, risques${includes.usp ? ", USP" : ""}`,
    );
    n += 1;
  }
  if (includes.stakeholders) {
    markdownSections.push(`${n}. ## Pouvoir & engagement`);
    n += 1;
  }
  if (includes.compellingEvents) {
    markdownSections.push(`${n}. ## Compelling Event & timing`);
    n += 1;
  }
  if (includes.plan) {
    markdownSections.push(
      `${n}. ## Complément au plan d’actions (ce qui manque vs le plan actuel)`,
    );
  }

  const system = [
    "Tu es un directeur commercial / coach sales enterprise (qualification + power mapping).",
    `Tu n’exploites QUE les blocs fournis dans le JSON utilisateur. Blocs sélectionnés : ${selectedLabels.join(", ") || "contexte deal uniquement"}.`,
    "Ignore tout sujet hors de ces blocs (ne pas inventer de données absentes).",
    "Réponds UNIQUEMENT avec un JSON valide (pas de markdown hors JSON, pas de texte libre).",
    "Schéma exact :",
    '{ "analysisMarkdown": string, "verdict": "Go" | "Watch" | "No-go", "confidence": "high" | "medium" | "low", "actions": [ { "title": string, "dueDate": "YYYY-MM-DD" | null, "owner": string | null, "rationale": string, "source": "process" | "mapping" | "stakeholder" | "ce" | "usp" | "plan" | "other" } ] }',
    "analysisMarkdown (français, Markdown) — sections :",
    ...markdownSections,
    "actions : 4 à 8 actions COMPLÉMENTAIRES (pas de doublon avec le plan existant si fourni).",
    "title = verbe + objet ; dueDate entre aujourd’hui et l’horizon ; owner = rôle/initiales ; rationale = 1 phrase liée à une preuve fournie.",
    "Pas de blabla générique. Cite noms, titres, USP, questions process quand pertinents et fournis.",
  ].join("\n");

  const payload: Record<string, unknown> = {
    deal: {
      name: input.opportunity.name,
      amount: input.opportunity.amount,
      phase: input.opportunity.phase,
      kind:
        opportunityKindLabel[input.opportunity.kind] ??
        input.opportunity.kind,
      closeDate: input.opportunity.closeDate,
      solutionId: input.opportunity.solutionId,
      moduleIds: input.opportunity.moduleIds,
      personaIds: input.opportunity.personaIds,
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
    includedSections: selectedLabels,
  };
  if (businessOutcomes) payload.businessOutcomes = businessOutcomes;
  if (process) payload.process = process;
  if (compellingEvents) payload.compellingEvents = compellingEvents;
  if (opportunityMapping) payload.opportunityMapping = opportunityMapping;
  if (stakeholders) payload.stakeholders = stakeholders;
  if (competitiveIntel) payload.competitiveIntel = competitiveIntel;

  const user = [
    `# Horizon`,
    JSON.stringify({ today, planOrCloseHorizon: horizon }),
    `# Actions déjà au plan (ne pas dupliquer)`,
    JSON.stringify(
      includes.plan ? (input.existingPlanActions ?? []) : [],
    ),
    `# Contexte opportunité (blocs sélectionnés)`,
    JSON.stringify(payload, null, 2),
  ].join("\n\n");

  return { system, user };
}

export type EnsembleDealReviewParsed = {
  analysisMarkdown: string;
  verdict?: "Go" | "Watch" | "No-go";
  confidence?: "high" | "medium" | "low";
  actions: GeneratedPlanActionDraft[];
};

/** Parse la réponse ensemble (JSON) ; fallback markdown brut. */
export function parseEnsembleDealReview(raw: string): EnsembleDealReviewParsed {
  const trimmed = raw.trim();
  let jsonText = trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) jsonText = fence[1].trim();
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start >= 0 && end > start) {
    jsonText = jsonText.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(jsonText) as {
      analysisMarkdown?: unknown;
      verdict?: unknown;
      confidence?: unknown;
      actions?: unknown;
    };
    const analysisMarkdown = String(parsed.analysisMarkdown ?? "").trim();
    const actions: GeneratedPlanActionDraft[] = [];
    if (Array.isArray(parsed.actions)) {
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
        actions.push({ title, dueDate, owner, rationale });
      }
    }
    if (analysisMarkdown || actions.length) {
      const verdict =
        parsed.verdict === "Go" ||
        parsed.verdict === "Watch" ||
        parsed.verdict === "No-go"
          ? parsed.verdict
          : undefined;
      const confidence =
        parsed.confidence === "high" ||
        parsed.confidence === "medium" ||
        parsed.confidence === "low"
          ? parsed.confidence
          : undefined;
      return {
        analysisMarkdown:
          analysisMarkdown ||
          "_Analyse reçue sans champ analysisMarkdown — voir actions proposées._",
        verdict,
        confidence,
        actions: actions.slice(0, 10),
      };
    }
  } catch {
    /* fallback markdown */
  }

  return {
    analysisMarkdown: trimmed,
    actions: [],
  };
}
