import type { OrgConfig } from "../config/types";
import type { SettingsAreaId } from "./settingsNav";

export type DeployTargetTab = SettingsAreaId | "team";

export type DeployPhaseId = "identite" | "vente" | "lancer";

export const DEPLOY_PHASE_LABEL: Record<DeployPhaseId, string> = {
  identite: "1. Identité & référentiels",
  vente: "2. Façon de vendre",
  lancer: "3. Données & équipe",
};

export type DeployStepDef = {
  id: string;
  phase: DeployPhaseId;
  tab: DeployTargetTab;
  title: string;
  why: string;
  required: boolean;
};

export type DeployEvalContext = {
  config: OrgConfig;
  accountCount: number;
  teamCount: number;
  hubspotConnected: boolean | null;
};

export type DeployStepStatus = {
  id: string;
  done: boolean;
  summary: string;
};

/** Parcours court — 7 étapes max. */
export const DEPLOY_STEPS: DeployStepDef[] = [
  {
    id: "positioning",
    phase: "identite",
    tab: "org-positioning",
    title: "Qui vous êtes",
    why: "Nom org + Unique Selling Points — base IA et discours.",
    required: true,
  },
  {
    id: "account-refs",
    phase: "identite",
    tab: "entreprises",
    title: "Référentiels comptes",
    why: "Secteurs, statuts, tailles + personae (Qui vous êtes) — Settings.",
    required: true,
  },
  {
    id: "catalogue",
    phase: "identite",
    tab: "entreprises",
    title: "Catalogue solutions",
    why: "Au moins une solution avec un module — Settings → Entreprises.",
    required: true,
  },
  {
    id: "contact-types",
    phase: "identite",
    tab: "contacts",
    title: "Types de contacts",
    why: "Rôles d’influence (carte + fiches) — Settings → Contacts.",
    required: true,
  },
  {
    id: "deal-qual",
    phase: "vente",
    tab: "opportunites",
    title: "Qualifier les deals",
    why: "Phases, process, cartes mapping et business outcomes — Settings → Opportunités.",
    required: true,
  },
  {
    id: "data",
    phase: "lancer",
    tab: "org-data",
    title: "Charger les données",
    why: "Import Excel ou CRM — Settings → Données.",
    required: true,
  },
  {
    id: "team",
    phase: "lancer",
    tab: "org-team",
    title: "Équipe",
    why: "Inviter au moins un collègue et assigner les owners.",
    required: true,
  },
];

const REVIEW_KEY = "powermap.deploy.reviewed.v2";

export function loadReviewedSteps(): Set<string> {
  try {
    const raw = localStorage.getItem(REVIEW_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function saveReviewedSteps(ids: Set<string>) {
  localStorage.setItem(REVIEW_KEY, JSON.stringify([...ids]));
}

function countActive<T extends { active?: boolean }>(list: T[] | undefined) {
  return (list ?? []).filter((x) => x.active !== false).length;
}

export function evaluateDeployStep(
  step: DeployStepDef,
  ctx: DeployEvalContext,
): DeployStepStatus {
  const { config, accountCount, teamCount, hubspotConnected } = ctx;

  switch (step.id) {
    case "positioning": {
      const name = config.orgProfile?.name?.trim() ?? "";
      const usps = countActive(config.orgProfile?.usps);
      const done = name.length >= 2 && usps >= 1;
      return {
        id: step.id,
        done,
        summary: done
          ? `${name} · ${usps} USP`
          : "Nom org + au moins 1 Unique Selling Point",
      };
    }
    case "account-refs": {
      const personae = countActive(config.personae);
      const sectors = countActive(config.sectors);
      const statuses = countActive(config.commercialStatuses);
      const sizes = countActive(config.accountSizes);
      const done =
        personae >= 1 && sectors >= 1 && statuses >= 1 && sizes >= 1;
      return {
        id: step.id,
        done,
        summary: done
          ? `${personae} persona(s) · ${sectors} secteurs · ${statuses} statuts · ${sizes} tailles`
          : "Secteurs, personae, statuts et tailles",
      };
    }
    case "catalogue": {
      const sols = (config.solutions ?? []).filter((s) => s.active !== false);
      const withMod = sols.filter((s) =>
        (s.modules ?? []).some((m) => m.active !== false),
      ).length;
      const done = sols.length >= 1 && withMod >= 1;
      return {
        id: step.id,
        done,
        summary: done
          ? `${sols.length} solution(s) · ${withMod} avec modules`
          : "≥1 solution avec ≥1 module",
      };
    }
    case "contact-types": {
      const n = countActive(config.contactTypes);
      return {
        id: step.id,
        done: n >= 2,
        summary:
          n >= 2 ? `${n} types` : "Au moins 2 types (ex. Economic Buyer)",
      };
    }
    case "deal-qual": {
      const phases = countActive(config.oppPhases);
      const kinds = countActive(config.oppKinds);
      const domains = (config.processDomains ?? []).filter(
        (d) => d.active !== false,
      );
      const questions = domains.reduce(
        (acc, d) =>
          acc + (d.questions ?? []).filter((x) => x.active !== false).length,
        0,
      );
      const mapping = countActive(config.oppMappingSubtypes);
      const outcomes = countActive(config.boFields);
      const done =
        phases >= 1 &&
        kinds >= 1 &&
        domains.length >= 1 &&
        questions >= 3 &&
        mapping >= 1 &&
        outcomes >= 1;
      return {
        id: step.id,
        done,
        summary: done
          ? `${phases} phases · ${domains.length} process · ${mapping} cartes · ${outcomes} BO`
          : "Phases, process (≥3 questions), mapping et outcomes",
      };
    }
    case "data": {
      if (accountCount >= 1) {
        return {
          id: step.id,
          done: true,
          summary: `${accountCount} compte(s) en base`,
        };
      }
      if (hubspotConnected === true) {
        return { id: step.id, done: true, summary: "HubSpot connecté" };
      }
      return {
        id: step.id,
        done: false,
        summary: "Importer Excel ou connecter le CRM",
      };
    }
    case "team": {
      const done = teamCount >= 2;
      return {
        id: step.id,
        done,
        summary: done
          ? `${teamCount} membres`
          : "Inviter au moins 1 collègue",
      };
    }
    default:
      return { id: step.id, done: false, summary: "" };
  }
}

export function evaluateDeployment(
  ctx: DeployEvalContext,
  reviewed: Set<string>,
) {
  const statuses = DEPLOY_STEPS.map((step) => {
    const ev = evaluateDeployStep(step, ctx);
    const effectivelyDone =
      ev.done || (!step.required && reviewed.has(step.id));
    return {
      step,
      ...ev,
      effectivelyDone,
      reviewed: reviewed.has(step.id),
    };
  });

  const required = statuses.filter((s) => s.step.required);
  const requiredDone = required.filter((s) => s.effectivelyDone).length;
  const optional = statuses.filter((s) => !s.step.required);
  const optionalDone = optional.filter((s) => s.effectivelyDone).length;
  const next = statuses.find((s) => !s.effectivelyDone) ?? null;

  return {
    statuses,
    requiredDone,
    requiredTotal: required.length,
    optionalDone,
    optionalTotal: optional.length,
    next,
    complete: requiredDone === required.length,
  };
}
