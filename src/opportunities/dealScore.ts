/**
 * Score deal global = croisement Process × Opportunity Mapping.
 * Moyenne géométrique : les deux axes doivent progresser (un axe à 0 → score bas).
 */
export function computeDealScore(
  processPct: number,
  mappingPct: number | null | undefined,
): number {
  const p = Math.max(0, Math.min(100, Number(processPct) || 0));
  const m = Math.max(
    0,
    Math.min(100, mappingPct == null ? 0 : Number(mappingPct) || 0),
  );
  return Math.round(Math.sqrt(p * m));
}

export function dealScoreTone(
  score: number,
  highTh = 70,
  lowTh = 35,
): "ok" | "mid" | "risk" {
  if (score >= highTh) return "ok";
  if (score >= lowTh) return "mid";
  return "risk";
}
