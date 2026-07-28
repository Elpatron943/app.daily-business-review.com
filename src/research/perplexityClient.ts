import type { Account, AccountResearchBrief } from "../data";
import type {
  CompellingEventDef,
  ContactTypeDef,
  OrgProfile,
  ResearchCriterionDef,
} from "../config/types";
import type { Opportunity } from "../opportunities/OpportunityContext";
import { buildResearchPrompt } from "./buildResearchPrompt";
import { parseBriefMeta } from "./parseBriefMeta";

export type ResearchStatus = {
  configured: boolean;
  model?: string;
  available: boolean;
};

export type ResearchResult = {
  content: string;
  citations: { url: string; title?: string }[];
};

export async function checkResearchStatus(): Promise<ResearchStatus> {
  try {
    const res = await fetch("/api/research/status");
    if (!res.ok) {
      return { configured: false, available: false };
    }
    const data = (await res.json()) as {
      configured?: boolean;
      model?: string;
    };
    return {
      configured: Boolean(data.configured),
      model: data.model,
      available: true,
    };
  } catch {
    return { configured: false, available: false };
  }
}

export async function runTargetResearch(input: {
  account: Account;
  criteria: ResearchCriterionDef[];
  compellingEvents?: CompellingEventDef[];
  contactTypes?: ContactTypeDef[];
  orgProfile?: OrgProfile | null;
  opportunity?: Opportunity | null;
  holdingName?: string | null;
}): Promise<AccountResearchBrief> {
  if (!input.criteria.length) {
    throw new Error("Sélectionne au moins un critère de recherche.");
  }

  const { system, prompt, querySummary, searchAfterDate } =
    buildResearchPrompt(input);

  const res = await fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, prompt, searchAfterDate }),
  });

  const data = (await res.json()) as ResearchResult & { error?: string };
  if (!res.ok) {
    throw new Error(
      data.error ||
        (res.status === 404
          ? "Recherche cible temporairement indisponible. Réessaie plus tard."
          : `Erreur recherche (${res.status})`),
    );
  }

  const meta = parseBriefMeta(data.content || "");

  return {
    updatedAt: new Date().toISOString().slice(0, 10),
    querySummary,
    content: meta.content,
    citations: data.citations ?? [],
    criteriaIds: input.criteria.map((c) => c.id),
    relevanceScore: meta.relevanceScore,
    positivePress: meta.positivePress,
    negativePress: meta.negativePress,
    matchedCompellingEventIds: meta.matchedCompellingEventIds,
    suggestedPersonas: meta.suggestedPersonas,
  };
}
