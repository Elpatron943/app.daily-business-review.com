/**
 * File d’attente locale pour le coach Sales : trous de qualification + findings.
 */

import type { DiagnosisFinding } from "./dealDiagnosis";
import type { Opportunity } from "./OpportunityContext";

export type SalesCoachStepId =
  | "stakeholder"
  | "problem"
  | "urgency"
  | "competitor"
  | "value"
  | "challenge";

export type SalesCoachStep = {
  id: SalesCoachStepId;
  title: string;
  botMessage: string;
  placeholder: string;
  /** Finding code si issu du diagnostic. */
  findingCode?: string;
};

export function buildSalesCoachQueue(input: {
  opportunity: Opportunity;
  findings: DiagnosisFinding[];
}): SalesCoachStep[] {
  const { opportunity, findings } = input;
  const steps: SalesCoachStep[] = [];

  if ((opportunity.stakeholders?.length ?? 0) === 0) {
    steps.push({
      id: "stakeholder",
      title: "Contact clé",
      botMessage:
        "Qui est ton **contact le plus utile** sur ce deal aujourd’hui ? Donne prénom/nom (et titre si tu l’as).",
      placeholder: "Ex. Marie Dupont — DSI",
    });
  }

  if (!opportunity.projectWhy?.problem?.trim()) {
    steps.push({
      id: "problem",
      title: "Problème client",
      botMessage:
        "**Pourquoi y a-t-il un projet ?** En une phrase : quel problème ou enjeu pousse le client à regarder une solution ?",
      placeholder: "Ex. Pas de vision pipeline, process Excel…",
    });
  }

  if ((opportunity.compellingEventIds?.length ?? 0) === 0) {
    const u = findings.find((f) => f.code === "U1" || f.code === "U2");
    steps.push({
      id: "urgency",
      title: "Pourquoi maintenant",
      botMessage: u
        ? `${u.question}`
        : "**Pourquoi maintenant ?** Quelle échéance, audit ou événement force une décision ?",
      placeholder: "Ex. Renew Q2, audit conformité, départ concurrent…",
      findingCode: u?.code,
    });
  }

  if ((opportunity.competitorIds?.length ?? 0) === 0) {
    steps.push({
      id: "competitor",
      title: "Concurrent / statut quo",
      botMessage:
        "Contre qui joues-tu (ou quel **statut quo**) ? Un nom ou « Excel / outil maison » suffit.",
      placeholder: "Ex. Concurrent X, ou Excel + process actuel",
    });
  }

  const note = opportunity.whyNow?.inactionNote?.trim() ?? "";
  if (!note) {
    steps.push({
      id: "value",
      title: "Coût d’inaction",
      botMessage:
        "Si le client **n’agit pas**, que perd-il concrètement ? (temps, CA, risque…)",
      placeholder: "Ex. 1 ETP perdu / an, retards, risque amende…",
    });
  }

  const challenge = findings.find(
    (f) => f.severity === "bloquant" || f.severity === "risque",
  );
  if (challenge) {
    steps.push({
      id: "challenge",
      title: `Challenge ${challenge.code}`,
      botMessage: `Constat **${challenge.code}** — ${challenge.fact}\n\n${challenge.question}`,
      placeholder: "Ta réponse concrète…",
      findingCode: challenge.code,
    });
  }

  return steps;
}
