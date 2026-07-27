import type { ResearchPressItem, ResearchSuggestedPersona } from "../data";

export type ParsedBriefMeta = {
  relevanceScore: number | null;
  positivePress: ResearchPressItem[];
  negativePress: ResearchPressItem[];
  matchedCompellingEventIds: string[];
  suggestedPersonas: ResearchSuggestedPersona[];
  /** Contenu Markdown sans le bloc JSON final. */
  content: string;
};

function clampScore(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function normalizePress(
  raw: unknown,
  sentiment: "positive" | "negative",
): ResearchPressItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ResearchPressItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = String(o.title ?? "").trim();
    const summary = String(o.summary ?? "").trim();
    if (!title && !summary) continue;
    const row: ResearchPressItem = {
      title: title || "Sans titre",
      summary,
      sentiment,
      relevance: clampScore(o.relevance),
    };
    if (o.url) row.url = String(o.url);
    if (o.date) row.date = String(o.date);
    out.push(row);
  }
  return out;
}

function normalizePersonas(raw: unknown): ResearchSuggestedPersona[] {
  if (!Array.isArray(raw)) return [];
  const out: ResearchSuggestedPersona[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    const title = String(o.title ?? "").trim();
    if (!name) continue;
    const key = `${name.toLowerCase()}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const persona: ResearchSuggestedPersona = {
      name,
      title: title || "Sans titre",
    };
    if (o.suggestedRoleId) persona.suggestedRoleId = String(o.suggestedRoleId);
    if (o.suggestedRoleLabel)
      persona.suggestedRoleLabel = String(o.suggestedRoleLabel);
    if (o.directionHint) persona.directionHint = String(o.directionHint);
    if (o.whyRelevant) persona.whyRelevant = String(o.whyRelevant);
    if (o.sourceHint) persona.sourceHint = String(o.sourceHint);
    if (o.confidence != null) persona.confidence = clampScore(o.confidence);
    out.push(persona);
  }
  return out.slice(0, 12);
}

/** Extrait le bloc ```json ... ``` final et le parse. */
export function parseBriefMeta(rawContent: string): ParsedBriefMeta {
  const text = rawContent || "";
  const fence = /```json\s*([\s\S]*?)```/i;
  const match = fence.exec(text);
  let metaRaw = match?.[1]?.trim() ?? "";
  let content = text;

  if (match) {
    content = (
      text.slice(0, match.index) + text.slice(match.index + match[0].length)
    ).trim();
  } else {
    const lastBrace = text.lastIndexOf("\n{");
    if (lastBrace >= 0) {
      metaRaw = text.slice(lastBrace).trim();
      content = text.slice(0, lastBrace).trim();
    }
  }

  let relevanceScore: number | null = null;
  let positivePress: ResearchPressItem[] = [];
  let negativePress: ResearchPressItem[] = [];
  let matchedCompellingEventIds: string[] = [];
  let suggestedPersonas: ResearchSuggestedPersona[] = [];

  if (metaRaw) {
    try {
      const parsed = JSON.parse(metaRaw) as Record<string, unknown>;
      if (parsed.relevanceScore != null) {
        relevanceScore = clampScore(parsed.relevanceScore);
      }
      positivePress = normalizePress(parsed.positivePress, "positive");
      negativePress = normalizePress(parsed.negativePress, "negative");
      if (Array.isArray(parsed.matchedCompellingEventIds)) {
        matchedCompellingEventIds = parsed.matchedCompellingEventIds
          .map(String)
          .filter(Boolean);
      }
      suggestedPersonas = normalizePersonas(
        parsed.suggestedPersonas ?? parsed.personas,
      );
    } catch {
      content = text.trim();
    }
  }

  return {
    relevanceScore,
    positivePress,
    negativePress,
    matchedCompellingEventIds,
    suggestedPersonas,
    content,
  };
}
