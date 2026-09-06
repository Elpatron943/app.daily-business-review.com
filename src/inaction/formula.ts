/**
 * Formules CoI — chaîne gauche→droite : a ⊕ b ⊕ c …
 * Facteurs = variables structurées (sélecteur), pas du texte libre.
 * Opérateurs : * + - / %  (% = a × b / 100).
 */

export type InactionFormulaOp = "*" | "+" | "-" | "/" | "%";

/** Période / fréquence (temps homme ou coût ETP). */
export type ManTimeFrequency =
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

type PeriodOption = {
  id: ManTimeFrequency;
  label: string;
  /** Multiplicateur → base annuelle (heures / an pour temps homme). */
  factor: number;
};

/** Temps homme : heures par période → heures / an. Pas de « / heure ». */
export const MAN_TIME_PERIODS: PeriodOption[] = [
  { id: "day", label: "h / jour ouvré", factor: 220 },
  { id: "week", label: "h / semaine", factor: 52 },
  { id: "month", label: "h / mois", factor: 12 },
  { id: "quarter", label: "h / trimestre", factor: 4 },
  { id: "year", label: "h / an", factor: 1 },
];

/** Coût ETP : montant € pour la période → converti en € / h. */
export const ETP_COST_PERIODS: PeriodOption[] = [
  { id: "hour", label: "€ / heure", factor: 1 },
  { id: "day", label: "€ / jour", factor: 8 },
  { id: "week", label: "€ / semaine", factor: 40 },
  { id: "month", label: "€ / mois", factor: 0 }, // dynamique via hoursYear
  { id: "quarter", label: "€ / trimestre", factor: 0 },
  { id: "year", label: "€ / an", factor: 0 },
];

/** @deprecated Alias — préférer MAN_TIME_PERIODS / ETP_COST_PERIODS. */
export const MAN_TIME_FREQUENCIES: PeriodOption[] = [
  { id: "hour", label: "/ heure", factor: 1 },
  ...MAN_TIME_PERIODS,
];

export function isManTimeVar(id: string): boolean {
  return id === "manTime";
}

export function isEtpCostVar(id: string): boolean {
  return id === "etpLoadedCost";
}

/** Variables qui affichent la liste périodicité. */
export function hasFrequencySelect(id: string): boolean {
  return isManTimeVar(id) || isEtpCostVar(id);
}

export function frequenciesForVar(id: string): PeriodOption[] {
  if (isEtpCostVar(id)) return ETP_COST_PERIODS;
  return MAN_TIME_PERIODS;
}

export function defaultFrequencyForVar(id: string): ManTimeFrequency {
  return isEtpCostVar(id) ? "hour" : "month";
}

/** Normalise une périodicité temps homme (hour legacy → year). */
export function normalizeManTimeFrequency(
  frequency: ManTimeFrequency | null | undefined,
): ManTimeFrequency {
  if (!frequency || frequency === "hour") return "year";
  return frequency;
}

export function manTimeAnnualFactor(
  frequency: ManTimeFrequency | null | undefined,
): number {
  const id = normalizeManTimeFrequency(frequency);
  return MAN_TIME_PERIODS.find((f) => f.id === id)?.factor ?? 1;
}

export function periodLabelForVar(
  varId: string,
  frequency: ManTimeFrequency | null | undefined,
): string {
  const freq = isManTimeVar(varId)
    ? normalizeManTimeFrequency(frequency)
    : (frequency ?? defaultFrequencyForVar(varId));
  const list = frequenciesForVar(varId);
  return list.find((f) => f.id === freq)?.label ?? freq;
}

export function manTimeFrequencyLabel(
  frequency: ManTimeFrequency | null | undefined,
): string {
  return periodLabelForVar("manTime", frequency);
}

/**
 * Coût ETP saisi pour une période → € / h
 * (pour × temps homme en heures / an → € / an).
 */
export function etpCostToPerHour(
  raw: number,
  frequency: ManTimeFrequency | null | undefined,
  productiveHoursPerYear: number,
): number {
  const hoursYear = Math.max(1, productiveHoursPerYear || 1600);
  const freq = frequency ?? "hour";
  switch (freq) {
    case "hour":
      return raw;
    case "day":
      return raw / 8;
    case "week":
      return raw / 40;
    case "month":
      return raw / (hoursYear / 12);
    case "quarter":
      return raw / (hoursYear / 4);
    case "year":
      return raw / hoursYear;
    default:
      return raw;
  }
}

/** Coût ETP annuel → montant dans l’unité de période (autofill deal). */
export function annualEtpToPeriodCost(
  annualEur: number,
  frequency: ManTimeFrequency | null | undefined,
  productiveHoursPerYear: number,
): number {
  const hoursYear = Math.max(1, productiveHoursPerYear || 1600);
  const freq = frequency ?? "hour";
  switch (freq) {
    case "hour":
      return annualEur / hoursYear;
    case "day":
      return annualEur / 220;
    case "week":
      return annualEur / 52;
    case "month":
      return annualEur / 12;
    case "quarter":
      return annualEur / 4;
    case "year":
      return annualEur;
    default:
      return annualEur / hoursYear;
  }
}

function isManTimeFrequency(v: unknown): v is ManTimeFrequency {
  return (
    v === "hour" ||
    v === "day" ||
    v === "week" ||
    v === "month" ||
    v === "quarter" ||
    v === "year"
  );
}

/** Variable catalogue (sélecteur Settings / deal). */
export type InactionFormulaVarDef = {
  id: string;
  label: string;
  /** Unité affichée (hint). */
  unit?: string;
  group: "temps" | "commercial" | "risque" | "montant";
  /** Masqué du sélecteur (ids legacy encore évaluables). */
  legacy?: boolean;
};

/**
 * Catalogue fermé des facteurs utilisables dans une formule.
 * Sélecteur volontairement court : ETP, CA client, hausse %, quantité, valeur.
 */
export const INACTION_FORMULA_VARS: InactionFormulaVarDef[] = [
  {
    id: "manTime",
    label: "Temps homme",
    unit: "h",
    group: "temps",
  },
  {
    id: "etpLoadedCost",
    label: "Coût unitaire chargé de l’ETP",
    unit: "€",
    group: "temps",
  },
  {
    id: "revenueEur",
    label: "CA actuel du client",
    unit: "€",
    group: "commercial",
  },
  {
    id: "upliftPct",
    label: "Hausse",
    unit: "%",
    group: "commercial",
  },
  {
    id: "quantity",
    label: "Quantité / volume",
    unit: "nb",
    group: "montant",
  },
  {
    id: "amountEur",
    label: "Valeur (personnalisable)",
    unit: "€",
    group: "montant",
  },
  // Legacy (formules déjà enregistrées — masquées du sélecteur)
  {
    id: "etpCount",
    label: "Nb ETP",
    unit: "ETP",
    group: "temps",
    legacy: true,
  },
  {
    id: "hours",
    label: "Heures / occurrence / ETP",
    unit: "h",
    group: "temps",
    legacy: true,
  },
  {
    id: "frequencyPerYear",
    label: "Fréquence / an",
    unit: "/ an",
    group: "temps",
    legacy: true,
  },
  {
    id: "opps",
    label: "Opportunités / an",
    unit: "nb",
    group: "commercial",
    legacy: true,
  },
  {
    id: "gap",
    label: "Écart de conversion",
    unit: "0–1",
    group: "commercial",
    legacy: true,
  },
  {
    id: "deal",
    label: "Valeur moyenne d’affaire",
    unit: "€",
    group: "commercial",
    legacy: true,
  },
  {
    id: "margin",
    label: "Marge",
    unit: "%",
    group: "commercial",
    legacy: true,
  },
  {
    id: "impactEur",
    label: "Impact / occurrence",
    unit: "€",
    group: "risque",
    legacy: true,
  },
  {
    id: "probability",
    label: "Probabilité annuelle",
    unit: "0–1",
    group: "risque",
    legacy: true,
  },
  {
    id: "unitPrice",
    label: "Prix unitaire",
    unit: "€",
    group: "montant",
    legacy: true,
  },
  {
    id: "rate",
    label: "Taux",
    unit: "0–1",
    group: "montant",
    legacy: true,
  },
];

const VAR_BY_ID = new Map(INACTION_FORMULA_VARS.map((v) => [v.id, v]));

export function formulaVarDef(id: string): InactionFormulaVarDef | undefined {
  return VAR_BY_ID.get(id);
}

export function formulaVarLabel(id: string): string {
  const v = VAR_BY_ID.get(id);
  if (!v) return id;
  return v.unit ? `${v.label} (${v.unit})` : v.label;
}

export type InactionFormulaInput = {
  /** Id d’une variable du catalogue INACTION_FORMULA_VARS. */
  id: string;
  /** Libellé personnalisé (opt.) — ex. « Nb opportunités perdues ». */
  label?: string;
  /** Périodicité — Temps homme ou coût ETP (€ / période). */
  frequency?: ManTimeFrequency;
};

/** Libellé affiché : personnalisation si renseignée, sinon catalogue. */
export function formulaInputLabel(
  inp: InactionFormulaInput,
  frequencyOverride?: ManTimeFrequency | null,
): string {
  const custom = inp.label?.trim();
  const base = custom || formulaVarLabel(inp.id);
  if (hasFrequencySelect(inp.id)) {
    const freq =
      frequencyOverride ?? inp.frequency ?? defaultFrequencyForVar(inp.id);
    return `${base} (${periodLabelForVar(inp.id, freq)})`;
  }
  return base;
}

export type InactionFormula = {
  enabled: boolean;
  inputs: InactionFormulaInput[];
  /** operators[i] entre inputs[i] et inputs[i+1] */
  operators: InactionFormulaOp[];
};

export const INACTION_FORMULA_OPS: {
  id: InactionFormulaOp;
  label: string;
}[] = [
  { id: "*", label: "×" },
  { id: "+", label: "+" },
  { id: "-", label: "−" },
  { id: "/", label: "÷" },
  { id: "%", label: "% de" },
];

const GROUP_LABEL: Record<InactionFormulaVarDef["group"], string> = {
  temps: "ETP / temps",
  commercial: "CA / hausse",
  risque: "Risque",
  montant: "Volume / valeur",
};

export function formulaVarsByGroup(): {
  group: InactionFormulaVarDef["group"];
  label: string;
  vars: InactionFormulaVarDef[];
}[] {
  const order: InactionFormulaVarDef["group"][] = [
    "temps",
    "commercial",
    "montant",
    "risque",
  ];
  return order
    .map((group) => ({
      group,
      label: GROUP_LABEL[group],
      vars: INACTION_FORMULA_VARS.filter((v) => v.group === group && !v.legacy),
    }))
    .filter((g) => g.vars.length > 0);
}

function firstAvailableVarId(used: Set<string>): string {
  const found = INACTION_FORMULA_VARS.find((v) => !v.legacy && !used.has(v.id));
  return found?.id ?? "amountEur";
}

export function emptyInactionFormula(): InactionFormula {
  return {
    enabled: false,
    inputs: [{ id: "amountEur" }],
    operators: [],
  };
}

export function defaultRevenueFormula(): InactionFormula {
  return {
    enabled: true,
    inputs: [{ id: "revenueEur" }, { id: "upliftPct" }],
    operators: ["%"],
  };
}

/** Map ancien libellé libre → id catalogue. */
const LEGACY_LABEL_TO_ID: Record<string, string> = {
  "opportunités / an": "opps",
  "opportunites / an": "opps",
  "écart de conversion (0–1)": "gap",
  "ecart de conversion (0-1)": "gap",
  "écart de conversion": "gap",
  "valeur moyenne (€)": "deal",
  "valeur moyenne": "deal",
  "marge (%)": "margin",
  marge: "margin",
  "montant (€)": "amountEur",
  "nb etp": "etpCount",
  "heures / occurrence / etp": "hours",
  "fréquence / an": "frequencyPerYear",
  "temps homme": "manTime",
  "coût unitaire chargé de l’etp": "etpLoadedCost",
  "cout unitaire charge de l'etp": "etpLoadedCost",
  "ca actuel du client": "revenueEur",
  "ca / an": "revenueEur",
  hausse: "upliftPct",
  "valeur (personnalisable)": "amountEur",
  "quantité / volume": "quantity",
};

function resolveVarId(rawId: string, rawLabel?: string): string {
  if (VAR_BY_ID.has(rawId)) return rawId;
  if (rawLabel) {
    const key = rawLabel.trim().toLowerCase();
    const mapped = LEGACY_LABEL_TO_ID[key];
    if (mapped) return mapped;
  }
  if (rawId === "opps" || rawId === "gap" || rawId === "deal" || rawId === "margin") {
    return rawId;
  }
  return "amountEur";
}

export function normalizeInactionFormula(raw: unknown): InactionFormula | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const inputsRaw = Array.isArray(o.inputs) ? o.inputs : [];
  const seen = new Set<string>();
  const inputs: InactionFormulaInput[] = [];
  for (const item of inputsRaw) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const rawId = typeof it.id === "string" ? it.id : "";
    const rawLabel = typeof it.label === "string" ? it.label : undefined;
    let id = resolveVarId(rawId, rawLabel);
    if (seen.has(id)) {
      id = firstAvailableVarId(seen);
    }
    seen.add(id);
    const custom = typeof it.label === "string" ? it.label.trim() : "";
    const next: InactionFormulaInput = custom ? { id, label: custom } : { id };
    if (hasFrequencySelect(id)) {
      const rawFreq = isManTimeFrequency(it.frequency)
        ? it.frequency
        : defaultFrequencyForVar(id);
      next.frequency = isManTimeVar(id)
        ? normalizeManTimeFrequency(rawFreq)
        : rawFreq;
    }
    inputs.push(next);
  }

  if (inputs.length === 0) {
    return { enabled: Boolean(o.enabled), inputs: [], operators: [] };
  }

  const opsRaw = Array.isArray(o.operators) ? o.operators : [];
  const operators: InactionFormulaOp[] = [];
  for (let i = 0; i < inputs.length - 1; i++) {
    const op = opsRaw[i];
    operators.push(isOp(op) ? op : "*");
  }

  return {
    enabled: o.enabled === true,
    inputs,
    operators,
  };
}

function isOp(v: unknown): v is InactionFormulaOp {
  return v === "*" || v === "+" || v === "-" || v === "/" || v === "%";
}

function resolveInputValue(
  inp: InactionFormulaInput,
  values: Record<string, number>,
  frequencyOverrides?: Record<string, ManTimeFrequency> | null,
  productiveHoursPerYear = 1600,
): number {
  const raw = Number(values[inp.id]) || 0;
  const freqRaw =
    frequencyOverrides?.[inp.id] ??
    inp.frequency ??
    defaultFrequencyForVar(inp.id);
  const freq = isManTimeVar(inp.id)
    ? normalizeManTimeFrequency(freqRaw)
    : freqRaw;
  if (isManTimeVar(inp.id)) {
    return raw * manTimeAnnualFactor(freq);
  }
  if (isEtpCostVar(inp.id)) {
    return etpCostToPerHour(raw, freq, productiveHoursPerYear);
  }
  return raw;
}

/**
 * Évalue la formule avec les valeurs saisies (ids → nombre).
 * Temps homme (h / période) → h / an ; coût ETP → € / h ; produit → € / an.
 */
export function evaluateInactionFormula(
  formula: InactionFormula | null | undefined,
  values: Record<string, number> | null | undefined,
  frequencyOverrides?: Record<string, ManTimeFrequency> | null,
  productiveHoursPerYear = 1600,
): number {
  if (!formula?.enabled || formula.inputs.length === 0) return 0;
  const vals = values ?? {};
  let acc = resolveInputValue(
    formula.inputs[0],
    vals,
    frequencyOverrides,
    productiveHoursPerYear,
  );
  for (let i = 0; i < formula.operators.length; i++) {
    const op = formula.operators[i];
    const next = formula.inputs[i + 1];
    const b = next
      ? resolveInputValue(
          next,
          vals,
          frequencyOverrides,
          productiveHoursPerYear,
        )
      : 0;
    acc = applyOp(acc, op, b);
  }
  return Number.isFinite(acc) ? acc : 0;
}

function applyOp(a: number, op: InactionFormulaOp, b: number): number {
  switch (op) {
    case "*":
      return a * b;
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "/":
      return b === 0 ? 0 : a / b;
    case "%":
      return (a * b) / 100;
    default:
      return a;
  }
}

export function formatInactionFormulaPreview(
  formula: InactionFormula | null | undefined,
  frequencyOverrides?: Record<string, ManTimeFrequency> | null,
): string {
  if (!formula || formula.inputs.length === 0) return "—";
  const parts: string[] = [];
  formula.inputs.forEach((inp, i) => {
    parts.push(
      formulaInputLabel(inp, frequencyOverrides?.[inp.id] ?? null),
    );
    if (i < formula.operators.length) {
      const op = INACTION_FORMULA_OPS.find((o) => o.id === formula.operators[i]);
      parts.push(op?.label ?? formula.operators[i]);
    }
  });
  return parts.join(" ");
}

export function addFormulaInput(formula: InactionFormula): InactionFormula {
  const used = new Set(formula.inputs.map((i) => i.id));
  const id = firstAvailableVarId(used);
  const next: InactionFormulaInput = hasFrequencySelect(id)
    ? { id, frequency: defaultFrequencyForVar(id) }
    : { id };
  const inputs = [...formula.inputs, next];
  const operators =
    formula.inputs.length === 0
      ? []
      : [...formula.operators, "*" as InactionFormulaOp];
  return { ...formula, enabled: true, inputs, operators };
}

export function removeFormulaInput(
  formula: InactionFormula,
  index: number,
): InactionFormula {
  if (formula.inputs.length <= 1) {
    return { ...formula, inputs: formula.inputs, operators: [] };
  }
  const inputs = formula.inputs.filter((_, i) => i !== index);
  const operators = [...formula.operators];
  if (index === 0) operators.shift();
  else if (index >= operators.length) operators.pop();
  else operators.splice(index - 1, 1);
  return { ...formula, inputs, operators };
}

export function setFormulaInputVar(
  formula: InactionFormula,
  index: number,
  varId: string,
): InactionFormula {
  if (!VAR_BY_ID.has(varId) || VAR_BY_ID.get(varId)?.legacy) return formula;
  const used = new Set(
    formula.inputs.map((inp, i) => (i === index ? "" : inp.id)).filter(Boolean),
  );
  let id = varId;
  if (used.has(id)) {
    id = firstAvailableVarId(used);
  }
  const inputs = formula.inputs.map((inp, i) => {
    if (i !== index) return inp;
    const next: InactionFormulaInput = { id, label: inp.label };
    if (hasFrequencySelect(id)) {
      next.frequency =
        hasFrequencySelect(inp.id) && inp.frequency
          ? inp.frequency
          : defaultFrequencyForVar(id);
    }
    return next;
  });
  return { ...formula, inputs };
}

export function setFormulaInputLabel(
  formula: InactionFormula,
  index: number,
  label: string,
): InactionFormula {
  const inputs = formula.inputs.map((inp, i) => {
    if (i !== index) return inp;
    const next: InactionFormulaInput = { id: inp.id };
    if (hasFrequencySelect(inp.id)) {
      next.frequency = inp.frequency ?? defaultFrequencyForVar(inp.id);
    }
    if (label.trim()) next.label = label;
    return next;
  });
  return { ...formula, inputs };
}

export function setFormulaInputFrequency(
  formula: InactionFormula,
  index: number,
  frequency: ManTimeFrequency,
): InactionFormula {
  const inputs = formula.inputs.map((inp, i) => {
    if (i !== index || !hasFrequencySelect(inp.id)) return inp;
    const nextFreq = isManTimeVar(inp.id)
      ? normalizeManTimeFrequency(frequency)
      : frequency;
    // Si « hour » choisi sur temps homme (plus dans la liste), ignore
    if (isManTimeVar(inp.id) && frequency === "hour") {
      return { ...inp, frequency: "year" };
    }
    return { ...inp, frequency: nextFreq };
  });
  return { ...formula, inputs };
}
