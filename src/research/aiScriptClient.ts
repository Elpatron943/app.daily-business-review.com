import {
  checkResearchStatus,
  type ResearchStatus,
} from "./perplexityClient";
import {
  buildAiScriptPrompt,
  type AiScriptFact,
  type AiScriptKind,
} from "./buildAiScriptContext";

export type { ResearchStatus };

export type AiScriptResult = {
  content: string;
  citations: { url: string; title?: string }[];
};

export async function checkAiScriptStatus(): Promise<ResearchStatus> {
  return checkResearchStatus();
}

export async function runAiScript(input: {
  kind: AiScriptKind;
  facts: AiScriptFact[];
  userContext: string;
  orgName?: string | null;
  expectedEmailCount?: number;
}): Promise<AiScriptResult> {
  const { system, prompt } = buildAiScriptPrompt(input);
  const res = await fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, prompt }),
  });
  const data = (await res.json()) as AiScriptResult & { error?: string };
  if (!res.ok) {
    throw new Error(
      data.error ||
        (res.status === 404
          ? "Génération temporairement indisponible. Réessaie plus tard."
          : `Erreur génération (${res.status})`),
    );
  }
  return {
    content: data.content || "",
    citations: data.citations ?? [],
  };
}
