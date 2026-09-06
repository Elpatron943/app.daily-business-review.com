import type { OnboardingAnswers, OnboardingDraft } from "./types";

export function buildOnboardingEnrichmentPrompt(answers: OnboardingAnswers): {
  system: string;
  user: string;
} {
  const system = `Tu es un expert en méthode DBR (Daily Business Review) B2B :
Pourquoi (problèmes / leviers projet), Pourquoi maintenant (urgences / compelling events / coût d’inaction), Pourquoi nous (offre, USP, concurrents).

À partir des réponses d’onboarding d’un vendeur, propose un paramétrage INITIAL concis et actionnable pour son CRM DBR.

Règles :
- Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de \`\`\`).
- Français professionnel, libellés courts (max ~80 caractères pour label).
- 3 à 8 items par liste (qualité > quantité).
- valueKind inaction : "productivity" | "revenue" | "avoided".
- polarity motivations : "advance" | "retreat".
- N’invente pas de chiffres précis ; reste générique mais métier.
- Si une info manque, propose quand même des items plausibles basés sur l’activité.

Schéma JSON exact :
{
  "orgName": string,
  "orgDescription": string,
  "summary": string,
  "usps": [{"label": string, "description": string}],
  "solutions": [{"name": string, "description": string}],
  "sectors": [{"label": string, "description": string}],
  "personae": [{"label": string, "description": string}],
  "competitors": [{"label": string, "description": string}],
  "compellingEvents": [{"label": string, "description": string}],
  "projectProblems": [{"familyLabel": string, "label": string, "description": string}],
  "projectLevers": [{"familyLabel": string, "label": string, "description": string}],
  "personalMotivations": [{"label": string, "description": string, "polarity": "advance"|"retreat"}],
  "inactionLevers": [{"label": string, "description": string, "valueKind": "productivity"|"revenue"|"avoided"}]
}`;

  const user = JSON.stringify(
    {
      instruction:
        "Génère le draft de paramétrage DBR à partir de ces réponses admin.",
      answers,
    },
    null,
    2,
  );

  return { system, user };
}

function asItems(
  raw: unknown,
): { label: string; description: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const label =
        typeof o.label === "string"
          ? o.label.trim()
          : typeof o.name === "string"
            ? o.name.trim()
            : "";
      if (!label) return null;
      return {
        label,
        description: typeof o.description === "string" ? o.description.trim() : "",
      };
    })
    .filter((x): x is { label: string; description: string } => Boolean(x));
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("JSON onboarding illisible");
  }
}

/** Parse la réponse IA + fallback heuristique depuis les réponses funnel. */
export function parseOnboardingDraft(
  content: string,
  answers: OnboardingAnswers,
): OnboardingDraft {
  let parsed: Record<string, unknown> = {};
  try {
    const raw = extractJsonObject(content);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      parsed = raw as Record<string, unknown>;
    }
  } catch {
    parsed = {};
  }

  const withSelected = <T extends { label: string; description: string }>(
    items: T[],
  ) => items.map((i) => ({ ...i, selected: true }));

  const solutionsRaw = Array.isArray(parsed.solutions)
    ? parsed.solutions
    : [];
  const solutions = solutionsRaw
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const name =
        typeof o.name === "string"
          ? o.name.trim()
          : typeof o.label === "string"
            ? o.label.trim()
            : "";
      if (!name) return null;
      return {
        name,
        label: name,
        description:
          typeof o.description === "string" ? o.description.trim() : "",
        selected: true as const,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const fallbackSolutions = splitLines(answers.productNames).map((line) => {
    const [name, ...rest] = line.split(/[—–\-:]/);
    return {
      name: (name || line).trim(),
      label: (name || line).trim(),
      description: rest.join("-").trim(),
      selected: true as const,
    };
  });

  const projectProblems = (
    Array.isArray(parsed.projectProblems) ? parsed.projectProblems : []
  )
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label.trim() : "";
      if (!label) return null;
      return {
        familyLabel:
          typeof o.familyLabel === "string" && o.familyLabel.trim()
            ? o.familyLabel.trim()
            : "Problèmes métier",
        label,
        description:
          typeof o.description === "string" ? o.description.trim() : "",
        selected: true as const,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const projectLevers = (
    Array.isArray(parsed.projectLevers) ? parsed.projectLevers : []
  )
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label.trim() : "";
      if (!label) return null;
      return {
        familyLabel:
          typeof o.familyLabel === "string" && o.familyLabel.trim()
            ? o.familyLabel.trim()
            : "Leviers projet",
        label,
        description:
          typeof o.description === "string" ? o.description.trim() : "",
        selected: true as const,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const personalMotivations = (
    Array.isArray(parsed.personalMotivations)
      ? parsed.personalMotivations
      : []
  )
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label.trim() : "";
      if (!label) return null;
      return {
        label,
        description:
          typeof o.description === "string" ? o.description.trim() : "",
        polarity:
          o.polarity === "retreat"
            ? ("retreat" as const)
            : ("advance" as const),
        selected: true as const,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const inactionLevers: OnboardingDraft["inactionLevers"] = (
    Array.isArray(parsed.inactionLevers) ? parsed.inactionLevers : []
  )
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label.trim() : "";
      if (!label) return null;
      const vk = o.valueKind;
      const valueKind: OnboardingDraft["inactionLevers"][number]["valueKind"] =
        vk === "revenue" || vk === "avoided" || vk === "productivity"
          ? vk
          : "productivity";
      return {
        label,
        description:
          typeof o.description === "string" ? o.description.trim() : "",
        valueKind,
        selected: true as const,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  return {
    orgName:
      (typeof parsed.orgName === "string" && parsed.orgName.trim()) ||
      answers.companyName.trim() ||
      "Mon entreprise",
    orgDescription:
      (typeof parsed.orgDescription === "string" &&
        parsed.orgDescription.trim()) ||
      answers.activity.trim(),
    summary:
      (typeof parsed.summary === "string" && parsed.summary.trim()) ||
      "Proposition générée à partir de vos réponses. Validez ou décochez avant d’appliquer.",
    usps: withSelected(
      asItems(parsed.usps).length
        ? asItems(parsed.usps)
        : splitLines(answers.differentiators).map((l) => ({
            label: l,
            description: "",
          })),
    ),
    solutions: solutions.length ? solutions : fallbackSolutions,
    sectors: withSelected(asItems(parsed.sectors)),
    personae: withSelected(asItems(parsed.personae)),
    competitors: withSelected(
      asItems(parsed.competitors).length
        ? asItems(parsed.competitors)
        : splitLines(answers.competitors).map((l) => ({
            label: l,
            description: "",
          })),
    ),
    compellingEvents: withSelected(
      asItems(parsed.compellingEvents).length
        ? asItems(parsed.compellingEvents)
        : splitLines(answers.urgencyTriggers).map((l) => ({
            label: l,
            description: "",
          })),
    ),
    projectProblems: projectProblems.length
      ? projectProblems
      : splitLines(answers.clientProblems).map((l) => ({
          familyLabel: "Problèmes métier",
          label: l,
          description: "",
          selected: true as const,
        })),
    projectLevers,
    personalMotivations,
    inactionLevers: inactionLevers.length
      ? inactionLevers
      : splitLines(answers.inactionCosts).map((l) => ({
          label: l,
          description: "",
          valueKind: "productivity" as const,
          selected: true as const,
        })),
  };
}

function splitLines(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && !/^non\.?$/i.test(s));
}

/** Draft minimal sans IA (réseau indisponible). */
export function buildHeuristicDraft(answers: OnboardingAnswers): OnboardingDraft {
  return parseOnboardingDraft("{}", answers);
}
