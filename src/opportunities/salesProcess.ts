import type { OppPhaseDef, ProcessDomainDef } from "../config/types";
import { DEFAULT_OPP_PHASES, isBuiltInOppPhaseId } from "../config/types";

export type { ProcessDomainDef, ProcessQuestionDef } from "../config/types";

/**
 * Étapes de pipeline d’usine (hors ancres Whitespace / Won / Lost).
 * Source de vérité du funnel — le process s’aligne dessus.
 */
export const DEFAULT_PIPELINE_MID_PHASES: Omit<
  OppPhaseDef,
  "kpiRole"
>[] = [
  { id: "Discovery", label: "Discovery", active: true, order: 2 },
  { id: "Qualification", label: "Qualification", active: true, order: 3 },
  { id: "Proposal", label: "Proposal", active: true, order: 4 },
  { id: "Negotiation", label: "Negotiation", active: true, order: 5 },
];

/**
 * Funnel d’usine : Whitespace → étapes pipeline → Won / Lost.
 * Indépendant du process (c’est la phase qui enrichit le process).
 */
export function buildDefaultOppPhases(): OppPhaseDef[] {
  const ws = DEFAULT_OPP_PHASES.find((p) => p.id === "Whitespace")!;
  const won = DEFAULT_OPP_PHASES.find((p) => p.id === "Closed Won")!;
  const lost = DEFAULT_OPP_PHASES.find((p) => p.id === "Closed Lost")!;
  return [
    { ...ws, order: 1 },
    ...DEFAULT_PIPELINE_MID_PHASES.map((p) => ({
      ...p,
      kpiRole: "active" as const,
    })),
    { ...won, order: 1000 },
    { ...lost, order: 1001 },
  ];
}

/** Phases « actives » du funnel (hors Whitespace / Won / Lost). */
export function funnelMidPhases(phases: OppPhaseDef[]): OppPhaseDef[] {
  return [...phases]
    .filter((p) => p.active !== false && !isBuiltInOppPhaseId(p.id))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "fr"));
}

/**
 * Domaines process d’usine : un domaine par étape de pipeline,
 * avec questions de qualification typiques.
 */
export const DEFAULT_SALES_PROCESS: ProcessDomainDef[] = [
  {
    id: "dom-discovery",
    label: "Discovery",
    active: true,
    order: 1,
    questions: [
      {
        id: "q-disc-1",
        label: "Le compte cible est-il clairement identifié et priorisé ?",
        active: true,
        order: 1,
      },
      {
        id: "q-disc-2",
        label: "As-tu validé le périmètre (Groupe / entités) de l’opportunité ?",
        active: true,
        order: 2,
      },
      {
        id: "q-disc-3",
        label: "Le besoin métier du client est-il documenté ?",
        active: true,
        order: 3,
      },
      {
        id: "q-disc-4",
        label: "Le sponsor interne côté vendeur est-il nommé ?",
        active: true,
        order: 4,
      },
    ],
  },
  {
    id: "dom-qualification",
    label: "Qualification",
    active: true,
    order: 2,
    questions: [
      {
        id: "q-qual-ce",
        label: "Identification d’un compelling event",
        active: true,
        order: 1,
      },
      {
        id: "q-qual-1",
        label: "As-tu confirmé le budget / capacité d’investissement ?",
        active: true,
        order: 2,
      },
      {
        id: "q-qual-2",
        label: "Le calendrier d’achat est-il réaliste ?",
        active: true,
        order: 3,
      },
      {
        id: "q-qual-3",
        label: "Y a-t-il un Economic Buyer identifiable ?",
        active: true,
        order: 4,
      },
      {
        id: "q-qual-4",
        label: "La valeur du deal et l’horizon de close sont-ils estimés ?",
        active: true,
        order: 5,
      },
    ],
  },
  {
    id: "dom-proposal",
    label: "Proposal",
    active: true,
    order: 3,
    questions: [
      {
        id: "q-prop-1",
        label:
          "As-tu développé une Competitive Strategy pour gagner le business ?",
        active: true,
        order: 1,
      },
      {
        id: "q-prop-2",
        label:
          "As-tu confirmé avec les Supporters les Formal / Informal Decision Criteria ?",
        active: true,
        order: 2,
      },
      {
        id: "q-prop-3",
        label: "As-tu une preuve de valeur (pilot, ROI, business case) ?",
        active: true,
        order: 3,
      },
      {
        id: "q-prop-4",
        label: "As-tu validé les Business Outcomes avec le client ?",
        active: true,
        order: 4,
      },
      {
        id: "q-prop-5",
        label: "La solution proposée couvre-t-elle les Decision Criteria clés ?",
        active: true,
        order: 5,
      },
    ],
  },
  {
    id: "dom-negotiation",
    label: "Negotiation",
    active: true,
    order: 4,
    questions: [
      {
        id: "q-neg-1",
        label: "Le processus d’achat / procurement est-il cartographié ?",
        active: true,
        order: 1,
      },
      {
        id: "q-neg-2",
        label: "La proposition commerciale est-elle formalisée ?",
        active: true,
        order: 2,
      },
      {
        id: "q-neg-3",
        label: "Les termes juridiques / légaux sont-ils en cours ?",
        active: true,
        order: 3,
      },
      {
        id: "q-neg-4",
        label: "As-tu un verbal / handshake de l’Economic Buyer ?",
        active: true,
        order: 4,
      },
      {
        id: "q-neg-5",
        label: "La date de signature est-elle confirmée ?",
        active: true,
        order: 5,
      },
    ],
  },
];

/**
 * Assure un domaine process par phase funnel (sans écraser questions existantes).
 * Appelé à la création d’une phase et au seed d’usine.
 */
export function ensureProcessDomainsForPhases(
  domains: ProcessDomainDef[],
  phases: OppPhaseDef[],
): ProcessDomainDef[] {
  const mid = funnelMidPhases(phases);
  const byLabel = new Map(
    domains.map((d) => [d.label.trim().toLowerCase(), d] as const),
  );
  const next = [...domains];
  let orderBase =
    next.reduce((m, d) => Math.max(m, d.order || 0), 0) || mid.length;
  for (const phase of mid) {
    const key = phase.label.trim().toLowerCase();
    const existing = byLabel.get(key);
    if (existing) {
      if (!existing.active) {
        const i = next.findIndex((d) => d.id === existing.id);
        if (i >= 0) next[i] = { ...next[i], active: true };
      }
      continue;
    }
    orderBase += 1;
    const id = `dom-${phase.id}`
      .toLowerCase()
      .replace(/[^a-z0-9+\-_]/g, "-");
    const created: ProcessDomainDef = {
      id: next.some((d) => d.id === id) ? `dom-${orderBase}` : id,
      label: phase.label,
      active: true,
      order: orderBase,
      questions: [],
    };
    next.push(created);
    byLabel.set(key, created);
  }
  return next;
}

export type ProcessAnswerStatus = "None" | "Yes" | "InProgress" | "No";

export const PROCESS_ANSWER_STATUSES: {
  id: ProcessAnswerStatus;
  label: string;
}[] = [
  { id: "None", label: "— Aucun —" },
  { id: "Yes", label: "Yes" },
  { id: "InProgress", label: "In progress" },
  { id: "No", label: "No" },
];

export type ProcessAnswer = {
  status: ProcessAnswerStatus;
  note?: string;
  updatedAt?: string;
};

/** Réponses par questionId, scopées à une opportunité. */
export type ProcessAnswers = Record<string, ProcessAnswer>;

function scoreOf(status: ProcessAnswerStatus): number {
  if (status === "Yes") return 1;
  if (status === "InProgress") return 0.5;
  return 0;
}

export function getAnswer(
  answers: ProcessAnswers | undefined,
  questionId: string,
): ProcessAnswer {
  return answers?.[questionId] ?? { status: "None" };
}

export type DomainProgress = {
  domainId: string;
  pct: number;
  statuses: ProcessAnswerStatus[];
  complete: boolean;
};

export function activeQuestions(domain: ProcessDomainDef) {
  return [...domain.questions]
    .filter((q) => q.active !== false)
    .sort((a, b) => a.order - b.order);
}

export function computeDomainProgress(
  domain: ProcessDomainDef,
  answers: ProcessAnswers | undefined,
): DomainProgress {
  const qs = activeQuestions(domain);
  if (qs.length === 0) {
    return { domainId: domain.id, pct: 0, statuses: [], complete: false };
  }
  const statuses = qs.map((q) => getAnswer(answers, q.id).status);
  const score = statuses.reduce((s, st) => s + scoreOf(st), 0);
  const pct = Math.round((score / qs.length) * 100);
  return {
    domainId: domain.id,
    pct,
    statuses,
    complete: statuses.every((st) => st === "Yes"),
  };
}

export function computeProcessProgress(
  domains: ProcessDomainDef[],
  answers: ProcessAnswers | undefined,
): { overallPct: number; domains: DomainProgress[] } {
  const activeDomains = [...domains]
    .filter((d) => d.active !== false)
    .sort((a, b) => a.order - b.order);
  const domainProgress = activeDomains.map((d) =>
    computeDomainProgress(d, answers),
  );
  const allQ = activeDomains.flatMap((d) => activeQuestions(d));
  if (allQ.length === 0) return { overallPct: 0, domains: domainProgress };
  const sum = allQ.reduce(
    (a, q) => a + scoreOf(getAnswer(answers, q.id).status),
    0,
  );
  return {
    overallPct: Math.round((sum / allQ.length) * 100),
    domains: domainProgress,
  };
}
