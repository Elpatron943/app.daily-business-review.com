import type { ProcessDomainDef } from "../config/types";

export type { ProcessDomainDef, ProcessQuestionDef } from "../config/types";

/** Template Process Enterprise (seed admin — personnalisable ensuite). */
export const DEFAULT_SALES_PROCESS: ProcessDomainDef[] = [
  {
    id: "dom-target-selected",
    label: "Target Selected",
    active: true,
    order: 1,
    questions: [
      {
        id: "q-ts-1",
        label: "Le compte cible est-il clairement identifié et priorisé ?",
        active: true,
        order: 1,
      },
      {
        id: "q-ts-2",
        label: "As-tu validé le périmètre (Groupe / entités) de l’opportunité ?",
        active: true,
        order: 2,
      },
      {
        id: "q-ts-3",
        label: "Le sponsor interne côté vendeur est-il nommé ?",
        active: true,
        order: 3,
      },
      {
        id: "q-ts-4",
        label: "La valeur du deal et l’horizon de close sont-ils estimés ?",
        active: true,
        order: 4,
      },
    ],
  },
  {
    id: "dom-target-qualified",
    label: "Target Qualified",
    active: true,
    order: 2,
    questions: [
      {
        id: "q-tq-1",
        label: "Le besoin métier du client est-il documenté ?",
        active: true,
        order: 1,
      },
      {
        id: "q-tq-ce",
        label:
          "Le Compelling Event est-il identifié (pourquoi le client doit agir maintenant) ?",
        active: true,
        order: 2,
      },
      {
        id: "q-tq-2",
        label: "As-tu confirmé le budget / capacité d’investissement ?",
        active: true,
        order: 3,
      },
      {
        id: "q-tq-3",
        label: "Le calendrier d’achat est-il réaliste ?",
        active: true,
        order: 4,
      },
      {
        id: "q-tq-4",
        label: "Y a-t-il un Economic Buyer identifiable ?",
        active: true,
        order: 5,
      },
    ],
  },
  {
    id: "dom-requirements",
    label: "Requirements",
    active: true,
    order: 3,
    questions: [
      {
        id: "q-req-1",
        label:
          "As-tu développé une Competitive Strategy pour gagner le business ?",
        active: true,
        order: 1,
      },
      {
        id: "q-req-2",
        label:
          "Ton Supporter / Mentor a-t-il identifié l’Inner Circle / structure politique ?",
        active: true,
        order: 2,
      },
      {
        id: "q-req-3",
        label:
          "As-tu confirmé avec les Supporters les Formal / Informal Decision Criteria ?",
        active: true,
        order: 3,
      },
      {
        id: "q-req-4",
        label:
          "As-tu documenté les Decision Criteria priorisés et l’Insight Map ?",
        active: true,
        order: 4,
      },
      {
        id: "q-req-5",
        label: "Les prérequis techniques / sécurité sont-ils listés ?",
        active: true,
        order: 5,
      },
      {
        id: "q-req-6",
        label: "Les critères de succès client sont-ils alignés ?",
        active: true,
        order: 6,
      },
    ],
  },
  {
    id: "dom-evidence",
    label: "Evidence",
    active: true,
    order: 4,
    questions: [
      {
        id: "q-ev-1",
        label: "As-tu une preuve de valeur (pilot, ROI, business case) ?",
        active: true,
        order: 1,
      },
      {
        id: "q-ev-2",
        label: "Les references / cas clients pertinents sont-ils partagés ?",
        active: true,
        order: 2,
      },
      {
        id: "q-ev-3",
        label: "La solution proposée couvre-t-elle les Decision Criteria clés ?",
        active: true,
        order: 3,
      },
      {
        id: "q-ev-4",
        label: "As-tu validé le Business Outcomes avec le client ?",
        active: true,
        order: 4,
      },
      {
        id: "q-ev-5",
        label: "Les objections majeures sont-elles traitées ?",
        active: true,
        order: 5,
      },
    ],
  },
  {
    id: "dom-acquisition",
    label: "Acquisition",
    active: true,
    order: 5,
    questions: [
      {
        id: "q-ac-1",
        label: "Le processus d’achat / procurement est-il cartographié ?",
        active: true,
        order: 1,
      },
      {
        id: "q-ac-2",
        label: "La proposition commerciale est-elle formalisée ?",
        active: true,
        order: 2,
      },
      {
        id: "q-ac-3",
        label: "Les termes juridiques / légaux sont-ils en cours ?",
        active: true,
        order: 3,
      },
    ],
  },
  {
    id: "dom-verbal",
    label: "Verbal Order",
    active: true,
    order: 6,
    questions: [
      {
        id: "q-vo-1",
        label: "As-tu un verbal / handshake de l’Economic Buyer ?",
        active: true,
        order: 1,
      },
      {
        id: "q-vo-2",
        label: "La date de signature est-elle confirmée ?",
        active: true,
        order: 2,
      },
      {
        id: "q-vo-3",
        label: "Les prochaines étapes de closing sont-elles planifiées ?",
        active: true,
        order: 3,
      },
    ],
  },
];

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
  const sum = statuses.reduce((a, s) => a + scoreOf(s), 0);
  const pct = Math.round((sum / qs.length) * 100);
  const complete = statuses.every((s) => s === "Yes");
  return { domainId: domain.id, pct, statuses, complete };
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
