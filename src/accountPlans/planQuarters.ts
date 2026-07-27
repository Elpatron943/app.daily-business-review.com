/** Colonnes account plans : trimestres glissants sur N années. */

export type PlanQuarter = {
  id: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  label: string;
  labelLong: string;
  start: string;
  end: string;
};

export type PlanQuarterBucketId = string | "_past" | "_later";

export type PlanQuarterColumn<T> = {
  id: PlanQuarterBucketId;
  label: string;
  labelLong: string;
  start?: string;
  end?: string;
  items: T[];
  totalAmount: number;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toIso(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function lastDayOfMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

export function quarterOfDate(d: Date): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const q = (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  return { year: d.getFullYear(), quarter: q };
}

export function makeQuarter(year: number, quarter: 1 | 2 | 3 | 4): PlanQuarter {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const yy = String(year).slice(-2);
  return {
    id: `${year}-Q${quarter}`,
    year,
    quarter,
    label: `T${quarter} ${yy}`,
    labelLong: `T${quarter} ${year}`,
    start: toIso(year, startMonth, 1),
    end: toIso(year, endMonth, lastDayOfMonth(year, endMonth)),
  };
}

/** 12 trimestres (3 ans) à partir du trimestre calendaire courant. */
export function buildForwardQuarters(
  from: Date = new Date(),
  years = 3,
): PlanQuarter[] {
  const { year, quarter } = quarterOfDate(from);
  const out: PlanQuarter[] = [];
  let y = year;
  let q = quarter as number;
  const count = Math.max(1, years) * 4;
  for (let i = 0; i < count; i++) {
    out.push(makeQuarter(y, q as 1 | 2 | 3 | 4));
    q += 1;
    if (q > 4) {
      q = 1;
      y += 1;
    }
  }
  return out;
}

export function quarterIdFromIso(iso: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const { year, quarter } = quarterOfDate(d);
  return `${year}-Q${quarter}`;
}

/** Date de projection pipeline : close opp la plus proche, sinon échéance plan. */
export function planProjectionDate(
  plan: { dueDate?: string },
  opportunity:
    | { closeDate?: string }
    | { closeDate?: string }[]
    | null
    | undefined,
): string {
  if (Array.isArray(opportunity)) {
    const dates = opportunity
      .map((o) => o.closeDate)
      .filter((d): d is string => Boolean(d))
      .sort();
    return dates[0] || plan.dueDate || "";
  }
  return opportunity?.closeDate || plan.dueDate || "";
}

export function planOpportunitiesAmount(
  opportunities: { amount?: number }[],
): number {
  return opportunities.reduce((sum, o) => sum + (o.amount || 0), 0);
}

export function groupByPlanQuarters<T>(input: {
  items: T[];
  getDate: (item: T) => string;
  getAmount: (item: T) => number;
  years?: number;
  from?: Date;
}): PlanQuarterColumn<T>[] {
  const quarters = buildForwardQuarters(input.from, input.years ?? 3);
  const byId = new Map<string, T[]>();
  for (const q of quarters) byId.set(q.id, []);
  const past: T[] = [];
  const later: T[] = [];

  const windowStart = quarters[0]?.start ?? "";
  const windowEnd = quarters[quarters.length - 1]?.end ?? "";

  for (const item of input.items) {
    const iso = input.getDate(item);
    const qid = quarterIdFromIso(iso);
    if (!qid || !iso) {
      past.push(item);
      continue;
    }
    if (iso < windowStart) {
      past.push(item);
      continue;
    }
    if (iso > windowEnd) {
      later.push(item);
      continue;
    }
    const list = byId.get(qid);
    if (list) list.push(item);
    else later.push(item);
  }

  const sum = (list: T[]) =>
    list.reduce((a, it) => a + (input.getAmount(it) || 0), 0);

  const cols: PlanQuarterColumn<T>[] = [];
  if (past.length) {
    cols.push({
      id: "_past",
      label: "Avant",
      labelLong: "Avant la fenêtre",
      items: past,
      totalAmount: sum(past),
    });
  }
  for (const q of quarters) {
    const items = byId.get(q.id) ?? [];
    cols.push({
      id: q.id,
      label: q.label,
      labelLong: q.labelLong,
      start: q.start,
      end: q.end,
      items,
      totalAmount: sum(items),
    });
  }
  if (later.length) {
    cols.push({
      id: "_later",
      label: "Après",
      labelLong: "Au-delà de 3 ans",
      items: later,
      totalAmount: sum(later),
    });
  }
  return cols;
}
