import { defaultConfig } from "../config/defaults";
import type {
  InactionLeverDef,
  InactionValueKind,
  OrgConfig,
  OrgProfile,
  PersonaDef,
  PersonalMotivationDef,
  ProjectLeverDef,
  ProjectProblemDef,
  SectorDef,
  SolutionDef,
  UspDef,
} from "../config/types";
import type { OnboardingDraft } from "./types";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function solutionIdFromName(name: string) {
  const rawId = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9+\-_]/g, "");
  return rawId || uid("sol");
}

function findOrCreateFamilyId(
  families: { id: string; label: string; description: string; active: boolean; order: number }[],
  label: string,
  idPrefix: string,
): { families: typeof families; familyId: string } {
  const existing = families.find(
    (f) => f.active && f.label.trim().toLowerCase() === label.trim().toLowerCase(),
  );
  if (existing) return { families, familyId: existing.id };
  const id = uid(idPrefix);
  return {
    familyId: id,
    families: [
      ...families,
      {
        id,
        label: label.trim(),
        description: "",
        active: true,
        order: families.length + 1,
      },
    ],
  };
}

const INACTION_FAMILY: Record<
  InactionValueKind,
  { id: string; label: string; description: string }
> = {
  productivity: {
    id: "ilf-productivity",
    label: "Gain productivité",
    description: "Temps homme perdu — matérialisé en € via le coût ETP.",
  },
  revenue: {
    id: "ilf-gain",
    label: "Gain CA",
    description: "Chiffre d’affaires en plus (ou non réalisé) si on agit.",
  },
  avoided: {
    id: "ilf-avoided",
    label: "Coût évité",
    description: "Risques et pertes qu’on évite en agissant.",
  },
};

/**
 * Fusionne le draft validé dans la config org (un seul commit).
 * N’écrase pas les référentiels sales déjà présents : ajoute les éléments sélectionnés.
 */
export function mergeOnboardingDraft(
  current: OrgConfig,
  draft: OnboardingDraft,
): OrgConfig {
  const base = structuredClone(current);
  const profile: OrgProfile = {
    ...(base.orgProfile ?? defaultConfig.orgProfile),
    usps: [...(base.orgProfile?.usps ?? defaultConfig.orgProfile.usps ?? [])],
  };

  const usps: UspDef[] = [...(profile.usps ?? [])];
  for (const u of draft.usps.filter((x) => x.selected)) {
    if (
      usps.some(
        (x) => x.label.trim().toLowerCase() === u.label.trim().toLowerCase(),
      )
    ) {
      continue;
    }
    usps.push({
      id: uid("usp"),
      label: u.label.trim(),
      description: u.description.trim(),
      active: true,
      order: usps.length + 1,
    });
  }

  const solutions: SolutionDef[] = [...(base.solutions ?? [])];
  for (const s of draft.solutions.filter((x) => x.selected)) {
    const name = s.name.trim() || s.label.trim();
    if (!name) continue;
    if (
      solutions.some(
        (x) => x.name.trim().toLowerCase() === name.toLowerCase() && x.active,
      )
    ) {
      continue;
    }
    solutions.push({
      id: solutionIdFromName(name),
      name,
      description: s.description.trim(),
      active: true,
      order: solutions.length + 1,
      modules: [],
      featureGroups: [],
      features: [],
      competitors: [],
    });
  }

  const sectors: SectorDef[] = [...(base.sectors ?? [])];
  for (const s of draft.sectors.filter((x) => x.selected)) {
    if (
      sectors.some(
        (x) => x.name.trim().toLowerCase() === s.label.trim().toLowerCase(),
      )
    ) {
      continue;
    }
    sectors.push({
      id: uid("sec"),
      name: s.label.trim(),
      active: true,
      order: sectors.length + 1,
    });
  }

  const personae: PersonaDef[] = [...(base.personae ?? [])];
  for (const p of draft.personae.filter((x) => x.selected)) {
    if (
      personae.some(
        (x) => x.name.trim().toLowerCase() === p.label.trim().toLowerCase(),
      )
    ) {
      continue;
    }
    personae.push({
      id: uid("persona"),
      name: p.label.trim(),
      active: true,
      order: personae.length + 1,
    });
  }

  const competitors = [...(base.competitors ?? [])];
  for (const c of draft.competitors.filter((x) => x.selected)) {
    if (
      competitors.some(
        (x) => x.name.trim().toLowerCase() === c.label.trim().toLowerCase(),
      )
    ) {
      continue;
    }
    competitors.push({
      id: uid("comp"),
      name: c.label.trim(),
      description: c.description.trim(),
      active: true,
      order: competitors.length + 1,
      features: [],
    });
  }

  const compellingEvents = [...(base.compellingEvents ?? [])];
  for (const e of draft.compellingEvents.filter((x) => x.selected)) {
    if (
      compellingEvents.some(
        (x) => x.label.trim().toLowerCase() === e.label.trim().toLowerCase(),
      )
    ) {
      continue;
    }
    compellingEvents.push({
      id: uid("ce"),
      label: e.label.trim(),
      description: e.description.trim(),
      active: true,
      order: compellingEvents.length + 1,
    });
  }

  let projectProblemFamilies = [...(base.projectProblemFamilies ?? [])];
  let projectProblems: ProjectProblemDef[] = [...(base.projectProblems ?? [])];
  for (const p of draft.projectProblems.filter((x) => x.selected)) {
    const { families, familyId } = findOrCreateFamilyId(
      projectProblemFamilies,
      p.familyLabel || "Problèmes métier",
      "ppf",
    );
    projectProblemFamilies = families;
    if (
      projectProblems.some(
        (x) =>
          x.active &&
          x.familyId === familyId &&
          x.label.trim().toLowerCase() === p.label.trim().toLowerCase(),
      )
    ) {
      continue;
    }
    const inFamily = projectProblems.filter((x) => x.familyId === familyId);
    projectProblems.push({
      id: uid("pp"),
      familyId,
      label: p.label.trim(),
      description: p.description.trim(),
      active: true,
      order: inFamily.length + 1,
    });
  }

  let projectLeverFamilies = [...(base.projectLeverFamilies ?? [])];
  let projectLevers: ProjectLeverDef[] = [...(base.projectLevers ?? [])];
  for (const p of draft.projectLevers.filter((x) => x.selected)) {
    const { families, familyId } = findOrCreateFamilyId(
      projectLeverFamilies,
      p.familyLabel || "Leviers projet",
      "plf",
    );
    projectLeverFamilies = families;
    if (
      projectLevers.some(
        (x) =>
          x.active &&
          x.familyId === familyId &&
          x.label.trim().toLowerCase() === p.label.trim().toLowerCase(),
      )
    ) {
      continue;
    }
    const inFamily = projectLevers.filter((x) => x.familyId === familyId);
    projectLevers.push({
      id: uid("pl"),
      familyId,
      label: p.label.trim(),
      description: p.description.trim(),
      active: true,
      order: inFamily.length + 1,
    });
  }

  const personalMotivations: PersonalMotivationDef[] = [
    ...(base.personalMotivations ?? []),
  ];
  for (const m of draft.personalMotivations.filter((x) => x.selected)) {
    if (
      personalMotivations.some(
        (x) => x.label.trim().toLowerCase() === m.label.trim().toLowerCase(),
      )
    ) {
      continue;
    }
    personalMotivations.push({
      id: uid("pm"),
      label: m.label.trim(),
      description: m.description.trim(),
      polarity: m.polarity,
      active: true,
      order: personalMotivations.length + 1,
    });
  }

  let inactionLeverFamilies = [...(base.inactionLeverFamilies ?? [])];
  let inactionLevers: InactionLeverDef[] = [...(base.inactionLevers ?? [])];
  for (const lever of draft.inactionLevers.filter((x) => x.selected)) {
    const meta = INACTION_FAMILY[lever.valueKind];
    if (!inactionLeverFamilies.some((f) => f.id === meta.id)) {
      inactionLeverFamilies = [
        ...inactionLeverFamilies,
        {
          id: meta.id,
          label: meta.label,
          description: meta.description,
          active: true,
          order: inactionLeverFamilies.length + 1,
        },
      ];
    } else {
      inactionLeverFamilies = inactionLeverFamilies.map((f) =>
        f.id === meta.id ? { ...f, active: true } : f,
      );
    }
    if (
      inactionLevers.some(
        (x) =>
          x.active &&
          x.familyId === meta.id &&
          x.label.trim().toLowerCase() === lever.label.trim().toLowerCase(),
      )
    ) {
      continue;
    }
    const inFamily = inactionLevers.filter((x) => x.familyId === meta.id);
    inactionLevers.push({
      id: uid("il"),
      familyId: meta.id,
      label: lever.label.trim(),
      description: lever.description.trim(),
      valueKind: lever.valueKind,
      formula: null,
      active: true,
      order: inFamily.length + 1,
    });
  }

  return {
    ...base,
    orgProfile: {
      ...profile,
      name: draft.orgName.trim() || profile.name,
      description: draft.orgDescription.trim() || profile.description,
      usps,
    },
    solutions,
    sectors,
    personae,
    competitors,
    compellingEvents,
    projectProblemFamilies,
    projectProblems,
    projectLeverFamilies,
    projectLevers,
    personalMotivations,
    inactionLeverFamilies,
    inactionLevers,
  };
}
