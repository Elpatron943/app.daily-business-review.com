import {
  buildOpportunityAnalysisPrompt,
  parseEnsembleDealReview,
  type OpportunityAnalysisInput,
} from "./buildOpportunityAnalysisPrompt";
import {
  buildActionPlanPrompt,
  parseGeneratedActions,
  type ActionPlanGenerationInput,
  type GeneratedPlanActionDraft,
} from "./buildActionPlanPrompt";
import {
  buildOnboardingEnrichmentPrompt,
  parseOnboardingDraft,
} from "../onboarding/buildOnboardingEnrichmentPrompt";
import type {
  OnboardingAnswers,
  OnboardingDraft,
} from "../onboarding/types";

export type OpenAiStatus = {
  available: boolean;
  configured: boolean;
  model?: string;
};

export type OpportunityAnalysisResult = {
  updatedAt: string;
  content: string;
  model: string;
  verdict?: "Go" | "Watch" | "No-go";
  confidence?: "high" | "medium" | "low";
  proposedActions: GeneratedPlanActionDraft[];
};

export type ActionPlanGenerationResult = {
  updatedAt: string;
  actions: GeneratedPlanActionDraft[];
  model: string;
  raw: string;
};

export type OnboardingEnrichmentResult = {
  draft: OnboardingDraft;
  model: string;
  raw: string;
};

export async function checkOpenAiStatus(): Promise<OpenAiStatus> {
  try {
    const res = await fetch("/api/openai/status");
    if (!res.ok) return { available: false, configured: false };
    return (await res.json()) as OpenAiStatus;
  } catch {
    return { available: false, configured: false };
  }
}

async function postOpenAiAnalyze(
  system: string,
  user: string,
): Promise<{ content: string; model: string }> {
  const res = await fetch("/api/openai/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, user }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    content?: string;
    model?: string;
  };

  if (!res.ok) {
    throw new Error(
      data.error ||
        (res.status === 404
          ? "Analyse IA temporairement indisponible. Réessaie plus tard."
          : `Analyse IA indisponible (${res.status})`),
    );
  }

  if (!data.content?.trim()) {
    throw new Error("Réponse IA vide");
  }

  return {
    content: data.content.trim(),
    model: data.model || "gpt-4o",
  };
}

/** Analyse d’ensemble + actions complémentaires proposées. */
export async function runOpportunityAnalysis(
  input: OpportunityAnalysisInput,
): Promise<OpportunityAnalysisResult> {
  const { system, user } = buildOpportunityAnalysisPrompt(input);
  const { content, model } = await postOpenAiAnalyze(system, user);
  const parsed = parseEnsembleDealReview(content);
  return {
    updatedAt: new Date().toISOString(),
    content: parsed.analysisMarkdown,
    model,
    verdict: parsed.verdict,
    confidence: parsed.confidence,
    proposedActions: parsed.actions,
  };
}

export async function runActionPlanGeneration(
  input: ActionPlanGenerationInput,
): Promise<ActionPlanGenerationResult> {
  const { system, user } = buildActionPlanPrompt(input);
  const { content, model } = await postOpenAiAnalyze(system, user);
  const actions = parseGeneratedActions(content);
  return {
    updatedAt: new Date().toISOString(),
    actions,
    model,
    raw: content,
  };
}

/** Enrichit les réponses funnel onboarding → draft Settings à valider. */
export async function runOnboardingEnrichment(
  answers: OnboardingAnswers,
): Promise<OnboardingEnrichmentResult> {
  const { system, user } = buildOnboardingEnrichmentPrompt(answers);
  const { content, model } = await postOpenAiAnalyze(system, user);
  return {
    draft: parseOnboardingDraft(content, answers),
    model,
    raw: content,
  };
}

export type { GeneratedPlanActionDraft };
