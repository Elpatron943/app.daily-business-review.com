import type { Account, Contact } from "../data";
import { engagementLabel, formatEur } from "../data";
import type { OrgConfig } from "../config/types";
import { buildCompetitiveIntelSnapshot } from "../config/competitiveIntel";
import type { Opportunity } from "../opportunities/OpportunityContext";
import { computeProcessProgress } from "../opportunities/salesProcess";
import {
  computeMappingScorecard,
  mappingWeightsFromSubtypes,
} from "../opportunities/mappingScore";
import { summarizeCatalogue } from "../catalogue/formatCatalogue";

export type AiScriptKind = "phone" | "email";

/** Une donnée proposée pour le script — retirables une par une. */
export type AiScriptFact = {
  id: string;
  group: string;
  label: string;
  value: string;
};

type ContactTypeLite = { id: string; label: string };
type PersonaLite = { id: string; name: string };

function roleLabel(types: ContactTypeLite[], role: string) {
  return types.find((t) => t.id === role)?.label ?? role;
}

function personaLabel(personae: PersonaLite[], id: string) {
  return personae.find((d) => d.id === id)?.name ?? id;
}

/**
 * Construit la liste des faits CRM / deal proposés pour un script
 * téléphonique ou e-mail.
 */
export function buildAiScriptFacts(input: {
  config: OrgConfig;
  opportunity: Opportunity;
  account: Account | null;
  holdingName: string | null;
  contacts: Contact[];
  contactTypes: ContactTypeLite[];
  personae: PersonaLite[];
  targetContactId: string | null;
  kindLabel: (kind: string) => string;
  phaseLabel: (phase: string) => string;
}): AiScriptFact[] {
  const {
    config,
    opportunity,
    account,
    holdingName,
    contacts,
    contactTypes,
    personae,
    targetContactId,
    kindLabel,
    phaseLabel,
  } = input;
  const facts: AiScriptFact[] = [];
  const push = (
    id: string,
    group: string,
    label: string,
    value: string | null | undefined,
  ) => {
    const v = (value ?? "").trim();
    if (!v) return;
    facts.push({ id, group, label, value: v });
  };

  push("deal.name", "Opportunité", "Nom du deal", opportunity.name);
  push(
    "deal.amount",
    "Opportunité",
    "Montant",
    formatEur(opportunity.amount),
  );
  push("deal.phase", "Opportunité", "Phase", phaseLabel(opportunity.phase));
  push("deal.kind", "Opportunité", "Type", kindLabel(opportunity.kind));
  push("deal.close", "Opportunité", "Close date", opportunity.closeDate);

  if (account) {
    push("account.name", "Compte", "Entreprise", account.name);
    push("account.sector", "Compte", "Secteur", account.sector);
    push(
      "account.status",
      "Compte",
      "Statut commercial",
      account.commercialStatus,
    );
  }
  push("account.holding", "Compte", "Groupe / holding", holdingName);

  const catalog = summarizeCatalogue(opportunity, config.solutions);
  push("catalog.solution", "Catalogue", "Solution", catalog.solutionName);
  if (catalog.moduleLabels.length) {
    push(
      "catalog.modules",
      "Catalogue",
      "Modules",
      catalog.moduleLabels.join(", "),
    );
  }

  const target = targetContactId
    ? contacts.find((c) => c.id === targetContactId)
    : null;
  if (target) {
    push("target.name", "Interlocuteur", "Nom", target.name);
    push("target.title", "Interlocuteur", "Titre", target.title);
    push("target.email", "Interlocuteur", "E-mail", target.email);
    push("target.phone", "Interlocuteur", "Téléphone", target.phone);
    push(
      "target.persona",
      "Interlocuteur",
      "Persona",
      personaLabel(personae, target.personaId),
    );
  }

  const stake = opportunity.stakeholders ?? [];
  stake.forEach((s, i) => {
    const c = contacts.find((x) => x.id === s.contactId);
    if (!c || c.active === false) return;
    const parts = [
      c.name,
      c.title ? `(${c.title})` : "",
      s.role ? roleLabel(contactTypes, s.role) : "",
      engagementLabel[s.status] ?? s.status,
      c.email ? `email: ${c.email}` : "",
      c.phone ? `tél: ${c.phone}` : "",
      s.notes ? `note: ${s.notes}` : "",
    ].filter(Boolean);
    push(
      `stake.${s.contactId || i}`,
      "Stakeholders",
      c.name,
      parts.join(" · "),
    );
  });

  const ceLabels = (opportunity.compellingEventIds ?? [])
    .map((id) => config.compellingEvents?.find((c) => c.id === id)?.label)
    .filter((x): x is string => Boolean(x));
  if (ceLabels.length) {
    push(
      "deal.ce",
      "Opportunité",
      "Compelling events",
      ceLabels.join(", "),
    );
  }

  const personaNames = (opportunity.personaIds ?? [])
    .map((id) => personaLabel(personae, id))
    .filter(Boolean);
  if (personaNames.length) {
    push("deal.personae", "Opportunité", "Personae ciblées", personaNames.join(", "));
  }

  const proc = computeProcessProgress(
    config.processDomains,
    opportunity.processAnswers,
  );
  push(
    "process.pct",
    "Process",
    "Avancement process",
    `${proc.overallPct} %`,
  );
  for (const d of proc.domains) {
    const domain = config.processDomains.find((x) => x.id === d.domainId);
    if (!domain) continue;
    for (const q of domain.questions ?? []) {
      if (!q.active) continue;
      const ans = opportunity.processAnswers?.[q.id];
      const st = ans?.status ?? "None";
      if (st === "Yes") continue;
      push(
        `process.${q.id}`,
        "Process — écarts",
        `${domain.label} · ${q.label}`,
        ans?.note ? `${st} — ${ans.note}` : st,
      );
    }
  }

  const weights = mappingWeightsFromSubtypes(config.oppMappingSubtypes ?? []);
  const mapScore = computeMappingScorecard(opportunity.mappingChecks, weights);
  if (mapScore.total > 0) {
    push(
      "mapping.score",
      "Opportunity Mapping",
      "Score mapping",
      String(mapScore.total),
    );
  }

  const intel = buildCompetitiveIntelSnapshot(config, opportunity);
  if (intel.vendor.name) {
    push("vendor.name", "Notre offre", "Éditeur / vendor", intel.vendor.name);
  }
  if (intel.vendor.description) {
    push(
      "vendor.pitch",
      "Notre offre",
      "Positionnement",
      intel.vendor.description,
    );
  }
  for (const u of intel.vendor.usps.slice(0, 5)) {
    push(
      `vendor.usp.${u.id}`,
      "Notre offre — USP",
      u.label,
      u.description || u.label,
    );
  }

  const recos = opportunity.aiRecommendations?.content?.trim();
  if (recos) {
    push(
      "recos.ai",
      "Recos IA",
      "Dernières recommandations (extrait)",
      recos.slice(0, 1000) + (recos.length > 1000 ? "…" : ""),
    );
  }

  return facts;
}

export function buildAiScriptPrompt(input: {
  kind: AiScriptKind;
  facts: AiScriptFact[];
  userContext: string;
  orgName?: string | null;
  expectedEmailCount?: number;
}): { system: string; prompt: string } {
  const isPhone = input.kind === "phone";
  const system = isPhone
    ? `Tu es un coach sales B2B enterprise. Tu rédiges un script d’appel téléphonique en français, concret et utilisable immédiatement.
Structure attendue en Markdown :
## Objectif de l’appel
## Ouverture (30 s)
## Découverte (questions)
## Pitch adapté
## Gestion des objections
## Closing / next step
## Points de vigilance
Règles : ne invente pas de faits absents du contexte ; si une info manque, propose une question de découverte. Ton professionnel, naturel, pas corporate creux.`
    : `Tu es un rédacteur sales B2B enterprise. Tu rédiges une sequence d'e-mails de prospection / follow-up en francais, prete a envoyer.
Structure attendue en Markdown :
## Nombre d'e-mails
## E-mail 1
## E-mail 2
## E-mail 3
## CTA / next step
## Notes pour l'AE (ton, timing)
Règles : ne invente pas de faits absents du contexte ; personnalise avec les données fournies ; pas de formules génériques vides.`;

  const factsBlock =
    input.facts.length === 0
      ? "(Aucun fait CRM sélectionné — appuie-toi uniquement sur le contexte libre.)"
      : input.facts
          .map((f) => `- [${f.group}] ${f.label} : ${f.value}`)
          .join("\n");

  const ctx = input.userContext.trim();
  const prompt = [
    input.orgName
      ? `Vendor / notre entreprise : ${input.orgName}`
      : null,
    `Type de script : ${isPhone ? "appel téléphonique" : "séquence e-mail"}`,
    !isPhone
      ? `Nombre d'e-mails attendus : ${Math.max(1, Math.min(20, input.expectedEmailCount ?? 3))}`
      : null,
    "",
    "## Données à prendre en compte",
    factsBlock,
    "",
    "## Contexte libre de l’utilisateur",
    ctx || "(aucun)",
    "",
    "Génère le script demandé.",
  ]
    .filter((x) => x != null)
    .join("\n");

  return { system, prompt };
}
