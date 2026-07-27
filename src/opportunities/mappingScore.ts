import {
  OPP_MAPPING_CATEGORIES,
  OPP_MAPPING_SWOT_ORDER,
  type OppMappingCategory,
  type OppMappingChecks,
  type OppMappingSubtypeDef,
} from "../config/types";

const CAT_BY_ID = Object.fromEntries(
  OPP_MAPPING_CATEGORIES.map((c) => [c.id, c]),
) as Record<OppMappingCategory, (typeof OPP_MAPPING_CATEGORIES)[number]>;

export type MappingQuadScore = {
  catId: OppMappingCategory;
  swot: "S" | "W" | "O" | "T";
  label: string;
  subtitle: string;
  total: number;
  covered: number;
  notMastered: number;
  open: number;
  /** % maîtrise pondéré parmi les cartes décidées (✓ + ✗), null si aucune. */
  masteryPct: number | null;
};

export type MappingScorecard = {
  quads: MappingQuadScore[];
  total: number;
  covered: number;
  notMastered: number;
  open: number;
  masteryPct: number | null;
};

export type MappingCardWeights = {
  bonus: number;
  malus: number;
};

export type MappingWeightLookup = Record<string, MappingCardWeights>;

function clampWeight(raw: unknown, fallback = 1): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(10, Math.round(n * 100) / 100);
}

/** Construit la table bonus/malus depuis la bibliothèque org. */
export function mappingWeightsFromSubtypes(
  subtypes: Pick<OppMappingSubtypeDef, "id" | "bonus" | "malus">[],
): MappingWeightLookup {
  const map: MappingWeightLookup = {};
  for (const s of subtypes) {
    map[s.id] = {
      bonus: clampWeight(s.bonus, 1),
      malus: clampWeight(s.malus, 1),
    };
  }
  return map;
}

function weightsFor(
  cardId: string,
  lookup: MappingWeightLookup | undefined,
): MappingCardWeights {
  return lookup?.[cardId] ?? { bonus: 1, malus: 1 };
}

/**
 * Score Opportunity Mapping.
 * Sans pondération : ratio cartes ✓ / (✓ + ✗).
 * Avec pondération : Σ bonus(✓) / (Σ bonus(✓) + Σ malus(✗)).
 */
export function computeMappingScorecard(
  checks: OppMappingChecks | undefined,
  weights?: MappingWeightLookup,
): MappingScorecard {
  const source = checks ?? {};
  const quads = OPP_MAPPING_SWOT_ORDER.map((catId) => {
    const entries = source[catId] ?? [];
    const covered = entries.filter((e) => e.status === "covered").length;
    const notMastered = entries.filter(
      (e) => e.status === "not_mastered",
    ).length;
    const open = entries.filter((e) => e.status === "open").length;
    const total = entries.length;

    let coveredW = 0;
    let notMasteredW = 0;
    for (const e of entries) {
      const w = weightsFor(e.id, weights);
      if (e.status === "covered") coveredW += w.bonus;
      else if (e.status === "not_mastered") notMasteredW += w.malus;
    }
    const decidedW = coveredW + notMasteredW;
    const masteryPct =
      decidedW > 0 ? Math.round((coveredW / decidedW) * 100) : null;

    const cat = CAT_BY_ID[catId];
    return {
      catId,
      swot: cat.swot,
      label: cat.label,
      subtitle: cat.subtitle,
      total,
      covered,
      notMastered,
      open,
      masteryPct,
    };
  });

  const total = quads.reduce((s, q) => s + q.total, 0);
  const covered = quads.reduce((s, q) => s + q.covered, 0);
  const notMastered = quads.reduce((s, q) => s + q.notMastered, 0);
  const open = quads.reduce((s, q) => s + q.open, 0);

  let coveredW = 0;
  let notMasteredW = 0;
  for (const catId of OPP_MAPPING_SWOT_ORDER) {
    for (const e of source[catId] ?? []) {
      const w = weightsFor(e.id, weights);
      if (e.status === "covered") coveredW += w.bonus;
      else if (e.status === "not_mastered") notMasteredW += w.malus;
    }
  }
  const decidedW = coveredW + notMasteredW;
  const masteryPct =
    decidedW > 0 ? Math.round((coveredW / decidedW) * 100) : null;

  return { quads, total, covered, notMastered, open, masteryPct };
}

/**
 * Injecte les cartes marquées obligatoires dans la librairie.
 * Préserve le statut / commentaire des cartes déjà présentes.
 */
export function ensureRequiredMappingChecks(
  checks: OppMappingChecks | undefined,
  subtypes: Pick<
    OppMappingSubtypeDef,
    "id" | "category" | "active" | "required"
  >[],
): OppMappingChecks {
  const next: OppMappingChecks = {};
  for (const catId of OPP_MAPPING_SWOT_ORDER) {
    next[catId] = [...(checks?.[catId] ?? [])];
  }

  for (const s of subtypes) {
    if (s.required !== true || s.active === false) continue;
    const list = next[s.category]!;
    if (!list.some((e) => e.id === s.id)) {
      list.push({ id: s.id, status: "open" });
    }
  }

  return next;
}

/** True si au moins une carte obligatoire active manque sur le deal. */
export function mappingMissingRequired(
  checks: OppMappingChecks | undefined,
  subtypes: Pick<
    OppMappingSubtypeDef,
    "id" | "category" | "active" | "required"
  >[],
): boolean {
  for (const s of subtypes) {
    if (s.required !== true || s.active === false) continue;
    const list = checks?.[s.category] ?? [];
    if (!list.some((e) => e.id === s.id)) return true;
  }
  return false;
}
