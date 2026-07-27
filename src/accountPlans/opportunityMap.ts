import type { Account } from "../data";
import {
  salesForAccountScope,
  type SoldSolution,
} from "../data";
import type {
  Opportunity,
  OpportunityKind,
} from "../opportunities/OpportunityContext";
import type { AccountPlan } from "./AccountPlanContext";

export type OppMapCell = { amount: number; count: number };

/** Won = CA facturé · Upsell / Renouvellement / Cross = pipeline ouvert par type. */
export type OppMapBucket = "won" | "up" | "renewal" | "cross";

export type OppMapColumn = {
  id: string;
  label: string;
};

export type OppMapRow = {
  key: OppMapBucket;
  label: string;
  cells: Record<string, OppMapCell>;
};

export type OpportunityMapModel = {
  columns: OppMapColumn[];
  rows: OppMapRow[];
  totals: Record<string, number>;
  grandTotal: number;
  summary: {
    won: number;
    up: number;
    renewal: number;
    cross: number;
    wonCount: number;
    upCount: number;
    renewalCount: number;
    crossCount: number;
  };
};

export type ProgressBar = {
  id: string;
  label: string;
  won: number;
  up: number;
  renewal: number;
  cross: number;
  plan: number;
};

const emptyCell = (): OppMapCell => ({ amount: 0, count: 0 });

function isOpenPhase(phase: string) {
  return (
    phase !== "Whitespace" &&
    phase !== "Closed Won" &&
    phase !== "Closed Lost"
  );
}

function isWonPhase(phase: string) {
  return phase === "Closed Won";
}

/** Upsell · renouvellement · expansion (cross / nouveau groupe / prospect). */
function pipelineBucket(kind: OpportunityKind): "up" | "renewal" | "cross" {
  if (kind === "up") return "up";
  if (kind === "renewal") return "renewal";
  return "cross";
}

function ensureProductCol(
  solutionId: string,
  columns: OppMapColumn[],
  productCols: OppMapColumn[],
  buckets: Record<string, OppMapCell>[],
) {
  if (buckets.every((b) => b[solutionId])) return;
  for (const b of buckets) {
    if (!b[solutionId]) b[solutionId] = emptyCell();
  }
  if (!columns.some((c) => c.id === solutionId)) {
    columns.push({ id: solutionId, label: solutionId });
    productCols.push({ id: solutionId, label: solutionId });
  }
}

/**
 * Opportunity Map :
 * - Won = CA facturé (solutions vendues)
 * - Upsell = opportunités ouvertes kind=up
 * - Renouvellement = opportunités ouvertes kind=renewal
 * - Cross = opportunités ouvertes kind=cross / new_in_group / prospect
 */
export function buildOpportunityMap(input: {
  accountId: string;
  accounts: Account[];
  soldSolutions: SoldSolution[];
  opportunities: Opportunity[];
  solutions: { id: string; name: string; active?: boolean }[];
}): OpportunityMapModel {
  const {
    accountId,
    accounts,
    soldSolutions,
    opportunities,
    solutions,
  } = input;

  const scopeAccount = accounts.find((a) => a.id === accountId) ?? null;
  const isHolding = scopeAccount?.type === "Holding";

  const sales = salesForAccountScope(accountId, soldSolutions, accounts);
  const activeSolutions = solutions.filter((s) => s.active !== false);

  const columns: OppMapColumn[] = [
    { id: "_total", label: "Total" },
    ...activeSolutions.map((s) => ({ id: s.id, label: s.name })),
  ];
  const productCols = columns.filter((c) => c.id !== "_total");

  const wonBy: Record<string, OppMapCell> = { _total: emptyCell() };
  const upBy: Record<string, OppMapCell> = { _total: emptyCell() };
  const renewalBy: Record<string, OppMapCell> = { _total: emptyCell() };
  const crossBy: Record<string, OppMapCell> = { _total: emptyCell() };
  for (const col of productCols) {
    wonBy[col.id] = emptyCell();
    upBy[col.id] = emptyCell();
    renewalBy[col.id] = emptyCell();
    crossBy[col.id] = emptyCell();
  }

  const allBuckets = [wonBy, upBy, renewalBy, crossBy];

  for (const line of sales) {
    if (isHolding && line.accountId === accountId) continue;
    ensureProductCol(line.solutionId, columns, productCols, allBuckets);
    wonBy[line.solutionId].amount += line.billedAmount;
    if (line.billedAmount > 0) wonBy[line.solutionId].count += 1;
  }

  wonBy._total.amount = productCols.reduce(
    (a, c) => a + (wonBy[c.id]?.amount ?? 0),
    0,
  );
  wonBy._total.count = productCols.reduce(
    (a, c) => a + (wonBy[c.id]?.count ?? 0),
    0,
  );

  const scopeOpps = opportunities.filter((o) => {
    if (!o.active) return false;
    const acc = accounts.find((a) => a.id === o.primaryAccountId);
    if (!acc || acc.type === "Holding") return false;
    if (isHolding) return acc.holdingId === accountId;
    return o.primaryAccountId === accountId;
  });

  for (const opp of scopeOpps) {
    if (isWonPhase(opp.phase)) continue;
    if (!isOpenPhase(opp.phase)) continue;
    const bucket = pipelineBucket(opp.kind);
    const target =
      bucket === "up" ? upBy : bucket === "renewal" ? renewalBy : crossBy;
    target._total.amount += opp.amount;
    target._total.count += 1;
    const sid = opp.solutionId;
    if (sid) {
      ensureProductCol(sid, columns, productCols, allBuckets);
      target[sid].amount += opp.amount;
      target[sid].count += 1;
    }
  }

  const rows: OppMapRow[] = [
    { key: "won", label: "Won", cells: wonBy },
    { key: "up", label: "Upsell", cells: upBy },
    { key: "renewal", label: "Renouvellement", cells: renewalBy },
    { key: "cross", label: "Cross-sell", cells: crossBy },
  ];

  const totals: Record<string, number> = {};
  for (const col of columns) {
    totals[col.id] =
      (wonBy[col.id]?.amount ?? 0) +
      (upBy[col.id]?.amount ?? 0) +
      (renewalBy[col.id]?.amount ?? 0) +
      (crossBy[col.id]?.amount ?? 0);
  }

  return {
    columns,
    rows,
    totals,
    grandTotal: totals._total ?? 0,
    summary: {
      won: wonBy._total.amount,
      up: upBy._total.amount,
      renewal: renewalBy._total.amount,
      cross: crossBy._total.amount,
      wonCount: wonBy._total.count,
      upCount: upBy._total.count,
      renewalCount: renewalBy._total.count,
      crossCount: crossBy._total.count,
    },
  };
}

/** 4 barres temporelles + ligne Plan (escalier vers le cumul des opportunités). */
export function buildPlanProgressBars(
  plan: AccountPlan,
  summary: OpportunityMapModel["summary"],
  dealTarget = 0,
): ProgressBar[] {
  const target = dealTarget;
  const labels = quarterLabels(plan.startDate, plan.dueDate);
  return labels.map((label, i) => ({
    id: `q-${i}`,
    label,
    won: summary.won,
    up: summary.up,
    renewal: summary.renewal,
    cross: summary.cross,
    plan: i < 2 ? target * 0.55 : target,
  }));
}

function quarterLabels(start: string, end: string): string[] {
  const s = start ? new Date(`${start}T12:00:00`) : new Date();
  const e = end ? new Date(`${end}T12:00:00`) : new Date(s);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return ["T1", "T2", "T3", "T4"];
  }
  const out: string[] = [];
  const cursor = new Date(s.getFullYear(), Math.floor(s.getMonth() / 3) * 3, 1);
  const endQ = new Date(e.getFullYear(), Math.floor(e.getMonth() / 3) * 3, 1);
  for (let i = 0; i < 4; i++) {
    const q = Math.floor(cursor.getMonth() / 3) + 1;
    out.push(`T${q} ${String(cursor.getFullYear()).slice(2)}`);
    cursor.setMonth(cursor.getMonth() + 3);
    if (cursor > endQ && out.length >= 1) {
      while (out.length < 4) out.push(out[out.length - 1] ?? `T${q}`);
      break;
    }
  }
  while (out.length < 4) out.push(`T${out.length + 1}`);
  return out.slice(0, 4);
}

export function formatCompactEur(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)} M€`;
  }
  if (Math.abs(n) >= 1_000) {
    return `${Math.round(n / 1_000)} k€`;
  }
  return `${Math.round(n)} €`;
}
