import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { useOrgConfig } from "../config/ConfigContext";
import type {
  BoFieldDef,
  OppMappingCardEntry,
  OppMappingCategory,
  OppMappingChecks,
} from "../config/types";
import { defaultConfig } from "../config/defaults";
import type { Status } from "../data";
import { ENGAGEMENT_STATUSES } from "../data";
import { useDomain } from "../domain/DomainContext";
import { useSales } from "../sales/SalesContext";
import { buildSoldLineFromWonOpportunity } from "../sales/syncWonToSold";
import { supabase } from "../supabase/client";
import {
  loadOrgOpportunities,
  logSyncError,
  upsertOpportunitiesRemote,
  upsertOpportunityRemote,
} from "../sync";
import { idFromExternalKey } from "../import/bulkImport";
import type {
  ProcessAnswer,
  ProcessAnswerStatus,
  ProcessAnswers,
} from "./salesProcess";
import type { InactionFormula, ManTimeFrequency } from "../inaction/formula";
import {
  annualEtpToPeriodCost,
  evaluateInactionFormula,
  normalizeInactionFormula,
} from "../inaction/formula";

export type OpportunityActionStatus = "Todo" | "Doing" | "Done";

export type OpportunityAction = {
  id: string;
  title: string;
  dueDate?: string;
  owner?: string;
  status: OpportunityActionStatus;
};

export const OPPORTUNITY_PHASES = [
  "Whitespace",
  "Discovery",
  "Qualification",
  "Proposal",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
] as const;

/** Nature du deal : upsell, cross-sell, renouvellement, nouveau logo groupe, prospect. */
export type OpportunityKind = string;

export const OPPORTUNITY_KINDS: OpportunityKind[] = [
  "up",
  "cross",
  "new_logo",
  "renewal",
  "new_in_group",
  "prospect",
];

export const opportunityKindLabel: Record<string, string> = {
  up: "Upsell",
  cross: "Cross-sell",
  new_logo: "New logo",
  renewal: "Renouvellement",
  new_in_group: "New logo",
  prospect: "Prospect",
};

export function isOpportunityKind(v: unknown): v is OpportunityKind {
  return typeof v === "string" && v.length > 0;
}

/** Narratif « Pourquoi » — problème à résoudre (qualification projet). */
export type OpportunityProjectWhy = {
  /** Quel problème veulent-ils résoudre ? */
  problem: string;
  /** Qui subit / porte le problème (fonction, persona…). */
  impacted: string;
  /** Conséquence si le problème n’est pas traité (court). */
  consequence: string;
};

export const EMPTY_OPPORTUNITY_PROJECT_WHY: OpportunityProjectWhy = {
  problem: "",
  impacted: "",
  consequence: "",
};

export function normalizeProjectWhy(raw: unknown): OpportunityProjectWhy {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_OPPORTUNITY_PROJECT_WHY };
  }
  const o = raw as Record<string, unknown>;
  return {
    problem: typeof o.problem === "string" ? o.problem : "",
    impacted: typeof o.impacted === "string" ? o.impacted : "",
    consequence: typeof o.consequence === "string" ? o.consequence : "",
  };
}

/** Saisie double : chiffre prospect vs hypothèse vendeur. */
export type DualNumber = { prospect: number; seller: number };

export type WhyNowValueSource = "prospect" | "seller";

export const EMPTY_DUAL: DualNumber = { prospect: 0, seller: 0 };

/** Heures productives / an pour convertir coût ETP → coût horaire. */
export const DEFAULT_PRODUCTIVE_HOURS_PER_YEAR = 1600;

/** Quantification d’une ligne CoI (temps, cash ou formule). */
export type InactionLeverQuant = {
  /** Nombre de personnes (ETP) concernées. */
  etpCount: DualNumber;
  /** Heures perdues / consacrées par occurrence et par ETP. */
  hours: DualNumber;
  /** Nombre d’occurrences / an. */
  frequencyPerYear: DualNumber;
  /** Montant € / an si saisie directe (ou legacy). */
  eur: DualNumber;
  /** Valeurs des facteurs de formule (id → nombre). */
  formulaInputs: Record<string, number>;
  /** Surcharge fréquence temps homme sur le deal (id → fréquence). */
  formulaFrequencies?: Record<string, ManTimeFrequency>;
  /**
   * Formule locale au deal (override Settings).
   * null = utiliser la formule catalogue ; undefined = idem.
   */
  formulaOverride?: InactionFormula | null;
};

export const EMPTY_INACTION_LEVER_QUANT: InactionLeverQuant = {
  etpCount: { ...EMPTY_DUAL },
  hours: { ...EMPTY_DUAL },
  frequencyPerYear: { ...EMPTY_DUAL },
  eur: { ...EMPTY_DUAL },
  formulaInputs: {},
};

/** Gap actuel pour un objectif (conscience de la charge / manque). */
export type ObjectiveGapRow = {
  objectiveId: string;
  currentEtp: DualNumber;
  /** Échelle 1–5. */
  riskLevel: DualNumber;
  currentEurAnnual: DualNumber;
  /** CE qui rendent cet objectif urgent maintenant. */
  compellingEventIds: string[];
  note: string;
};

/** Valorisation de l’atteinte via la solution (par objectif). */
export type ObjectiveOutcomeRow = {
  objectiveId: string;
  residualEtp: DualNumber;
  /** % d’atteinte de l’objectif grâce à l’outil. */
  attainmentPct: DualNumber;
};

/** Narratif « Pourquoi maintenant » + business outcomes (deal-level). */
export type OpportunityWhyNow = {
  /** @deprecated Objectifs — plus utilisés dans l’UI. */
  quantitativeObjectiveIds: string[];
  /** @deprecated */
  quantitativeObjectiveValues: Record<string, number>;
  /** @deprecated */
  qualitativeObjectiveIds: string[];
  decisionDeadline: string;
  inactionNote: string;
  /**
   * Leviers coût d’inaction cochés sur le deal
   * (catalogue Settings → familles / lignes).
   */
  inactionLeverIds: string[];
  /** Quantification par levier (temps × fréquence, ou € cash). */
  inactionLeverValues: Record<string, InactionLeverQuant>;
  /**
   * € / ETP / an — convertit les heures en coût
   * (€/h = coût ETP / heures productives).
   */
  etpAnnualCostEur: DualNumber;
  /** Heures productives / an pour dériver le coût horaire (défaut 1 600). */
  productiveHoursPerYear: number;
  /** @deprecated Agrégats libres — remplacés par inactionLever*. */
  inactionEtp: DualNumber;
  /** @deprecated */
  inactionRisk: DualNumber;
  /** @deprecated Prefer somme des leviers. */
  inactionEurAnnual: DualNumber;
  /** Après notre solution — deal. */
  residualEtp: DualNumber;
  attainmentPct: DualNumber;
  solutionOneShotEur: DualNumber;
  solutionAnnualEur: DualNumber;
  horizonYears: number;
  valueSource: WhyNowValueSource;
  /** @deprecated Gaps par objectif — migré vers inaction*. */
  objectiveGaps: Record<string, ObjectiveGapRow>;
  /** @deprecated Outcomes par objectif — migré vers residualEtp / attainmentPct. */
  objectiveOutcomes: Record<string, ObjectiveOutcomeRow>;
};

export const EMPTY_OPPORTUNITY_WHY_NOW: OpportunityWhyNow = {
  quantitativeObjectiveIds: [],
  quantitativeObjectiveValues: {},
  qualitativeObjectiveIds: [],
  decisionDeadline: "",
  inactionNote: "",
  inactionLeverIds: [],
  inactionLeverValues: {},
  etpAnnualCostEur: { ...EMPTY_DUAL },
  productiveHoursPerYear: DEFAULT_PRODUCTIVE_HOURS_PER_YEAR,
  inactionEtp: { ...EMPTY_DUAL },
  inactionRisk: { ...EMPTY_DUAL },
  inactionEurAnnual: { ...EMPTY_DUAL },
  residualEtp: { ...EMPTY_DUAL },
  attainmentPct: { ...EMPTY_DUAL },
  solutionOneShotEur: { ...EMPTY_DUAL },
  solutionAnnualEur: { ...EMPTY_DUAL },
  horizonYears: 3,
  valueSource: "prospect",
  objectiveGaps: {},
  objectiveOutcomes: {},
};

function asStringIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string");
}

function asNumberRecord(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && !Number.isNaN(v)) out[k] = v;
    else if (
      typeof v === "string" &&
      v.trim() !== "" &&
      !Number.isNaN(Number(v))
    ) {
      out[k] = Number(v);
    }
  }
  return out;
}

export function normalizeInactionLeverQuant(raw: unknown): InactionLeverQuant {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      etpCount: { ...EMPTY_DUAL },
      hours: { ...EMPTY_DUAL },
      frequencyPerYear: { ...EMPTY_DUAL },
      eur: { ...EMPTY_DUAL },
      formulaInputs: {},
    };
  }
  const o = raw as Record<string, unknown>;
  // Legacy : { prospect, seller } = € directs
  const looksLegacyDual =
    ("prospect" in o || "seller" in o) &&
    !("hours" in o) &&
    !("frequencyPerYear" in o) &&
    !("eur" in o) &&
    !("etpCount" in o) &&
    !("formulaInputs" in o);
  if (looksLegacyDual) {
    return {
      etpCount: { ...EMPTY_DUAL },
      hours: { ...EMPTY_DUAL },
      frequencyPerYear: { ...EMPTY_DUAL },
      eur: normalizeDual(o),
      formulaInputs: {},
    };
  }
  const formulaInputs: Record<string, number> = {};
  if (o.formulaInputs && typeof o.formulaInputs === "object") {
    for (const [k, v] of Object.entries(
      o.formulaInputs as Record<string, unknown>,
    )) {
      const n =
        typeof v === "number"
          ? v
          : typeof v === "string"
            ? Number(v)
            : NaN;
      if (Number.isFinite(n)) formulaInputs[k] = n;
    }
  }
  const override =
    o.formulaOverride === null
      ? null
      : normalizeInactionFormula(o.formulaOverride);
  const formulaFrequencies: Record<string, ManTimeFrequency> = {};
  if (o.formulaFrequencies && typeof o.formulaFrequencies === "object") {
    for (const [k, v] of Object.entries(
      o.formulaFrequencies as Record<string, unknown>,
    )) {
      if (
        v === "hour" ||
        v === "day" ||
        v === "week" ||
        v === "month" ||
        v === "quarter" ||
        v === "year"
      ) {
        formulaFrequencies[k] = v;
      }
    }
  }
  return {
    etpCount: normalizeDual(o.etpCount ?? o.etp ?? o.fteCount),
    hours: normalizeDual(o.hours),
    frequencyPerYear: normalizeDual(
      o.frequencyPerYear ?? o.frequency ?? o.freq,
    ),
    eur: normalizeDual(o.eur),
    formulaInputs,
    ...(Object.keys(formulaFrequencies).length > 0
      ? { formulaFrequencies }
      : {}),
    ...(override !== undefined && o.formulaOverride !== undefined
      ? { formulaOverride: override }
      : {}),
  };
}

function asInactionLeverQuantRecord(
  raw: unknown,
): Record<string, InactionLeverQuant> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, InactionLeverQuant> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = normalizeInactionLeverQuant(v);
  }
  return out;
}

/**
 * € / an selon la nature, ou formule si activée.
 */
export function inactionLeverAnnualEur(
  quant: InactionLeverQuant | null | undefined,
  etpAnnualCost: DualNumber,
  productiveHoursPerYear: number,
  source: WhyNowValueSource = "prospect",
  kind?: "productivity" | "revenue" | "avoided" | "time" | "cash",
  catalogFormula?: InactionFormula | null,
): number {
  const q = quant ?? EMPTY_INACTION_LEVER_QUANT;
  const formula =
    q.formulaOverride !== undefined ? q.formulaOverride : catalogFormula;
  if (formula?.enabled) {
    const hoursYear = Math.max(
      1,
      productiveHoursPerYear || DEFAULT_PRODUCTIVE_HOURS_PER_YEAR,
    );
    const etpCost = pickDual(etpAnnualCost, source);
    const values = { ...(q.formulaInputs ?? {}) };
    const usesLoaded =
      formula.inputs.some((inp) => inp.id === "etpLoadedCost") &&
      !(Number(values.etpLoadedCost) > 0);
    if (usesLoaded && etpCost > 0) {
      const costInp = formula.inputs.find((i) => i.id === "etpLoadedCost");
      const freq =
        q.formulaFrequencies?.etpLoadedCost ??
        costInp?.frequency ??
        "hour";
      values.etpLoadedCost = annualEtpToPeriodCost(etpCost, freq, hoursYear);
    }
    return evaluateInactionFormula(
      formula,
      values,
      q.formulaFrequencies ?? null,
      hoursYear,
    );
  }

  let resolved: "productivity" | "revenue" | "avoided" | null =
    kind === "time" || kind === "productivity"
      ? "productivity"
      : kind === "cash" || kind === "revenue"
        ? "revenue"
        : kind === "avoided"
          ? "avoided"
          : null;

  const etpCost = pickDual(etpAnnualCost, source);
  const hoursYear = Math.max(
    1,
    productiveHoursPerYear || DEFAULT_PRODUCTIVE_HOURS_PER_YEAR,
  );
  let etpCount = pickDual(q.etpCount, source);
  const hours = pickDual(q.hours, source);
  const freq = pickDual(q.frequencyPerYear, source);
  const eur = pickDual(q.eur, source);

  if (resolved == null) {
    if (hours > 0 && freq > 0) resolved = "productivity";
    else if (eur > 0 && freq > 0) resolved = "avoided";
    else resolved = "revenue";
  }

  if (resolved === "revenue") return eur;

  if (resolved === "avoided") {
    if (eur > 0 && freq > 0) return eur * freq;
    return eur;
  }

  if (etpCount <= 0 && hours > 0 && freq > 0) etpCount = 1;
  if (etpCount > 0 && hours > 0 && freq > 0 && etpCost > 0) {
    return etpCount * hours * freq * (etpCost / hoursYear);
  }
  return eur;
}

function asFiniteNumber(raw: unknown, fallback = 0): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "" && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }
  return fallback;
}

export function normalizeDual(raw: unknown): DualNumber {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_DUAL };
  }
  const o = raw as Record<string, unknown>;
  return {
    prospect: asFiniteNumber(o.prospect),
    seller: asFiniteNumber(o.seller),
  };
}

export function pickDual(
  d: DualNumber | null | undefined,
  source: WhyNowValueSource,
): number {
  if (!d) return 0;
  return source === "seller" ? d.seller : d.prospect;
}

function clampRisk(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function normalizeGapRow(
  objectiveId: string,
  raw: unknown,
): ObjectiveGapRow {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const risk = normalizeDual(o.riskLevel);
  return {
    objectiveId,
    currentEtp: normalizeDual(o.currentEtp),
    riskLevel: {
      prospect: clampRisk(risk.prospect) || 0,
      seller: clampRisk(risk.seller) || 0,
    },
    currentEurAnnual: normalizeDual(o.currentEurAnnual),
    compellingEventIds: asStringIdList(o.compellingEventIds),
    note: typeof o.note === "string" ? o.note : "",
  };
}

function normalizeOutcomeRow(
  objectiveId: string,
  raw: unknown,
): ObjectiveOutcomeRow {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    objectiveId,
    residualEtp: normalizeDual(o.residualEtp),
    attainmentPct: normalizeDual(o.attainmentPct),
  };
}

function normalizeGapMap(raw: unknown): Record<string, ObjectiveGapRow> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, ObjectiveGapRow> = {};
  for (const [id, row] of Object.entries(raw as Record<string, unknown>)) {
    out[id] = normalizeGapRow(id, row);
  }
  return out;
}

function normalizeOutcomeMap(
  raw: unknown,
): Record<string, ObjectiveOutcomeRow> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, ObjectiveOutcomeRow> = {};
  for (const [id, row] of Object.entries(raw as Record<string, unknown>)) {
    out[id] = normalizeOutcomeRow(id, row);
  }
  return out;
}

export function emptyGapRow(objectiveId: string): ObjectiveGapRow {
  return {
    objectiveId,
    currentEtp: { ...EMPTY_DUAL },
    riskLevel: { ...EMPTY_DUAL },
    currentEurAnnual: { ...EMPTY_DUAL },
    compellingEventIds: [],
    note: "",
  };
}

export function emptyOutcomeRow(objectiveId: string): ObjectiveOutcomeRow {
  return {
    objectiveId,
    residualEtp: { ...EMPTY_DUAL },
    attainmentPct: { ...EMPTY_DUAL },
  };
}

export function normalizeWhyNow(raw: unknown): OpportunityWhyNow {
  if (!raw || typeof raw !== "object") {
    return {
      ...EMPTY_OPPORTUNITY_WHY_NOW,
      etpAnnualCostEur: { ...EMPTY_DUAL },
      inactionEtp: { ...EMPTY_DUAL },
      inactionRisk: { ...EMPTY_DUAL },
      inactionEurAnnual: { ...EMPTY_DUAL },
      residualEtp: { ...EMPTY_DUAL },
      attainmentPct: { ...EMPTY_DUAL },
      solutionOneShotEur: { ...EMPTY_DUAL },
      solutionAnnualEur: { ...EMPTY_DUAL },
      objectiveGaps: {},
      objectiveOutcomes: {},
    };
  }
  const o = raw as Record<string, unknown>;
  const horizon = asFiniteNumber(o.horizonYears, 3);
  const gaps = normalizeGapMap(o.objectiveGaps);
  const outcomes = normalizeOutcomeMap(o.objectiveOutcomes);

  let inactionEtp = normalizeDual(o.inactionEtp);
  let inactionRisk = normalizeDual(o.inactionRisk);
  let inactionEurAnnual = normalizeDual(o.inactionEurAnnual);
  let residualEtp = normalizeDual(o.residualEtp);
  let attainmentPct = normalizeDual(o.attainmentPct);

  const gapList = Object.values(gaps);
  if (
    gapList.length > 0 &&
    inactionEtp.prospect === 0 &&
    inactionEtp.seller === 0 &&
    inactionEurAnnual.prospect === 0 &&
    inactionEurAnnual.seller === 0
  ) {
    inactionEtp = {
      prospect: gapList.reduce((s, g) => s + (g.currentEtp.prospect || 0), 0),
      seller: gapList.reduce((s, g) => s + (g.currentEtp.seller || 0), 0),
    };
    inactionEurAnnual = {
      prospect: gapList.reduce(
        (s, g) => s + (g.currentEurAnnual.prospect || 0),
        0,
      ),
      seller: gapList.reduce(
        (s, g) => s + (g.currentEurAnnual.seller || 0),
        0,
      ),
    };
    const risksP = gapList
      .map((g) => g.riskLevel.prospect)
      .filter((n) => n > 0);
    const risksS = gapList.map((g) => g.riskLevel.seller).filter((n) => n > 0);
    inactionRisk = {
      prospect: risksP.length
        ? Math.round(
            (risksP.reduce((a, b) => a + b, 0) / risksP.length) * 10,
          ) / 10
        : 0,
      seller: risksS.length
        ? Math.round(
            (risksS.reduce((a, b) => a + b, 0) / risksS.length) * 10,
          ) / 10
        : 0,
    };
  }

  const outList = Object.values(outcomes);
  if (
    outList.length > 0 &&
    residualEtp.prospect === 0 &&
    residualEtp.seller === 0 &&
    attainmentPct.prospect === 0 &&
    attainmentPct.seller === 0
  ) {
    residualEtp = {
      prospect: outList.reduce((s, x) => s + (x.residualEtp.prospect || 0), 0),
      seller: outList.reduce((s, x) => s + (x.residualEtp.seller || 0), 0),
    };
    const attP = outList
      .map((x) => x.attainmentPct.prospect)
      .filter((n) => n > 0);
    const attS = outList
      .map((x) => x.attainmentPct.seller)
      .filter((n) => n > 0);
    attainmentPct = {
      prospect: attP.length
        ? Math.round((attP.reduce((a, b) => a + b, 0) / attP.length) * 10) / 10
        : 0,
      seller: attS.length
        ? Math.round((attS.reduce((a, b) => a + b, 0) / attS.length) * 10) / 10
        : 0,
    };
  }

  return {
    quantitativeObjectiveIds: asStringIdList(o.quantitativeObjectiveIds),
    quantitativeObjectiveValues: asNumberRecord(
      o.quantitativeObjectiveValues,
    ),
    qualitativeObjectiveIds: asStringIdList(o.qualitativeObjectiveIds),
    decisionDeadline:
      typeof o.decisionDeadline === "string" ? o.decisionDeadline : "",
    inactionNote: typeof o.inactionNote === "string" ? o.inactionNote : "",
    inactionLeverIds: asStringIdList(o.inactionLeverIds),
    inactionLeverValues: asInactionLeverQuantRecord(o.inactionLeverValues),
    etpAnnualCostEur: normalizeDual(o.etpAnnualCostEur),
    productiveHoursPerYear: Math.max(
      1,
      asFiniteNumber(
        o.productiveHoursPerYear,
        DEFAULT_PRODUCTIVE_HOURS_PER_YEAR,
      ),
    ),
    inactionEtp,
    inactionRisk,
    inactionEurAnnual,
    residualEtp,
    attainmentPct,
    solutionOneShotEur: normalizeDual(o.solutionOneShotEur),
    solutionAnnualEur: normalizeDual(o.solutionAnnualEur),
    horizonYears: Math.max(1, Math.min(20, horizon || 3)),
    valueSource: o.valueSource === "seller" ? "seller" : "prospect",
    objectiveGaps: gaps,
    objectiveOutcomes: outcomes,
  };
}

export type WhyNowValueResults = {
  source: WhyNowValueSource;
  gapEtp: number;
  residualEtp: number;
  etpAvoided: number;
  gapEurDirect: number;
  gapEurFromEtp: number;
  gapEurTotal: number;
  residualEurFromEtp: number;
  etpAvoidedEur: number;
  avgRisk: number | null;
  avgAttainmentPct: number | null;
  solutionOneShot: number;
  solutionAnnual: number;
  annualBenefit: number;
  horizonYears: number;
  totalBenefit: number;
  netValue: number;
  roiPct: number | null;
  paybackMonths: number | null;
};

/** KPIs CoI + BO. Totaux = chiffres Prospect par défaut. */
export function computeWhyNowValue(
  whyNow: OpportunityWhyNow | null | undefined,
  sourceOverride?: WhyNowValueSource,
  leverCatalog?: Array<{
    id: string;
    valueKind?: string;
    formula?: InactionFormula | null;
  }>,
): WhyNowValueResults {
  const w = whyNow ?? EMPTY_OPPORTUNITY_WHY_NOW;
  const source: WhyNowValueSource = sourceOverride ?? "prospect";

  const gapEtp = pickDual(w.inactionEtp, source);
  const residualEtp = pickDual(w.residualEtp, source);
  const leverEur = sumInactionLeverAnnual(w, source, leverCatalog);
  const legacyEur = pickDual(w.inactionEurAnnual, source);
  const gapEurDirect = leverEur > 0 ? leverEur : legacyEur;
  const risk = pickDual(w.inactionRisk, source);
  const attain = pickDual(w.attainmentPct, source);

  const etpCost = pickDual(w.etpAnnualCostEur, source);
  const etpAvoided = Math.max(0, gapEtp - residualEtp);
  const gapEurFromEtp = etpCost > 0 ? gapEtp * etpCost : 0;
  const residualEurFromEtp = etpCost > 0 ? residualEtp * etpCost : 0;
  const etpAvoidedEur = etpCost > 0 ? etpAvoided * etpCost : 0;
  // Leviers Settings = source principale ; ETP legacy en complément si encore saisi.
  const gapEurTotal =
    leverEur > 0 ? leverEur : gapEurDirect + gapEurFromEtp;

  const solutionOneShot = pickDual(w.solutionOneShotEur, source);
  const solutionAnnual = pickDual(w.solutionAnnualEur, source);
  const annualBenefit = Math.max(
    0,
    gapEurTotal - residualEurFromEtp - solutionAnnual,
  );
  const horizonYears = Math.max(1, w.horizonYears || 3);
  const totalBenefit = annualBenefit * horizonYears;
  const netValue = totalBenefit - solutionOneShot;

  let roiPct: number | null = null;
  if (solutionOneShot > 0) {
    roiPct = Math.round((netValue / solutionOneShot) * 1000) / 10;
  }

  let paybackMonths: number | null = null;
  if (annualBenefit > 0 && solutionOneShot > 0) {
    paybackMonths =
      Math.round((solutionOneShot / annualBenefit) * 12 * 10) / 10;
  } else if (solutionOneShot <= 0 && annualBenefit > 0) {
    paybackMonths = 0;
  }

  return {
    source,
    gapEtp,
    residualEtp,
    etpAvoided,
    gapEurDirect,
    gapEurFromEtp: leverEur > 0 ? 0 : gapEurFromEtp,
    gapEurTotal,
    residualEurFromEtp,
    etpAvoidedEur,
    avgRisk: risk > 0 ? risk : null,
    avgAttainmentPct: attain > 0 ? attain : null,
    solutionOneShot,
    solutionAnnual,
    annualBenefit,
    horizonYears,
    totalBenefit,
    netValue,
    roiPct,
    paybackMonths,
  };
}

/** Somme € / an des leviers cochés (Prospect par défaut). */
export function sumInactionLeverAnnual(
  whyNow: OpportunityWhyNow | null | undefined,
  source: WhyNowValueSource = "prospect",
  catalog?: Array<{
    id: string;
    valueKind?: string;
    formula?: InactionFormula | null;
  }>,
): number {
  if (!whyNow) return 0;
  const values = whyNow.inactionLeverValues ?? {};
  const hoursYear =
    whyNow.productiveHoursPerYear || DEFAULT_PRODUCTIVE_HOURS_PER_YEAR;
  const byId = new Map((catalog ?? []).map((l) => [l.id, l]));
  return (whyNow.inactionLeverIds ?? []).reduce((sum, id) => {
    const v = values[id];
    if (!v) return sum;
    const meta = byId.get(id);
    return (
      sum +
      inactionLeverAnnualEur(
        v,
        whyNow.etpAnnualCostEur,
        hoursYear,
        source,
        meta?.valueKind as
          | "productivity"
          | "revenue"
          | "avoided"
          | undefined,
        meta?.formula,
      )
    );
  }, 0);
}

/** Valeurs du calculateur — clés = id des champs admin (OrgConfig.boFields). */
export type BusinessOutcomeValues = Record<string, number>;

export type BusinessOutcomeResults = {
  annualSavings: number;
  annualBenefit: number;
  totalBenefit: number;
  netValue: number;
  investment: number;
  horizonYears: number;
  roiPct: number | null;
  paybackMonths: number | null;
};

export function defaultBusinessOutcomeValues(
  fields: BoFieldDef[] = defaultConfig.boFields,
): BusinessOutcomeValues {
  const values: BusinessOutcomeValues = {};
  for (const f of fields) {
    if (!f.active) continue;
    values[f.id] =
      f.defaultValue ?? (f.kind === "horizon" ? 3 : 0);
  }
  return values;
}

/** Migre l’ancien format objet fixe vers Record. */
export function migrateBusinessOutcomes(
  raw: unknown,
  fields: BoFieldDef[],
): BusinessOutcomeValues {
  const base = defaultBusinessOutcomeValues(fields);
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const next = { ...base };
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number" && !Number.isNaN(v)) next[k] = v;
  }
  return next;
}

export function computeBusinessOutcomes(
  values: BusinessOutcomeValues,
  fields: BoFieldDef[],
  opts?: { extraAnnualBenefit?: number },
): BusinessOutcomeResults {
  const active = fields.filter((f) => f.active);
  const sum = (kind: BoFieldDef["kind"]) =>
    active
      .filter((f) => f.kind === kind)
      .reduce((a, f) => a + (Number(values[f.id]) || 0), 0);

  const current = sum("current_cost");
  const future = sum("future_cost");
  const annualSavings = Math.max(0, current - future);
  const annualBenefit =
    annualSavings +
    sum("annual_benefit") -
    sum("annual_cost") +
    (opts?.extraAnnualBenefit ?? 0);
  const investment = sum("one_time");
  const horizonField = active.find((f) => f.kind === "horizon");
  const horizonYears = Math.max(
    1,
    horizonField ? Number(values[horizonField.id]) || 1 : 3,
  );
  const totalBenefit = annualBenefit * horizonYears;
  const netValue = totalBenefit - investment;

  let roiPct: number | null = null;
  if (investment > 0) {
    roiPct = Math.round((netValue / investment) * 1000) / 10;
  }

  let paybackMonths: number | null = null;
  if (annualBenefit > 0 && investment > 0) {
    paybackMonths = Math.round((investment / annualBenefit) * 12 * 10) / 10;
  } else if (investment <= 0 && annualBenefit > 0) {
    paybackMonths = 0;
  }

  return {
    annualSavings,
    annualBenefit,
    totalBenefit,
    netValue,
    investment,
    horizonYears,
    roiPct,
    paybackMonths,
  };
}

export type OpportunityVariableValues = Record<
  string,
  string | number | boolean
>;

/** Engagement d’un contact sur une opportunité donnée. */
export type OpportunityStakeholder = {
  contactId: string;
  /** Type de contact sur ce deal (catalogue contactTypes). */
  role: string;
  status: Status;
  notes?: string;
  /**
   * Motivations personnelles sur *ce* deal (avancer / reculer le projet).
   * Ids du catalogue org `personalMotivations`.
   */
  motivationIds?: string[];
};

export type OpportunityAiRecommendations = {
  updatedAt: string;
  content: string;
  model?: string;
  verdict?: "Go" | "Watch" | "No-go";
  confidence?: "high" | "medium" | "low";
  /** Actions complémentaires proposées (à valider puis ajouter au plan). */
  proposedActions?: Array<{
    title: string;
    dueDate?: string;
    owner?: string;
    rationale?: string;
  }>;
};

export function isEngagementStatus(v: unknown): v is Status {
  return (
    typeof v === "string" &&
    (ENGAGEMENT_STATUSES as readonly string[]).includes(v)
  );
}

/** Lit les anciens Contact.role pour migrer vers le stakeholder. */
function legacyContactRoles(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const raw = localStorage.getItem("powermap.domain.v1");
    if (!raw) return map;
    const parsed = JSON.parse(raw) as {
      contacts?: { id?: string; role?: string }[];
    };
    for (const c of parsed.contacts ?? []) {
      if (c?.id && typeof c.role === "string" && c.role.trim()) {
        map.set(c.id, c.role);
      }
    }
  } catch {
    /* ignore */
  }
  return map;
}

export function migrateStakeholders(
  raw: unknown,
  contactRoles?: Map<string, string>,
): OpportunityStakeholder[] {
  if (!Array.isArray(raw)) return [];
  const roles = contactRoles ?? legacyContactRoles();
  const out: OpportunityStakeholder[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const contactId = typeof o.contactId === "string" ? o.contactId : "";
    if (!contactId || seen.has(contactId)) continue;
    seen.add(contactId);
    const roleFromStake =
      typeof o.role === "string"
        ? o.role
        : typeof o.contactTypeId === "string"
          ? o.contactTypeId
          : "";
    const role = roleFromStake || roles.get(contactId) || "";
    out.push({
      contactId,
      role,
      status: isEngagementStatus(o.status) ? o.status : "Identified",
      notes: typeof o.notes === "string" ? o.notes : undefined,
      motivationIds: Array.isArray(o.motivationIds)
        ? o.motivationIds.filter((id): id is string => typeof id === "string")
        : [],
    });
  }
  return out;
}

export function migrateMappingChecks(raw: unknown): OppMappingChecks {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: OppMappingChecks = {};

  const toEntries = (val: unknown): OppMappingCardEntry[] => {
    if (!Array.isArray(val)) return [];
    const entries: OppMappingCardEntry[] = [];
    const seen = new Set<string>();
    for (const item of val) {
      if (typeof item === "string") {
        if (!item || seen.has(item)) continue;
        seen.add(item);
        entries.push({ id: item, status: "open" });
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const id =
        typeof o.id === "string"
          ? o.id
          : typeof o.subtypeId === "string"
            ? o.subtypeId
            : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      let status: OppMappingCardEntry["status"] = "open";
      if (o.status === "covered" || o.status === "not_mastered" || o.status === "open") {
        status = o.status;
      } else if (o.covered === true) {
        status = "covered";
      }
      entries.push({
        id,
        status,
        comment:
          typeof o.comment === "string" && o.comment.trim()
            ? o.comment
            : undefined,
      });
    }
    return entries;
  };

  const push = (key: OppMappingCategory, entries: OppMappingCardEntry[]) => {
    if (!entries.length) return;
    const existing = out[key] ?? [];
    const seen = new Set(existing.map((e) => e.id));
    const merged = [...existing];
    for (const e of entries) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      merged.push(e);
    }
    out[key] = merged;
  };

  for (const [key, val] of Object.entries(obj)) {
    const entries = toEntries(val);
    if (!entries.length) continue;
    if (key === "pressions") {
      push("risques", entries);
    } else if (
      key === "objectif" ||
      key === "risques" ||
      key === "signaux_positifs" ||
      key === "initiatives"
    ) {
      if (key === "initiatives") {
        const toOpp = entries.filter((e) => e.id.startsWith("omap-ini-"));
        const toThreat = entries.filter((e) => !e.id.startsWith("omap-ini-"));
        push("objectif", toOpp);
        push("initiatives", toThreat);
      } else {
        push(key, entries);
      }
    }
  }
  return out;
}

function cards(...ids: string[]): OppMappingCardEntry[] {
  return ids.map((id) => ({ id, status: "open" as const }));
}

export function defaultOpportunityVariables(
  defs: import("../config/types").OppVariableDef[] = [],
): OpportunityVariableValues {
  const values: OpportunityVariableValues = {};
  for (const v of defs) {
    if (!v.active) continue;
    if (v.defaultValue !== undefined) values[v.id] = v.defaultValue;
    else if (v.kind === "number") values[v.id] = 0;
    else if (v.kind === "boolean") values[v.id] = false;
    else values[v.id] = "";
  }
  return values;
}

export type OppFeatureImportance = 1 | 2 | 3;

/** Évaluation d’une feature catalogue sur un deal. */
export type OppFeatureAssessment = {
  /** Besoin attendu / exprimé par le client. */
  clientNeed: boolean;
  /** Importance perçue (1 = faible, 3 = critique). */
  importance: OppFeatureImportance;
};

export type Opportunity = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  closeDate: string;
  /** Compte Entreprise (pas le Holding). */
  primaryAccountId: string;
  phase: string;
  /** Upsell / cross / nouveau compte groupe / prospect. */
  kind: OpportunityKind;
  /** Solution du catalogue org (OrgConfig.solutions). */
  solutionId: string;
  /** Modules sélectionnés (ids de SolutionDef.modules). */
  moduleIds: string[];
  /**
   * Personae adressées (catalogue org).
   * Vide = niveau entreprise (pas de persona ciblée).
   */
  personaIds: string[];
  /** Compelling Events du catalogue org (pourquoi agir maintenant). */
  compellingEventIds: string[];
  /** Concurrents du catalogue org retenus sur ce deal. */
  competitorIds: string[];
  /**
   * Évaluation deal des features solution :
   * besoin client attendu + importance 1–3 (clé = featureId).
   */
  featureAssessments: Record<string, OppFeatureAssessment>;
  /** Leviers projet cochés (« Pourquoi y a-t-il un projet ? »). */
  projectLeverIds: string[];
  /** Problèmes à résoudre cochés (catalogue org). */
  projectProblemIds: string[];
  /**
   * Pourquoi : problème à résoudre (narratif optionnel — précision libre).
   * Les cases à cocher restent dans `projectProblemIds`.
   */
  projectWhy: OpportunityProjectWhy;
  /**
   * Pourquoi maintenant : objectifs quali/quanti, délai, narratif d’inaction.
   * Les montants d’impact restent dans `businessOutcomes`.
   */
  whyNow: OpportunityWhyNow;
  /** Variables admin (nb licences…) — surtout upsell. */
  variables: OpportunityVariableValues;
  businessOutcomes: BusinessOutcomeValues;
  /** Qualification Process (domaines / questions). */
  processAnswers: ProcessAnswers;
  /**
   * Opportunity Mapping SWOT — cartes par quadrant
   * (Forces / Faiblesses / Opportunités / Menaces).
   */
  mappingChecks: OppMappingChecks;
  /** Contacts mappés sur le deal (engagement). */
  stakeholders: OpportunityStakeholder[];
  /** Actions de suivi rattachées à l’opportunité. */
  actions: OpportunityAction[];
  /** Dernieres recommandations IA. */
  aiRecommendations?: OpportunityAiRecommendations | null;
  active: boolean;
  /** Gestionnaire DBR (profiles.id). */
  ownerProfileId?: string | null;
  /** Id Deal HubSpot (sync CRM). */
  hubspotDealId?: string | null;
  hubspotSyncedAt?: string | null;
  hubspotDirty?: boolean;
};

export const OPPORTUNITIES_STORAGE_KEY = "powermap.opportunities.v1";

type StoredState = {
  opportunities: Opportunity[];
  activeOpportunityId: string | null;
};

const seedValues = defaultBusinessOutcomeValues();
seedValues["bo-cost-ops"] = 120000;
seedValues["bo-cost-audits"] = 35000;
seedValues["bo-risk-cyber"] = 80000;
seedValues["bo-ops-productivity"] = 55000;
seedValues["bo-comp-audits"] = 25000;
seedValues.oneTimeInvestment = 180000;
seedValues.horizonYears = 3;

const defaultOpportunities: Opportunity[] = [
  {
    id: "opp-acme-renewal",
    name: "Acme — Platform Renewal EU",
    amount: 480000,
    currency: "EUR",
    closeDate: "2026-09-30",
    primaryAccountId: "fr",
    phase: "Discovery",
    kind: "renewal",
    solutionId: "sol-platform",
    moduleIds: ["mod-plt-core", "mod-plt-sso", "mod-plt-api"],
    personaIds: ["dir-fr-it"],
    compellingEventIds: ["ce-contract-renewal", "ce-cost-pressure"],
    competitorIds: [],
    featureAssessments: {},
    projectLeverIds: [],
    projectProblemIds: [],
    projectWhy: { ...EMPTY_OPPORTUNITY_PROJECT_WHY },
    whyNow: normalizeWhyNow({}),
    variables: {
      "var-users": 250,
      "var-licenses": 250,
    },
    businessOutcomes: seedValues,
    processAnswers: {
      "q-ts-1": { status: "Yes", updatedAt: "2026-05-01" },
      "q-ts-2": { status: "Yes", updatedAt: "2026-05-01" },
      "q-ts-3": { status: "Yes", updatedAt: "2026-05-10" },
      "q-ts-4": { status: "Yes", updatedAt: "2026-05-12" },
      "q-tq-1": { status: "Yes", updatedAt: "2026-06-01" },
      "q-tq-2": { status: "Yes", updatedAt: "2026-06-02" },
      "q-tq-3": { status: "Yes", updatedAt: "2026-06-05" },
      "q-tq-4": { status: "Yes", updatedAt: "2026-06-08" },
      "q-req-1": {
        status: "Yes",
        note: "Stratégie concurrentielle vs Analytics Suite concurrente.",
        updatedAt: "2026-07-01",
      },
      "q-req-2": {
        status: "No",
        note: "Accès Inner Circle encore limité — s’appuyer sur le Champion FR.",
        updatedAt: "2026-07-10",
      },
      "q-req-3": { status: "Yes", updatedAt: "2026-07-12" },
      "q-req-4": { status: "No", updatedAt: "2026-07-15" },
      "q-req-5": { status: "InProgress", updatedAt: "2026-07-18" },
      "q-req-6": { status: "InProgress", updatedAt: "2026-07-20" },
      "q-ev-1": { status: "Yes", updatedAt: "2026-07-22" },
      "q-ev-2": { status: "No", updatedAt: "2026-07-22" },
    },
    mappingChecks: {
      objectif: cards(
        "omap-obj-cost",
        "omap-obj-risk",
        "omap-ini-digital",
        "omap-ini-cloud",
      ),
      risques: cards("omap-ri-comp-who", "omap-ri-stake-power"),
      signaux_positifs: cards(
        "omap-sp-stake-champion",
        "omap-sp-need-clear",
        "usp:usp-plt-core-1",
        "usp:usp-org-1",
      ),
      initiatives: cards("omap-th-comp-active", "omap-th-delay"),
    },
    stakeholders: [
      { contactId: "c1", role: "EconomicBuyer", status: "Identified" },
      { contactId: "c2", role: "Champion", status: "Aligned" },
      { contactId: "c5", role: "User", status: "Engaged" },
    ],
    actions: [
      {
        id: "oact-1",
        title: "Workshop architecture avec IT DE",
        dueDate: "2026-06-15",
        owner: "AE",
        status: "Doing",
      },
      {
        id: "oact-2",
        title: "Brief budget Q3 avec Finance Groupe",
        dueDate: "2026-07-01",
        owner: "AE",
        status: "Todo",
      },
      {
        id: "oact-3",
        title: "Cartographier Procurement groupe",
        dueDate: "2026-05-01",
        owner: "SE",
        status: "Todo",
      },
    ],
    active: true,
  },
];

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeFeatureAssessments(
  raw: unknown,
): Record<string, OppFeatureAssessment> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, OppFeatureAssessment> = {};
  for (const [featureId, value] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!featureId || !value || typeof value !== "object") continue;
    const v = value as Partial<OppFeatureAssessment>;
    const importanceRaw = Number(v.importance);
    const importance: OppFeatureImportance =
      importanceRaw === 1 || importanceRaw === 2 || importanceRaw === 3
        ? importanceRaw
        : 2;
    out[featureId] = {
      clientNeed: v.clientNeed === true,
      importance,
    };
  }
  return out;
}

function emptyStoredState(): StoredState {
  return { opportunities: [], activeOpportunityId: null };
}

/** Personae effectives (multi + legacy directionIds / directionId). */
function normalizePersonaIds(raw: {
  personaIds?: unknown;
  personaId?: unknown;
  directionIds?: unknown;
  directionId?: unknown;
}): string[] {
  if (Array.isArray(raw.personaIds)) {
    return raw.personaIds.filter((id): id is string => typeof id === "string");
  }
  if (typeof raw.personaId === "string" && raw.personaId) {
    return [raw.personaId];
  }
  if (Array.isArray(raw.directionIds)) {
    return raw.directionIds.filter((id): id is string => typeof id === "string");
  }
  if (typeof raw.directionId === "string" && raw.directionId) {
    return [raw.directionId];
  }
  return [];
}

function normalizeOpportunityActions(raw: unknown): OpportunityAction[] {
  if (!Array.isArray(raw)) return [];
  const out: OpportunityAction[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const a = item as Partial<OpportunityAction>;
    const title = String(a.title ?? "").trim();
    if (!title) return;
    const status: OpportunityActionStatus =
      a.status === "Doing" || a.status === "Done" || a.status === "Todo"
        ? a.status
        : "Todo";
    out.push({
      id: typeof a.id === "string" && a.id ? a.id : `oact-${i + 1}`,
      title,
      dueDate:
        typeof a.dueDate === "string" && a.dueDate
          ? a.dueDate.slice(0, 10)
          : undefined,
      owner:
        typeof a.owner === "string" && a.owner.trim()
          ? a.owner.trim()
          : undefined,
      status,
    });
  });
  return out;
}

function loadLocal(): StoredState {
  try {
    const raw = localStorage.getItem(OPPORTUNITIES_STORAGE_KEY);
    if (!raw) {
      return {
        opportunities: structuredClone(defaultOpportunities),
        activeOpportunityId: defaultOpportunities[0]?.id ?? null,
      };
    }
    const parsed = JSON.parse(raw) as StoredState;
    const fields = defaultConfig.boFields;
    const opportunities = (
      parsed.opportunities?.length
        ? parsed.opportunities
        : defaultOpportunities
    ).map((o) => {
      const raw = o as Opportunity & {
        personaIds?: unknown;
        personaId?: unknown;
        directionIds?: unknown;
        directionId?: unknown;
      };
      const personaIds = normalizePersonaIds(raw);
      return {
      ...o,
      active: o.active !== false,
      currency: o.currency || "EUR",
      amount: typeof o.amount === "number" ? o.amount : Number(o.amount) || 0,
      phase: o.phase || OPPORTUNITY_PHASES[0],
      kind:
        o.id === "opp-acme-renewal"
          ? "renewal"
          : isOpportunityKind(o.kind)
            ? o.kind
            : "prospect",
      solutionId: typeof o.solutionId === "string" ? o.solutionId : "",
      moduleIds: Array.isArray(o.moduleIds)
        ? o.moduleIds.filter((id): id is string => typeof id === "string")
        : [],
      personaIds,
      compellingEventIds: Array.isArray(
        (o as Opportunity).compellingEventIds,
      )
        ? (o as Opportunity).compellingEventIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      competitorIds: Array.isArray((o as Opportunity).competitorIds)
        ? (o as Opportunity).competitorIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      featureAssessments: normalizeFeatureAssessments(
        (o as Opportunity).featureAssessments,
      ),
      projectLeverIds: Array.isArray((o as Opportunity).projectLeverIds)
        ? (o as Opportunity).projectLeverIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      projectProblemIds: Array.isArray((o as Opportunity).projectProblemIds)
        ? (o as Opportunity).projectProblemIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      projectWhy: normalizeProjectWhy((o as Opportunity).projectWhy),
      whyNow: normalizeWhyNow((o as Opportunity).whyNow),
      variables:
        o.variables && typeof o.variables === "object" ? o.variables : {},
      businessOutcomes: migrateBusinessOutcomes(o.businessOutcomes, fields),
      processAnswers:
        o.processAnswers && typeof o.processAnswers === "object"
          ? o.processAnswers
          : {},
      mappingChecks: migrateMappingChecks(o.mappingChecks),
      stakeholders: migrateStakeholders(
        (o as Opportunity & { stakeholders?: unknown }).stakeholders,
      ),
      actions: normalizeOpportunityActions(
        (o as Opportunity & { actions?: unknown }).actions,
      ),
      aiRecommendations:
        o.aiRecommendations &&
        typeof o.aiRecommendations === "object" &&
        typeof (o.aiRecommendations as OpportunityAiRecommendations)
          .content === "string"
          ? (o.aiRecommendations as OpportunityAiRecommendations)
          : null,
    };
    });

    try {
      const plansRaw = localStorage.getItem("powermap.accountPlans.v1");
      if (plansRaw) {
        const parsedPlans = JSON.parse(plansRaw) as {
          plans?: Array<{
            actions?: Array<{
              id?: string;
              title?: string;
              dueDate?: string;
              owner?: string;
              opportunityId?: string | null;
              status?: string;
            }>;
            opportunityIds?: string[];
          }>;
        };
        const byOpp = new Map<string, OpportunityAction[]>();
        for (const plan of parsedPlans.plans ?? []) {
          for (const a of plan.actions ?? []) {
            const oppId =
              (typeof a.opportunityId === "string" && a.opportunityId) ||
              plan.opportunityIds?.[0] ||
              "";
            if (!oppId || !a.title?.trim()) continue;
            const list = byOpp.get(oppId) ?? [];
            list.push({
              id:
                typeof a.id === "string" && a.id
                  ? a.id
                  : `oact-mig-${list.length + 1}`,
              title: a.title.trim(),
              dueDate: a.dueDate?.slice(0, 10),
              owner: a.owner?.trim() || undefined,
              status:
                a.status === "Doing" ||
                a.status === "Done" ||
                a.status === "Todo"
                  ? a.status
                  : "Todo",
            });
            byOpp.set(oppId, list);
          }
        }
        for (let i = 0; i < opportunities.length; i++) {
          const opp = opportunities[i];
          const legacy = byOpp.get(opp.id);
          if (!legacy?.length || (opp.actions ?? []).length > 0) continue;
          opportunities[i] = { ...opp, actions: legacy };
        }
      }
    } catch {
      /* ignore */
    }

    const activeOpportunityId =
      parsed.activeOpportunityId &&
      opportunities.some(
        (o) => o.id === parsed.activeOpportunityId && o.active,
      )
        ? parsed.activeOpportunityId
        : (opportunities.find((o) => o.active)?.id ?? null);
    return { opportunities, activeOpportunityId };
  } catch {
    return {
      opportunities: structuredClone(defaultOpportunities),
      activeOpportunityId: defaultOpportunities[0]?.id ?? null,
    };
  }
}

function persistLocal(state: StoredState) {
  localStorage.setItem(OPPORTUNITIES_STORAGE_KEY, JSON.stringify(state));
}

type OpportunityContextValue = {
  opportunities: Opportunity[];
  activeOpportunities: Opportunity[];
  activeOpportunityId: string | null;
  activeOpportunity: Opportunity | null;
  quotaError: string | null;
  clearQuotaError: () => void;
  setActiveOpportunityId: (id: string | null) => void;
  addOpportunity: (
    input: Omit<
      Opportunity,
      | "id"
      | "active"
      | "businessOutcomes"
      | "processAnswers"
      | "variables"
      | "mappingChecks"
      | "stakeholders"
      | "aiRecommendations"
      | "compellingEventIds"
      | "competitorIds"
      | "featureAssessments"
      | "projectLeverIds"
      | "projectProblemIds"
      | "moduleIds"
      | "personaIds"
      | "actions"
      | "whyNow"
      | "projectWhy"
    > & {
      businessOutcomes?: BusinessOutcomeValues;
      processAnswers?: ProcessAnswers;
      variables?: OpportunityVariableValues;
      moduleIds?: string[];
      personaIds?: string[];
      compellingEventIds?: string[];
      competitorIds?: string[];
      featureAssessments?: Record<string, OppFeatureAssessment>;
      projectLeverIds?: string[];
      projectProblemIds?: string[];
      whyNow?: OpportunityWhyNow;
      projectWhy?: OpportunityProjectWhy;
      mappingChecks?: Opportunity["mappingChecks"];
      stakeholders?: OpportunityStakeholder[];
      actions?: OpportunityAction[];
    },
  ) => string | null;
  updateOpportunity: (id: string, patch: Partial<Opportunity>) => void;
  /** Propage l’owner du compte sur toutes ses opportunités. */
  assignOwnerForAccount: (
    accountId: string,
    ownerProfileId: string | null,
  ) => void;
  removeOpportunity: (id: string) => void;
  addAction: (
    opportunityId: string,
    input: Omit<OpportunityAction, "id" | "status"> & {
      status?: OpportunityActionStatus;
    },
  ) => void;
  updateAction: (
    opportunityId: string,
    actionId: string,
    patch: Partial<OpportunityAction>,
  ) => void;
  removeAction: (opportunityId: string, actionId: string) => void;
  importOpportunitiesBatch: (
    rows: Array<{
      action: "create" | "update";
      id?: string;
      externalKey?: string;
      name: string;
      accountId: string;
      amount: number;
      closeDate: string;
      phase: string;
      kind: OpportunityKind;
      solutionId: string;
      moduleIds?: string[];
      personaIds?: string[];
      ownerProfileId?: string | null;
      mappingChecks?: Opportunity["mappingChecks"];
    }>,
  ) => { created: number; updated: number };
  setBusinessOutcomeValue: (
    opportunityId: string,
    fieldId: string,
    value: number,
  ) => void;
  setProcessAnswer: (
    opportunityId: string,
    questionId: string,
    patch: Partial<ProcessAnswer> & { status?: ProcessAnswerStatus },
  ) => void;
};

const OpportunityContext = createContext<OpportunityContextValue | null>(null);

export function OpportunityProvider({ children }: { children: ReactNode }) {
  const {
    billing,
    setActiveOpportunityCount,
    profile,
    loading: authLoading,
    canWriteDomain,
    canViewAllAccounts,
  } = useAuth();
  const { kpiClassifier } = useOrgConfig();
  const { activeAccounts } = useDomain();
  const { soldSolutions, upsertSoldSolution } = useSales();
  const soldSolutionsRef = useRef(soldSolutions);
  soldSolutionsRef.current = soldSolutions;
  const orgId = profile?.organization_id ?? null;
  const orgIdRef = useRef<string | null>(orgId);
  orgIdRef.current = orgId;

  const [state, setState] = useState<StoredState>(() => emptyStoredState());
  const stateRef = useRef(state);
  stateRef.current = state;
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const materializeWonSale = useCallback(
    (prev: Opportunity | undefined, next: Opportunity) => {
      const wasWon = prev ? kpiClassifier.isWonPhase(prev.phase) : false;
      const isWon = kpiClassifier.isWonPhase(next.phase);
      if (!isWon || wasWon) return;
      const line = buildSoldLineFromWonOpportunity(
        next,
        soldSolutionsRef.current,
      );
      if (line) upsertSoldSolution(line);
    },
    [kpiClassifier, upsertSoldSolution],
  );

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    (async () => {
      if (!orgId || !supabase) {
        if (!cancelled) setState(loadLocal());
        return;
      }
      try {
        const opportunities = await loadOrgOpportunities(orgId);
        if (cancelled) return;
        let nextOpps = opportunities;
        if (nextOpps.length === 0) {
          const local = loadLocal();
          if (local.opportunities.length > 0) {
            nextOpps = local.opportunities;
            void upsertOpportunitiesRemote(orgId, nextOpps).catch((err) =>
              logSyncError("seedOpportunities", err),
            );
          }
        }
        const next: StoredState = {
          opportunities: nextOpps,
          activeOpportunityId:
            nextOpps.find((o) => o.active)?.id ?? null,
        };
        persistLocal(next);
        setState(next);
      } catch (err) {
        logSyncError("loadOpportunities", err);
        // Ne jamais écraser le cache local avec un état vide sur erreur réseau / schéma.
        if (!cancelled) setState(loadLocal());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, orgId]);

  const pushOpportunity = useCallback((opportunity: Opportunity) => {
    const id = orgIdRef.current;
    if (!id || !supabase) return;
    void upsertOpportunityRemote(id, opportunity).catch((err) =>
      logSyncError("upsertOpportunity", err),
    );
  }, []);

  const commit = useCallback(
    (next: StoredState, syncIds?: string[]) => {
      stateRef.current = next;
      setState(next);
      persistLocal(next);
      if (!syncIds?.length) return;
      for (const oid of syncIds) {
        const opp = next.opportunities.find((o) => o.id === oid);
        if (opp) pushOpportunity(opp);
      }
    },
    [pushOpportunity],
  );

  const activeOpportunities = useMemo(() => {
    const active = state.opportunities.filter((o) => o.active);
    if (canViewAllAccounts) return active;
    const visibleAccountIds = new Set(activeAccounts.map((a) => a.id));
    return active.filter((o) => visibleAccountIds.has(o.primaryAccountId));
  }, [state.opportunities, canViewAllAccounts, activeAccounts]);

  useEffect(() => {
    setActiveOpportunityCount(activeOpportunities.length);
  }, [activeOpportunities.length, setActiveOpportunityCount]);

  const clearQuotaError = useCallback(() => setQuotaError(null), []);

  const assertCanCreateOpportunity = useCallback((): string | null => {
    if (!canWriteDomain || !billing.canWrite) {
      return "Abonnement ou rôle en lecture seule — création d’opportunité impossible.";
    }
    if (billing.opportunitiesFull) {
      const limit = billing.usage.opportunitiesLimit;
      return `Quota d’opportunités actives atteint (${limit}). Passez à une formule supérieure.`;
    }
    return null;
  }, [billing, canWriteDomain]);

  const activeOpportunity = useMemo(
    () =>
      activeOpportunities.find((o) => o.id === state.activeOpportunityId) ??
      null,
    [activeOpportunities, state.activeOpportunityId],
  );

  const setActiveOpportunityId = useCallback(
    (id: string | null) => {
      setState((prev) => {
        const next = { ...prev, activeOpportunityId: id };
        persistLocal(next);
        return next;
      });
    },
    [],
  );

  const addOpportunity = useCallback(
    (
      input: Omit<
        Opportunity,
        | "id"
        | "active"
        | "businessOutcomes"
        | "processAnswers"
        | "variables"
        | "mappingChecks"
        | "stakeholders"
        | "aiRecommendations"
        | "compellingEventIds"
        | "competitorIds"
        | "featureAssessments"
        | "projectLeverIds"
        | "projectProblemIds"
        | "moduleIds"
        | "personaIds"
        | "actions"
        | "whyNow"
        | "projectWhy"
      > & {
        businessOutcomes?: BusinessOutcomeValues;
        processAnswers?: ProcessAnswers;
        variables?: OpportunityVariableValues;
        moduleIds?: string[];
        personaIds?: string[];
        compellingEventIds?: string[];
        competitorIds?: string[];
        featureAssessments?: Record<string, OppFeatureAssessment>;
        projectLeverIds?: string[];
        projectProblemIds?: string[];
        whyNow?: OpportunityWhyNow;
        projectWhy?: OpportunityProjectWhy;
        mappingChecks?: Opportunity["mappingChecks"];
        stakeholders?: OpportunityStakeholder[];
        actions?: OpportunityAction[];
      },
    ) => {
      const blocked = assertCanCreateOpportunity();
      if (blocked) {
        setQuotaError(blocked);
        return null;
      }
      setQuotaError(null);
      const id = uid("opp");
      const accountOwner =
        activeAccounts.find((a) => a.id === input.primaryAccountId)
          ?.ownerProfileId ?? null;
      const opportunity: Opportunity = {
        ...input,
        id,
        active: true,
        kind: input.kind ?? "prospect",
        solutionId: input.solutionId ?? "",
        moduleIds: input.moduleIds ?? [],
        personaIds: input.personaIds ?? [],
        compellingEventIds: input.compellingEventIds ?? [],
        competitorIds: input.competitorIds ?? [],
        featureAssessments: normalizeFeatureAssessments(
          input.featureAssessments,
        ),
        projectLeverIds: input.projectLeverIds ?? [],
        projectProblemIds: input.projectProblemIds ?? [],
        projectWhy: normalizeProjectWhy(input.projectWhy),
        whyNow: normalizeWhyNow(input.whyNow),
        variables: input.variables ?? {},
        businessOutcomes:
          input.businessOutcomes ?? defaultBusinessOutcomeValues(),
        processAnswers: input.processAnswers ?? {},
        mappingChecks: input.mappingChecks ?? {},
        stakeholders: migrateStakeholders(input.stakeholders ?? []),
        actions: normalizeOpportunityActions(input.actions ?? []),
        aiRecommendations: null,
        ownerProfileId: input.ownerProfileId ?? accountOwner,
      };
      commit(
        {
          opportunities: [...state.opportunities, opportunity],
          activeOpportunityId: id,
        },
        [id],
      );
      return id;
    },
    [assertCanCreateOpportunity, commit, state, activeAccounts],
  );

  const updateOpportunity = useCallback(
    (id: string, patch: Partial<Opportunity>) => {
      const prevState = stateRef.current;
      const prev = prevState.opportunities.find((o) => o.id === id);
      const next = prev ? { ...prev, ...patch, id: prev.id } : null;
      commit(
        {
          ...prevState,
          opportunities: prevState.opportunities.map((o) =>
            o.id === id ? { ...o, ...patch, id: o.id } : o,
          ),
        },
        [id],
      );
      if (prev && next) materializeWonSale(prev, next);
    },
    [commit, materializeWonSale],
  );

  const assignOwnerForAccount = useCallback(
    (accountId: string, ownerProfileId: string | null) => {
      let synced: Opportunity[] = [];
      setState((prev) => {
        synced = [];
        const opportunities = prev.opportunities.map((o) => {
          if (o.primaryAccountId !== accountId) return o;
          if ((o.ownerProfileId ?? null) === ownerProfileId) return o;
          const next = { ...o, ownerProfileId };
          synced.push(next);
          return next;
        });
        if (synced.length === 0) return prev;
        const next = { ...prev, opportunities };
        persistLocal(next);
        return next;
      });
      const id = orgIdRef.current;
      if (id && supabase && synced.length > 0) {
        void upsertOpportunitiesRemote(id, synced).catch((err) =>
          logSyncError("cascadeOwnerOpportunities", err),
        );
      }
    },
    [],
  );

  const removeOpportunity = useCallback(
    (id: string) => {
      setState((prev) => {
        const opportunities = prev.opportunities.map((o) =>
          o.id === id ? { ...o, active: false } : o,
        );
        const activeOpportunityId =
          prev.activeOpportunityId === id
            ? (opportunities.find((o) => o.active)?.id ?? null)
            : prev.activeOpportunityId;
        const next = { opportunities, activeOpportunityId };
        persistLocal(next);
        const opp = opportunities.find((o) => o.id === id);
        if (opp) pushOpportunity(opp);
        return next;
      });
    },
    [pushOpportunity],
  );

  const importOpportunitiesBatch = useCallback(
    (
      rows: Array<{
        action: "create" | "update";
        id?: string;
        externalKey?: string;
        name: string;
        accountId: string;
        amount: number;
        closeDate: string;
        phase: string;
        kind: OpportunityKind;
        solutionId: string;
        moduleIds?: string[];
        personaIds?: string[];
        ownerProfileId?: string | null;
        mappingChecks?: Opportunity["mappingChecks"];
      }>,
    ) => {
      const prepared = rows.map((row) => {
        let resolvedId: string;
        if (row.action === "update" && row.id) {
          resolvedId = row.id;
        } else if (row.externalKey?.trim()) {
          resolvedId = idFromExternalKey(row.externalKey, "opp");
        } else {
          resolvedId = uid("opp");
        }
        return { ...row, resolvedId };
      });
      let created = 0;
      let updated = 0;
      let skippedQuota = 0;
      setState((prev) => {
        let opportunities = [...prev.opportunities];
        created = 0;
        updated = 0;
        skippedQuota = 0;
        let activeCount = opportunities.filter((o) => o.active).length;
        const oppLimit = billing.usage.opportunitiesLimit;
        for (const row of prepared) {
          if (!row.accountId) continue;
          const existing = opportunities.find((o) => o.id === row.resolvedId);
          if (existing) {
            const nextOpp: Opportunity = {
              ...existing,
              name: row.name.trim(),
              amount: row.amount,
              closeDate: row.closeDate,
              primaryAccountId: row.accountId,
              phase: row.phase,
              kind: row.kind,
              solutionId: row.solutionId,
              moduleIds: row.moduleIds ?? existing.moduleIds,
              personaIds: row.personaIds ?? existing.personaIds,
              ownerProfileId:
                row.ownerProfileId !== undefined
                  ? row.ownerProfileId
                  : existing.ownerProfileId,
              active: true,
            };
            materializeWonSale(existing, nextOpp);
            opportunities = opportunities.map((o) =>
              o.id === row.resolvedId ? nextOpp : o,
            );
            updated++;
          } else {
            if (!billing.canWrite) {
              skippedQuota++;
              continue;
            }
            if (oppLimit != null && activeCount >= oppLimit) {
              skippedQuota++;
              continue;
            }
            const createdOpp: Opportunity = {
              id: row.resolvedId,
              name: row.name.trim(),
              amount: row.amount,
              currency: "EUR",
              closeDate: row.closeDate,
              primaryAccountId: row.accountId,
              phase: row.phase,
              kind: row.kind,
              solutionId: row.solutionId,
              moduleIds: row.moduleIds ?? [],
              personaIds: row.personaIds ?? [],
              compellingEventIds: [],
              competitorIds: [],
              featureAssessments: {},
              projectLeverIds: [],
              projectProblemIds: [],
              projectWhy: { ...EMPTY_OPPORTUNITY_PROJECT_WHY },
              whyNow: normalizeWhyNow({}),
              variables: {},
              businessOutcomes: defaultBusinessOutcomeValues(),
              processAnswers: {},
              mappingChecks: row.mappingChecks ?? {},
              stakeholders: [],
              actions: [],
              aiRecommendations: null,
              ownerProfileId: row.ownerProfileId ?? null,
              active: true,
            };
            materializeWonSale(undefined, createdOpp);
            opportunities.push(createdOpp);
            created++;
            activeCount++;
          }
        }
        if (skippedQuota > 0) {
          setQuotaError(
            `${skippedQuota} opportunité(s) non importée(s) — quota ou abonnement lecture seule.`,
          );
        }
        const next = { ...prev, opportunities };
        persistLocal(next);
        return next;
      });
      const id = orgIdRef.current;
      if (id && supabase) {
        try {
          const raw = localStorage.getItem(OPPORTUNITIES_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as StoredState;
            void upsertOpportunitiesRemote(
              id,
              parsed.opportunities ?? [],
            ).catch((err) => logSyncError("importOpportunities", err));
          }
        } catch (err) {
          logSyncError("importOpportunitiesBatch", err);
        }
      }
      return { created, updated };
    },
    [billing.canWrite, billing.usage.opportunitiesLimit, materializeWonSale],
  );

  const setBusinessOutcomeValue = useCallback(
    (opportunityId: string, fieldId: string, value: number) => {
      commit(
        {
          ...state,
          opportunities: state.opportunities.map((o) =>
            o.id === opportunityId
              ? {
                  ...o,
                  businessOutcomes: {
                    ...o.businessOutcomes,
                    [fieldId]: value,
                  },
                }
              : o,
          ),
        },
        [opportunityId],
      );
    },
    [commit, state],
  );

  const setProcessAnswer = useCallback(
    (
      opportunityId: string,
      questionId: string,
      patch: Partial<ProcessAnswer> & { status?: ProcessAnswerStatus },
    ) => {
      const today = new Date().toISOString().slice(0, 10);
      const prevState = stateRef.current;
      commit(
        {
          ...prevState,
          opportunities: prevState.opportunities.map((o) => {
            if (o.id !== opportunityId) return o;
            const prev = o.processAnswers?.[questionId] ?? {
              status: "None" as const,
            };
            return {
              ...o,
              processAnswers: {
                ...o.processAnswers,
                [questionId]: {
                  ...prev,
                  ...patch,
                  status: patch.status ?? prev.status,
                  updatedAt: today,
                },
              },
            };
          }),
        },
        [opportunityId],
      );
    },
    [commit],
  );

  const addAction = useCallback(
    (
      opportunityId: string,
      input: Omit<OpportunityAction, "id" | "status"> & {
        status?: OpportunityActionStatus;
      },
    ) => {
      const title = input.title.trim();
      if (!title) return;
      commit(
        {
          ...state,
          opportunities: state.opportunities.map((o) =>
            o.id === opportunityId
              ? {
                  ...o,
                  actions: [
                    ...(o.actions ?? []),
                    {
                      id: uid("oact"),
                      title,
                      dueDate: input.dueDate || undefined,
                      owner: input.owner?.trim() || undefined,
                      status: input.status ?? "Todo",
                    },
                  ],
                }
              : o,
          ),
        },
        [opportunityId],
      );
    },
    [commit, state],
  );

  const updateAction = useCallback(
    (
      opportunityId: string,
      actionId: string,
      patch: Partial<OpportunityAction>,
    ) => {
      commit(
        {
          ...state,
          opportunities: state.opportunities.map((o) =>
            o.id === opportunityId
              ? {
                  ...o,
                  actions: (o.actions ?? []).map((a) =>
                    a.id === actionId ? { ...a, ...patch, id: a.id } : a,
                  ),
                }
              : o,
          ),
        },
        [opportunityId],
      );
    },
    [commit, state],
  );

  const removeAction = useCallback(
    (opportunityId: string, actionId: string) => {
      commit(
        {
          ...state,
          opportunities: state.opportunities.map((o) =>
            o.id === opportunityId
              ? {
                  ...o,
                  actions: (o.actions ?? []).filter((a) => a.id !== actionId),
                }
              : o,
          ),
        },
        [opportunityId],
      );
    },
    [commit, state],
  );

  const value = useMemo(
    () => ({
      opportunities: state.opportunities,
      activeOpportunities,
      activeOpportunityId: state.activeOpportunityId,
      activeOpportunity,
      quotaError,
      clearQuotaError,
      setActiveOpportunityId,
      addOpportunity,
      updateOpportunity,
      assignOwnerForAccount,
      removeOpportunity,
      importOpportunitiesBatch,
      setBusinessOutcomeValue,
      setProcessAnswer,
      addAction,
      updateAction,
      removeAction,
    }),
    [
      state.opportunities,
      state.activeOpportunityId,
      activeOpportunities,
      activeOpportunity,
      quotaError,
      clearQuotaError,
      setActiveOpportunityId,
      addOpportunity,
      updateOpportunity,
      assignOwnerForAccount,
      removeOpportunity,
      importOpportunitiesBatch,
      setBusinessOutcomeValue,
      setProcessAnswer,
      addAction,
      updateAction,
      removeAction,
    ],
  );

  return (
    <OpportunityContext.Provider value={value}>
      {children}
    </OpportunityContext.Provider>
  );
}

export function useOpportunities() {
  const ctx = useContext(OpportunityContext);
  if (!ctx) {
    throw new Error("useOpportunities must be used within OpportunityProvider");
  }
  return ctx;
}
