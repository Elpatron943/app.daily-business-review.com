export type ResearchStatus = {
  configured: boolean;
  model?: string;
  available: boolean;
};

export type ResearchResult = {
  content: string;
  citations: { url: string; title?: string }[];
};

/** Statut du proxy Perplexity (scripts IA, etc.). */
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
