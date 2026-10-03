import type { Account } from "../data";
import type { ProcessDomainDef } from "../config/types";
import { computeDealScore } from "./dealScore";
import {
  diagnoseOpportunity,
  type CommitteeRoleMap,
  type DiagnosisFinding,
  type DiagnosisThresholds,
} from "./dealDiagnosis";
import type { Opportunity } from "./OpportunityContext";

export type DealReviewDiagnosticContact = {
  name: string;
  title: string;
  entity: string;
  role: string;
  status: string;
};

export type DealReviewPreviousAnswer = {
  code: string;
  date: string;
  answer: string;
};

export type DealReviewDiagnostic = {
  opportunity: {
    name: string;
    phase: string;
    amount: number;
    currency: string;
    close_date: string;
    days_to_close: number | null;
    days_since_update: number | null;
    deal_score: number | null;
    why_now: string | null;
    problem: string | null;
  };
  committee: DealReviewDiagnosticContact[];
  findings: Array<{
    code: string;
    severity: string;
    fact: string;
    question: string;
  }>;
  previous_answers: DealReviewPreviousAnswer[];
};

export type BuildDiagnosticInput = {
  opportunity: Opportunity;
  contacts: { id: string; name: string; title?: string; accountId: string }[];
  accounts: Pick<Account, "id" | "name" | "type" | "holdingId">[];
  processDomains: ProcessDomainDef[];
  phaseOrder: string[];
  processPct?: number;
  mappingPct?: number | null;
  updatedAt?: string | null;
  committeeRoles?: Partial<CommitteeRoleMap>;
  thresholds?: Partial<DiagnosisThresholds>;
  previousAnswers?: DealReviewPreviousAnswer[];
  now?: Date;
};

function roleKey(
  role: string,
  map: CommitteeRoleMap,
): string {
  if (map.economicBuyerRoleIds.includes(role)) return "economic_buyer";
  if (map.championRoleIds.includes(role)) return "champion";
  if (map.technicalBuyerRoleIds.includes(role)) return "technical_buyer";
  return role || "unknown";
}

export function buildDealReviewDiagnostic(
  input: BuildDiagnosticInput,
): {
  diagnostic: DealReviewDiagnostic;
  findings: DiagnosisFinding[];
} {
  const now = input.now ?? new Date();
  const findings = diagnoseOpportunity({
    opportunity: input.opportunity,
    contacts: input.contacts,
    accounts: input.accounts,
    processDomains: input.processDomains,
    phaseOrder: input.phaseOrder,
    processPct: input.processPct,
    mappingPct: input.mappingPct,
    updatedAt: input.updatedAt,
    committeeRoles: input.committeeRoles,
    thresholds: input.thresholds,
    now,
  });

  const roles: CommitteeRoleMap = {
    economicBuyerRoleIds: input.committeeRoles?.economicBuyerRoleIds ?? [
      "EconomicBuyer",
    ],
    championRoleIds: input.committeeRoles?.championRoleIds ?? ["Champion"],
    technicalBuyerRoleIds: input.committeeRoles?.technicalBuyerRoleIds ?? [],
  };

  const accountName = (id: string) =>
    input.accounts.find((a) => a.id === id)?.name ?? id;

  const close = input.opportunity.closeDate
    ? new Date(input.opportunity.closeDate.slice(0, 10) + "T12:00:00")
    : null;
  const daysToClose =
    close && Number.isFinite(close.getTime())
      ? Math.ceil((close.getTime() - now.getTime()) / 86400000)
      : null;

  let daysSinceUpdate: number | null = null;
  if (input.updatedAt) {
    const u = new Date(input.updatedAt);
    if (Number.isFinite(u.getTime())) {
      daysSinceUpdate = Math.floor((now.getTime() - u.getTime()) / 86400000);
    }
  }

  const dealScore =
    input.processPct != null
      ? computeDealScore(input.processPct, input.mappingPct)
      : null;

  const why =
    input.opportunity.whyNow?.inactionNote?.trim() ||
    (input.opportunity.compellingEventIds?.length
      ? `${input.opportunity.compellingEventIds.length} événement(s)`
      : null);

  const problem =
    input.opportunity.projectWhy?.problem?.trim() ||
    (input.opportunity.projectProblemIds?.length
      ? `${input.opportunity.projectProblemIds.length} problème(s) catalogue`
      : null);

  const committee: DealReviewDiagnosticContact[] = (
    input.opportunity.stakeholders ?? []
  ).map((s) => {
    const c = input.contacts.find((x) => x.id === s.contactId);
    return {
      name: c?.name ?? s.contactId,
      title: c?.title ?? "",
      entity: c ? accountName(c.accountId) : "",
      role: roleKey(s.role, roles),
      status: s.status,
    };
  });

  return {
    findings,
    diagnostic: {
      opportunity: {
        name: input.opportunity.name,
        phase: input.opportunity.phase,
        amount: input.opportunity.amount,
        currency: input.opportunity.currency,
        close_date: input.opportunity.closeDate,
        days_to_close: daysToClose,
        days_since_update: daysSinceUpdate,
        deal_score: dealScore,
        why_now: why,
        problem,
      },
      committee,
      findings: findings.map((f) => ({
        code: f.code,
        severity: f.severity,
        fact: f.fact,
        question: f.question,
      })),
      previous_answers: input.previousAnswers ?? [],
    },
  };
}

export function buildDealReviewSystemPrompt(opts: {
  orgName: string;
  sellerFirstName: string;
  /** Prénom de l’agent sous-secteur (si choisi). */
  agentFirstName?: string | null;
  /** Agent complet du sous-secteur (docs/agents/commercial). */
  sectorAddendum?: string | null;
}): string {
  const agentName = opts.agentFirstName?.trim();
  const who = agentName
    ? `Tu es ${agentName}, directeur / directrice commercial(e) digital(e) de ${opts.orgName}`
    : `Tu es le directeur commercial de ${opts.orgName}`;
  const sectorBlock = opts.sectorAddendum?.trim()
    ? `

# Agent sous-secteur
Tu incarnes la persona suivante (prioritaire pour le vocabulaire et les relances)${agentName ? ` — tu t'appelles ${agentName}` : ""} :
${opts.sectorAddendum.trim()}
Sans inventer de faits hors <diagnostic>.`
    : "";

  return `${who}. Tu fais une revue de deal avec ${opts.sellerFirstName} sur l'opportunité décrite dans <diagnostic>.

# Ton rôle
Aider le commercial à voir lui-même pourquoi ce deal bloque et quelle est la prochaine action qui le débloque. Tu coaches : tu poses des questions, tu ne fais pas le travail à sa place.

# Ta méthode
1. Commence par le constat le plus grave de <diagnostic>. Un seul sujet à la fois.
2. Pose une question ouverte, courte, concrète. Jamais deux questions dans le même message.
3. Si la réponse est vague (« ça avance », « il est plutôt pour », « bientôt »), relance : qui, quoi, quand, comment le sais-tu.
4. Distingue ce que le commercial sait (il l'a entendu, c'est écrit) de ce qu'il suppose. Quand c'est une supposition, dis-le et demande comment la vérifier.
5. Quand un sujet est clair, résume en une phrase et propose une action précise (qui, quoi, avant quelle date). Puis passe au constat suivant.
6. Arrête-toi après trois sujets au plus, ou quand le commercial veut conclure. Termine par la liste des actions décidées.

# Règles
- Tu ne cites que des faits présents dans <diagnostic> ou dans les réponses du commercial. Si une information manque, tu poses la question au lieu de supposer.
- Tu ne modifies rien toi-même : tu proposes, le commercial valide.
- Tu ne notes pas le commercial et tu ne le compares à personne.
- Si <previous_answers> contient un engagement passé, demande ce qui s'est passé avant d'aller plus loin.
- Tu tutoies, tu restes direct et cordial. Pas de jargon gratuit, pas de flatterie, pas d'emoji.
- Messages courts : 3 phrases au plus, sauf le résumé final.${sectorBlock}

# Format de chaque réponse
Réponds uniquement en JSON :
{ "message": "ce que tu dis au commercial",
  "topic": "code du constat traité (ex. C2)",
  "proposed_updates": [ { "type": "stakeholder_status | process_answer | action | note", "target": "…", "value": "…" } ],
  "done": false }`;
}
