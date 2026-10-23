import { defaultConfig } from "../config/defaults";
import type { OrgConfig } from "../config/types";
import {
  EMPTY_ANSWERS,
  ONBOARDING_FUNNEL,
  type FunnelStepId,
  type OnboardingAnswers,
} from "./types";

const RECAP_LABEL: Record<FunnelStepId, string> = {
  companyName: "Entreprise",
  activity: "Activité",
  offerKind: "Type d’offre",
  productCount: "Nombre de piliers",
  productNames: "Produits / prestations",
  differentiators: "Arguments / USP",
  targetCustomers: "Clients types",
  competitors: "Concurrents",
  clientProblems: "Pourquoi un projet démarre",
  urgencyTriggers: "Pourquoi maintenant",
  inactionCosts: "Coût d’inaction",
  freeNotes: "Notes",
};

export type SavedSetupSection = {
  title: string;
  lines: string[];
};

function linesOf(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Garde uniquement les réponses du funnel, ou null si tout est vide. */
export function normalizeOnboardingAnswers(
  raw: unknown,
): OnboardingAnswers | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out: OnboardingAnswers = { ...EMPTY_ANSWERS };
  let any = false;
  for (const step of ONBOARDING_FUNNEL) {
    const value = src[step.id];
    if (typeof value !== "string") continue;
    out[step.id] = value;
    if (value.trim()) any = true;
  }
  return any ? out : null;
}

/** Réponses mot pour mot du dernier questionnaire validé. */
export function savedAnswerSections(
  answers: OnboardingAnswers | Record<string, string> | null | undefined,
): SavedSetupSection[] {
  const normalized = normalizeOnboardingAnswers(answers);
  if (!normalized) return [];
  return ONBOARDING_FUNNEL.flatMap((step) => {
    const lines = linesOf(normalized[step.id] ?? "");
    if (!lines.length) return [];
    return [{ title: RECAP_LABEL[step.id], lines }];
  });
}

function addedLabels<T extends { id: string; active: boolean }>(
  current: T[] | undefined,
  defaults: { id: string }[],
  labelOf: (item: T) => string,
): string[] {
  const defaultsIds = new Set(defaults.map((item) => item.id));
  return (current ?? [])
    .filter((item) => item.active && !defaultsIds.has(item.id))
    .map(labelOf)
    .map((label) => label.trim())
    .filter(Boolean);
}

/**
 * Ce qui a été écrit dans DBR et qui n’est pas le référentiel d’usine.
 * Sert quand les réponses brutes n’ont pas été conservées.
 */
export function savedConfigSections(
  config: OrgConfig,
  orgName = "",
): SavedSetupSection[] {
  const sections: SavedSetupSection[] = [];
  const profile = config.orgProfile;
  const identity = [
    profile?.name?.trim() || orgName.trim(),
    profile?.description?.trim() ?? "",
  ].filter(Boolean);
  if (identity.length) {
    sections.push({ title: "Entreprise", lines: identity });
  }

  const usps = (profile?.usps ?? [])
    .filter((item) => item.active)
    .map((item) => item.label.trim())
    .filter(Boolean);
  if (usps.length) sections.push({ title: "Arguments / USP", lines: usps });

  const solutions = (config.solutions ?? [])
    .filter((item) => item.active)
    .map((item) => {
      const name = item.name.trim();
      const description = item.description.trim();
      if (!name) return "";
      return description ? `${name} — ${description}` : name;
    })
    .filter(Boolean);
  if (solutions.length) {
    sections.push({ title: "Produits / prestations", lines: solutions });
  }

  const sectors = addedLabels(
    config.sectors,
    defaultConfig.sectors,
    (item) => item.name,
  );
  if (sectors.length) sections.push({ title: "Secteurs", lines: sectors });

  const personae = addedLabels(
    config.personae,
    defaultConfig.personae,
    (item) => item.name,
  );
  if (personae.length) sections.push({ title: "Personae", lines: personae });

  const competitors = (config.competitors ?? [])
    .filter((item) => item.active)
    .map((item) => item.name.trim())
    .filter(Boolean);
  if (competitors.length) {
    sections.push({ title: "Concurrents", lines: competitors });
  }

  const events = addedLabels(
    config.compellingEvents,
    defaultConfig.compellingEvents,
    (item) => item.label,
  );
  if (events.length) {
    sections.push({ title: "Pourquoi maintenant", lines: events });
  }

  const problemFamilies = new Map(
    (config.projectProblemFamilies ?? []).map((family) => [
      family.id,
      family.label,
    ]),
  );
  const problems = addedLabels(
    config.projectProblems,
    defaultConfig.projectProblems,
    (item) => {
      const family = problemFamilies.get(item.familyId);
      return family ? `${family} · ${item.label}` : item.label;
    },
  );
  if (problems.length) {
    sections.push({ title: "Pourquoi un projet démarre", lines: problems });
  }

  const leverFamilies = new Map(
    (config.projectLeverFamilies ?? []).map((family) => [
      family.id,
      family.label,
    ]),
  );
  const levers = addedLabels(
    config.projectLevers,
    defaultConfig.projectLevers,
    (item) => {
      const family = leverFamilies.get(item.familyId);
      return family ? `${family} · ${item.label}` : item.label;
    },
  );
  if (levers.length) sections.push({ title: "Leviers projet", lines: levers });

  const motivations = addedLabels(
    config.personalMotivations,
    defaultConfig.personalMotivations,
    (item) => item.label,
  );
  if (motivations.length) {
    sections.push({ title: "Motivations personnelles", lines: motivations });
  }

  const inaction = addedLabels(
    config.inactionLevers,
    defaultConfig.inactionLevers,
    (item) => item.label,
  );
  if (inaction.length) {
    sections.push({ title: "Coût d’inaction", lines: inaction });
  }

  return sections;
}
