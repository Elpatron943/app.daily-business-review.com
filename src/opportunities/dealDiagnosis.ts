/**
 * Diagnostic déterministe d’opportunité (Directeur commercial digital — étape 1).
 * Pure : pas d’appel réseau. Même entrée → mêmes findings.
 */

import type { Account } from "../data";
import type { OppMappingChecks, ProcessDomainDef } from "../config/types";
import { computeDealScore } from "./dealScore";
import {
  activeQuestions,
  getAnswer,
  type ProcessAnswers,
} from "./salesProcess";
import type {
  Opportunity,
  OpportunityAction,
} from "./OpportunityContext";

export type FindingSeverity = "bloquant" | "risque" | "vigilance";

export type FindingCode =
  | "C1"
  | "C2"
  | "C3"
  | "C4"
  | "C5"
  | "C6"
  | "P1"
  | "P2"
  | "P3"
  | "U1"
  | "U2"
  | "U3"
  | "T1"
  | "T2"
  | "T3"
  | "A1"
  | "A2"
  | "M1"
  | "M2"
  | "M3";

export type DiagnosisFinding = {
  code: FindingCode;
  family:
    | "Comité d'achat"
    | "Process"
    | "Urgence et valeur"
    | "Calendrier"
    | "Plan d'action"
    | "Cartographie";
  severity: FindingSeverity;
  fact: string;
  question: string;
};

/** Mapping des types de contact org → rôles comité. */
export type CommitteeRoleMap = {
  economicBuyerRoleIds: string[];
  championRoleIds: string[];
  technicalBuyerRoleIds: string[];
};

export const DEFAULT_COMMITTEE_ROLE_MAP: CommitteeRoleMap = {
  economicBuyerRoleIds: ["EconomicBuyer"],
  championRoleIds: ["Champion"],
  technicalBuyerRoleIds: [],
};

export type DiagnosisThresholds = {
  /** % questions sans réponse en phase courante (P2). */
  unansweredSharePct: number;
  /** Jours avant closing pour T2. */
  closeSoonDays: number;
  /** Jours sans mise à jour pour T3. */
  staleDays: number;
  /** Score deal bas pour M3. */
  lowDealScore: number;
};

export const DEFAULT_DIAGNOSIS_THRESHOLDS: DiagnosisThresholds = {
  unansweredSharePct: 50,
  closeSoonDays: 30,
  staleDays: 21,
  lowDealScore: 35,
};

export type DiagnosisContact = {
  id: string;
  name: string;
  title?: string;
  accountId: string;
};

export type DiagnoseOpportunityInput = {
  opportunity: Opportunity;
  contacts: DiagnosisContact[];
  accounts: Pick<Account, "id" | "type" | "holdingId">[];
  processDomains: ProcessDomainDef[];
  /** Ordre des phases actives (funnel). */
  phaseOrder: string[];
  committeeRoles?: Partial<CommitteeRoleMap>;
  thresholds?: Partial<DiagnosisThresholds>;
  /** Fraîcheur fiche (ISO). Si absent : max des processAnswers.updatedAt. */
  updatedAt?: string | null;
  /** Score process 0–100 (sinon non calculé ici pour M3 si mappingPct fourni). */
  processPct?: number;
  /** Score mapping 0–100. */
  mappingPct?: number | null;
  /** Aujourd’hui (tests). */
  now?: Date;
};

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  bloquant: 0,
  risque: 1,
  vigilance: 2,
};

const GRID_ORDER: FindingCode[] = [
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "P1",
  "P2",
  "P3",
  "U1",
  "U2",
  "U3",
  "T1",
  "T2",
  "T3",
  "A1",
  "A2",
  "M1",
  "M2",
  "M3",
];

function phaseIndex(phase: string, order: string[]): number {
  const i = order.findIndex((p) => p === phase);
  return i >= 0 ? i : -1;
}

function atLeastPhase(
  phase: string,
  minPhase: string,
  order: string[],
): boolean {
  const a = phaseIndex(phase, order);
  const b = phaseIndex(minPhase, order);
  if (a < 0 || b < 0) return false;
  return a >= b;
}

function beforePhase(
  phase: string,
  exclusiveMax: string,
  order: string[],
): boolean {
  const a = phaseIndex(phase, order);
  const b = phaseIndex(exclusiveMax, order);
  if (a < 0 || b < 0) return false;
  return a < b;
}

function isOpenAction(a: OpportunityAction): boolean {
  return a.status === "Todo" || a.status === "Doing";
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / 86400000);
}

function parseDateOnly(iso: string | undefined | null): Date | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  return Number.isFinite(d.getTime()) ? d : null;
}

function resolveUpdatedAt(
  opp: Opportunity,
  explicit?: string | null,
): Date | null {
  if (explicit) {
    const d = new Date(explicit);
    if (Number.isFinite(d.getTime())) return d;
  }
  let max: Date | null = null;
  for (const ans of Object.values(opp.processAnswers ?? {})) {
    if (!ans?.updatedAt) continue;
    const d = new Date(ans.updatedAt);
    if (!Number.isFinite(d.getTime())) continue;
    if (!max || d > max) max = d;
  }
  return max;
}

function domainForPhase(
  domains: ProcessDomainDef[],
  phase: string,
): ProcessDomainDef | null {
  const active = [...domains]
    .filter((d) => d.active !== false)
    .sort((a, b) => a.order - b.order);
  const byLabel = active.find(
    (d) => d.label.toLowerCase() === phase.toLowerCase(),
  );
  if (byLabel) return byLabel;
  const byId = active.find((d) =>
    d.id.toLowerCase().includes(phase.toLowerCase()),
  );
  return byId ?? null;
}

function previousDomains(
  domains: ProcessDomainDef[],
  current: ProcessDomainDef,
): ProcessDomainDef[] {
  return [...domains]
    .filter((d) => d.active !== false && d.order < current.order)
    .sort((a, b) => a.order - b.order);
}

function contactLabel(
  contacts: DiagnosisContact[],
  id: string,
): string {
  const c = contacts.find((x) => x.id === id);
  if (!c) return id;
  return c.title ? `${c.name} (${c.title})` : c.name;
}

function hasWhyNow(opp: Opportunity): boolean {
  const note = opp.whyNow?.inactionNote?.trim();
  const deadline = opp.whyNow?.decisionDeadline?.trim();
  const levers = opp.whyNow?.inactionLeverIds?.length ?? 0;
  return Boolean(note || deadline || levers > 0);
}

function hasBusinessOutcomes(opp: Opportunity): boolean {
  const bo = opp.businessOutcomes ?? {};
  return Object.values(bo).some((v) => typeof v === "number" && v !== 0);
}

function hasClientProblem(opp: Opportunity): boolean {
  if ((opp.projectProblemIds?.length ?? 0) > 0) return true;
  return Boolean(opp.projectWhy?.problem?.trim());
}

function notMasteredCards(checks: OppMappingChecks | undefined): string[] {
  if (!checks) return [];
  const ids: string[] = [];
  for (const entries of Object.values(checks)) {
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (e.status === "not_mastered") ids.push(e.id);
    }
  }
  return ids;
}

function sortFindings(findings: DiagnosisFinding[]): DiagnosisFinding[] {
  return [...findings].sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    return GRID_ORDER.indexOf(a.code) - GRID_ORDER.indexOf(b.code);
  });
}

/**
 * Produit la liste `findings` de la grille (C1–M3).
 * Fonction pure, sans I/O.
 */
export function diagnoseOpportunity(
  input: DiagnoseOpportunityInput,
): DiagnosisFinding[] {
  const now = input.now ?? new Date();
  const roles: CommitteeRoleMap = {
    ...DEFAULT_COMMITTEE_ROLE_MAP,
    ...input.committeeRoles,
    economicBuyerRoleIds:
      input.committeeRoles?.economicBuyerRoleIds ??
      DEFAULT_COMMITTEE_ROLE_MAP.economicBuyerRoleIds,
    championRoleIds:
      input.committeeRoles?.championRoleIds ??
      DEFAULT_COMMITTEE_ROLE_MAP.championRoleIds,
    technicalBuyerRoleIds:
      input.committeeRoles?.technicalBuyerRoleIds ??
      DEFAULT_COMMITTEE_ROLE_MAP.technicalBuyerRoleIds,
  };
  const th: DiagnosisThresholds = {
    ...DEFAULT_DIAGNOSIS_THRESHOLDS,
    ...input.thresholds,
  };

  const opp = input.opportunity;
  const stakeholders = opp.stakeholders ?? [];
  const actions = opp.actions ?? [];
  const order = input.phaseOrder;
  const findings: DiagnosisFinding[] = [];

  const eb = stakeholders.filter((s) =>
    roles.economicBuyerRoleIds.includes(s.role),
  );
  const champions = stakeholders.filter((s) =>
    roles.championRoleIds.includes(s.role),
  );
  const engagedOrAligned = stakeholders.filter(
    (s) => s.status === "Engaged" || s.status === "Aligned",
  );

  // —— Comité ——
  if (atLeastPhase(opp.phase, "Qualification", order) && eb.length === 0) {
    findings.push({
      code: "C1",
      family: "Comité d'achat",
      severity: "bloquant",
      fact: "Aucun contact avec le rôle acheteur économique, à partir de Qualification.",
      question: "Qui signe, et qui peut dire non au dernier moment ?",
    });
  }

  if (atLeastPhase(opp.phase, "Proposal", order)) {
    for (const s of eb) {
      if (s.status === "Unknown" || s.status === "Identified") {
        findings.push({
          code: "C2",
          family: "Comité d'achat",
          severity: "bloquant",
          fact: `L'acheteur économique (${contactLabel(input.contacts, s.contactId)}) est au statut ${s.status} en phase ${opp.phase}.`,
          question:
            "Quand lui as-tu parlé pour la dernière fois, et qu'a-t-il dit lui-même ?",
        });
      }
    }
  }

  const strongChampion = champions.some(
    (s) => s.status === "Engaged" || s.status === "Aligned",
  );
  if (!strongChampion) {
    findings.push({
      code: "C3",
      family: "Comité d'achat",
      severity: "risque",
      fact: "Aucun champion (rôle champion avec statut Engaged ou Aligned).",
      question: "Qui défend ton projet quand tu n'es pas dans la pièce ?",
    });
  }

  if (engagedOrAligned.length < 2) {
    findings.push({
      code: "C4",
      family: "Comité d'achat",
      severity: "risque",
      fact:
        engagedOrAligned.length === 0
          ? "Aucun contact Engaged ou Aligned (deal mono-threadé / vide)."
          : "Un seul contact Engaged ou Aligned (deal mono-threadé).",
      question: "Si ton contact part demain, que reste-t-il du deal ?",
    });
  }

  for (const s of stakeholders) {
    if (s.status !== "Opposed") continue;
    const open = actions.filter(isOpenAction);
    // Pas de lien action↔contact en v1 : absence d’action ouverte = non traité.
    if (open.length === 0) {
      findings.push({
        code: "C5",
        family: "Comité d'achat",
        severity: "bloquant",
        fact: `Contact opposé (${contactLabel(input.contacts, s.contactId)}) sans action ouverte.`,
        question:
          "Que fais-tu de l'opposition de ce contact, concrètement, cette semaine ?",
      });
    }
  }

  const primary = input.accounts.find((a) => a.id === opp.primaryAccountId);
  const holdingId =
    primary?.type === "Holding" ? primary.id : primary?.holdingId ?? null;
  if (holdingId && stakeholders.length > 0) {
    const siblingIds = new Set(
      input.accounts
        .filter(
          (a) =>
            a.id === holdingId ||
            a.holdingId === holdingId ||
            (a.type === "Holding" && a.id === holdingId),
        )
        .map((a) => a.id),
    );
    const contactAccounts = new Set<string>();
    for (const s of stakeholders) {
      const c = input.contacts.find((x) => x.id === s.contactId);
      if (c?.accountId) contactAccounts.add(c.accountId);
    }
    const onGroup = [...contactAccounts].filter((id) => siblingIds.has(id));
    if (siblingIds.size > 2 && onGroup.length === 1) {
      findings.push({
        code: "C6",
        family: "Comité d'achat",
        severity: "vigilance",
        fact: "Tous les contacts mappés sont sur la même entité alors que le compte a des filiales.",
        question:
          "La filiale qui paie est-elle la même que celle qui déploie ?",
      });
    }
  }

  // —— Process ——
  const currentDomain = domainForPhase(input.processDomains, opp.phase);
  const answers: ProcessAnswers = opp.processAnswers ?? {};
  if (currentDomain) {
    const qs = activeQuestions(currentDomain);
    for (const q of qs) {
      const st = getAnswer(answers, q.id).status;
      if (st === "No") {
        findings.push({
          code: "P1",
          family: "Process",
          severity: "bloquant",
          fact: `Tu es en phase ${opp.phase} mais « ${q.label} » est à Non.`,
          question: `Tu es en phase ${opp.phase} mais « ${q.label} » est à Non : qu'est-ce qui t'autorise à y être ?`,
        });
      }
    }
    if (qs.length > 0) {
      const unanswered = qs.filter(
        (q) => getAnswer(answers, q.id).status === "None",
      ).length;
      const share = (unanswered / qs.length) * 100;
      if (share > th.unansweredSharePct) {
        findings.push({
          code: "P2",
          family: "Process",
          severity: "risque",
          fact: `Plus de ${th.unansweredSharePct} % des questions de la phase ${opp.phase} sans réponse (${unanswered}/${qs.length}).`,
          question: `Sur quoi reposes-tu pour dire que ce deal est en phase ${opp.phase} ?`,
        });
      }
    }

    for (const prev of previousDomains(input.processDomains, currentDomain)) {
      for (const q of activeQuestions(prev)) {
        const st = getAnswer(answers, q.id).status;
        if (st === "No" || st === "None") {
          findings.push({
            code: "P3",
            family: "Process",
            severity: "risque",
            fact: `Question d'une phase précédente (${prev.label}) « ${q.label} » à ${st === "None" ? "vide" : "Non"}.`,
            question:
              "On a sauté une étape : que se passe-t-il si elle revient en fin de cycle ?",
          });
          // Un constat P3 suffit pour signaler le saut (évite le bruit).
          break;
        }
      }
    }
  }

  // —— Urgence / valeur ——
  if (
    atLeastPhase(opp.phase, "Qualification", order) &&
    !hasWhyNow(opp) &&
    (opp.compellingEventIds?.length ?? 0) === 0
  ) {
    findings.push({
      code: "U1",
      family: "Urgence et valeur",
      severity: "bloquant",
      fact: "Aucun why now ni événement déclencheur renseigné, à partir de Qualification.",
      question: "Que perd le client s'il ne fait rien d'ici six mois ?",
    });
  }

  if (
    atLeastPhase(opp.phase, "Proposal", order) &&
    !hasBusinessOutcomes(opp)
  ) {
    findings.push({
      code: "U2",
      family: "Urgence et valeur",
      severity: "risque",
      fact: "Business outcomes vides, à partir de Proposal.",
      question:
        "Combien vaut ce projet pour eux, en euros, et qui a validé ce chiffre ?",
    });
  }

  if (!hasClientProblem(opp)) {
    findings.push({
      code: "U3",
      family: "Urgence et valeur",
      severity: "risque",
      fact: "Problème client non renseigné.",
      question: "Quel problème résous-tu, dit avec les mots du client ?",
    });
  }

  // —— Calendrier ——
  const close = parseDateOnly(opp.closeDate);
  const terminal =
    opp.phase === "Closed Won" ||
    opp.phase === "Closed Lost" ||
    opp.phase === "Whitespace";
  if (close && !terminal && close < now) {
    findings.push({
      code: "T1",
      family: "Calendrier",
      severity: "bloquant",
      fact: `Date de closing dépassée (${opp.closeDate}) et deal toujours actif.`,
      question: "La date est passée : qu'est-ce qui a glissé, et qui l'a décidé ?",
    });
  }

  if (
    close &&
    !terminal &&
    daysBetween(now, close) >= 0 &&
    daysBetween(now, close) < th.closeSoonDays &&
    beforePhase(opp.phase, "Negotiation", order)
  ) {
    findings.push({
      code: "T2",
      family: "Calendrier",
      severity: "risque",
      fact: `Closing dans moins de ${th.closeSoonDays} jours et phase avant Negotiation (${opp.phase}).`,
      question:
        "Il reste moins d'un mois : qu'est-ce qui doit se passer chaque semaine pour signer ?",
    });
  }

  const updated = resolveUpdatedAt(opp, input.updatedAt);
  if (updated && !terminal) {
    const stale = daysBetween(updated, now);
    if (stale > th.staleDays) {
      findings.push({
        code: "T3",
        family: "Calendrier",
        severity: "vigilance",
        fact: `Fiche non mise à jour depuis plus de ${th.staleDays} jours (${stale} j).`,
        question: "Que s'est-il passé sur ce deal depuis trois semaines ?",
      });
    }
  }

  // —— Plan d'action ——
  const openActions = actions.filter(isOpenAction);
  if (openActions.length === 0 && !terminal) {
    findings.push({
      code: "A1",
      family: "Plan d'action",
      severity: "risque",
      fact: "Aucune action ouverte.",
      question: "Quelle est la prochaine étape, avec qui, et quand ?",
    });
  }

  for (const a of openActions) {
    const due = parseDateOnly(a.dueDate);
    if (due && due < now) {
      findings.push({
        code: "A2",
        family: "Plan d'action",
        severity: "vigilance",
        fact: `Action en retard : « ${a.title} » (échéance ${a.dueDate}).`,
        question:
          "Cette action est en retard : on la tient, on la déplace ou on l'abandonne ?",
      });
      break;
    }
  }

  // —— Cartographie ——
  const gaps = notMasteredCards(opp.mappingChecks);
  if (gaps.length > 0 && openActions.length === 0) {
    findings.push({
      code: "M1",
      family: "Cartographie",
      severity: "risque",
      fact: `Carte SWOT « non maîtrisée » (${gaps.length}) sans action ouverte liée.`,
      question:
        "Tu as noté ce point comme non maîtrisé : qu'est-ce qui le rendrait maîtrisé ?",
    });
  }

  if (
    atLeastPhase(opp.phase, "Proposal", order) &&
    (opp.competitorIds?.length ?? 0) === 0
  ) {
    findings.push({
      code: "M2",
      family: "Cartographie",
      severity: "vigilance",
      fact: "Aucun concurrent identifié, à partir de Proposal.",
      question:
        "Contre qui, ou contre quoi, es-tu en compétition, y compris le statu quo ?",
    });
  }

  if (
    atLeastPhase(opp.phase, "Proposal", order) &&
    input.processPct != null
  ) {
    const score = computeDealScore(input.processPct, input.mappingPct);
    if (score < th.lowDealScore) {
      findings.push({
        code: "M3",
        family: "Cartographie",
        severity: "risque",
        fact: `Score deal sous ${th.lowDealScore} (${score}) alors que la phase est ${opp.phase}.`,
        question:
          "Ton score dit que le deal n'est pas prêt : qu'est-ce que tu sais que la fiche ne montre pas ?",
      });
    }
  }

  return sortFindings(findings);
}

/** Alias export pour tests / grille. */
export { GRID_ORDER as DIAGNOSIS_GRID_ORDER };

/** Helpers testables. */
export const __diagnosisInternals = {
  atLeastPhase,
  beforePhase,
  phaseIndex,
  hasWhyNow,
  hasBusinessOutcomes,
  hasClientProblem,
  notMasteredCards,
  sortFindings,
};
