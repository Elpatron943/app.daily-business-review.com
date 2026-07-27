import { useMemo, useState, Fragment } from "react";
import { formatEur, type SoldSolution } from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import type { KpiClassifier } from "./config/salesTaxonomy";
import { useSales } from "./sales/SalesContext";
import { useDomain } from "./domain/DomainContext";
import {
  useOpportunities,
  type Opportunity,
} from "./opportunities/OpportunityContext";
import { computeProcessProgress } from "./opportunities/salesProcess";
import {
  computeMappingScorecard,
  mappingWeightsFromSubtypes,
  type MappingWeightLookup,
} from "./opportunities/mappingScore";
import type { ProcessDomainDef, SolutionDef } from "./config/types";
import OppScorePills from "./OppScorePills";
import SearchFilterBar, { matchesQuery } from "./SearchFilterBar";

type SolutionEquip = {
  billedAmount: number;
  targetAmount: number;
  whitespaceAmount: number;
  potentialAmount: number;
  renewalAmount: number;
  /** billed / target, null si cible = 0 */
  equipRatePct: number | null;
  /** Comptes avec CA > 0 */
  accountsEquipped: number;
  /** Comptes avec pipeline opportunité (adressables) */
  accountsAddressable: number;
  /** équipés / adressables */
  presencePct: number | null;
};

type SolutionRow = {
  id: string;
  name: string;
  code?: string;
  oppCount: number;
  amount: number;
  processAvg: number | null;
  mappingAvg: number | null;
  moduleHits: number;
  opportunities: Opportunity[];
  equip: SolutionEquip;
};

type ModuleRow = {
  id: string;
  label: string;
  solutionId: string;
  solutionName: string;
  oppCount: number;
  amount: number;
  processAvg: number | null;
  mappingAvg: number | null;
  /** Opps solution parent (dénominateur présence pipeline) */
  solutionOppCount: number;
  /** oppCount / solutionOppCount */
  presencePct: number | null;
  opportunities: Opportunity[];
};

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function scoresFor(
  opps: Opportunity[],
  domains: ProcessDomainDef[],
  weights: MappingWeightLookup,
) {
  const process: number[] = [];
  const mapping: number[] = [];
  for (const o of opps) {
    process.push(
      computeProcessProgress(domains, o.processAnswers).overallPct,
    );
    const m = computeMappingScorecard(o.mappingChecks, weights).masteryPct;
    if (m !== null) mapping.push(m);
  }
  return { processAvg: avg(process), mappingAvg: avg(mapping) };
}

function equipRate(billed: number, target: number): number | null {
  if (target <= 0) return null;
  return Math.round((billed / target) * 100);
}

function presenceRate(equipped: number, addressable: number): number | null {
  if (addressable <= 0) return null;
  return Math.round((equipped / addressable) * 100);
}

function buildEquipBySolution(
  soldSolutions: SoldSolution[],
  opportunities: Opportunity[],
  clf: KpiClassifier,
  year = new Date().getFullYear(),
): Map<string, SolutionEquip> {
  const bySol = new Map<
    string,
    {
      billed: number;
      whitespace: number;
      potential: number;
      renewal: number;
      equippedAccounts: Set<string>;
      addressableAccounts: Set<string>;
    }
  >();

  for (const line of soldSolutions) {
    const cur = bySol.get(line.solutionId) ?? {
      billed: 0,
      whitespace: 0,
      potential: 0,
      renewal: 0,
      equippedAccounts: new Set<string>(),
      addressableAccounts: new Set<string>(),
    };
    cur.billed += line.billedAmount || 0;
    if ((line.billedAmount || 0) > 0) {
      cur.equippedAccounts.add(line.accountId);
    }
    bySol.set(line.solutionId, cur);
  }

  for (const o of opportunities) {
    if (!o.solutionId || clf.isLostPhase(o.phase)) continue;
    const cur = bySol.get(o.solutionId) ?? {
      billed: 0,
      whitespace: 0,
      potential: 0,
      renewal: 0,
      equippedAccounts: new Set<string>(),
      addressableAccounts: new Set<string>(),
    };
    const amt = o.amount || 0;
    if (clf.isWonInstalledOpp(o, year)) {
      cur.billed += amt;
      cur.equippedAccounts.add(o.primaryAccountId);
    }
    if (clf.isWhitespaceTargetOpp(o)) cur.whitespace += amt;
    if (clf.isPipelineTargetOpp(o)) cur.potential += amt;
    if (clf.isOpenRenewalOpp(o)) cur.renewal += amt;
    if (
      clf.isOpenRenewalOpp(o) ||
      clf.isPipelineTargetOpp(o) ||
      clf.isWhitespaceTargetOpp(o)
    ) {
      cur.addressableAccounts.add(o.primaryAccountId);
    }
    bySol.set(o.solutionId, cur);
  }

  const out = new Map<string, SolutionEquip>();
  for (const [id, cur] of bySol) {
    const target = cur.whitespace + cur.potential + cur.renewal;
    const accountsEquipped = cur.equippedAccounts.size;
    const accountsAddressable = Math.max(
      cur.addressableAccounts.size,
      accountsEquipped,
    );
    out.set(id, {
      billedAmount: cur.billed,
      targetAmount: target,
      whitespaceAmount: cur.whitespace,
      potentialAmount: cur.potential,
      renewalAmount: cur.renewal,
      equipRatePct: equipRate(cur.billed, target),
      accountsEquipped,
      accountsAddressable,
      presencePct: presenceRate(accountsEquipped, accountsAddressable),
    });
  }
  return out;
}

const EMPTY_EQUIP: SolutionEquip = {
  billedAmount: 0,
  targetAmount: 0,
  whitespaceAmount: 0,
  potentialAmount: 0,
  renewalAmount: 0,
  equipRatePct: null,
  accountsEquipped: 0,
  accountsAddressable: 0,
  presencePct: null,
};

function buildSolutionRows(
  opportunities: Opportunity[],
  solutions: SolutionDef[],
  domains: ProcessDomainDef[],
  weights: MappingWeightLookup,
  equipBySol: Map<string, SolutionEquip>,
  clf: KpiClassifier,
): SolutionRow[] {
  const bySol = new Map<string, Opportunity[]>();
  for (const o of opportunities) {
    const key = o.solutionId || "__none__";
    const list = bySol.get(key) ?? [];
    list.push(o);
    bySol.set(key, list);
  }

  const ids = new Set<string>([
    ...bySol.keys(),
    ...equipBySol.keys(),
    ...solutions.map((s) => s.id),
  ]);

  const rows: SolutionRow[] = [];
  for (const id of ids) {
    if (id === "__none__" && (bySol.get(id)?.length ?? 0) === 0) continue;
    const opps = bySol.get(id) ?? [];
    const sol = solutions.find((s) => s.id === id);
    // Masquer solutions catalogue sans pipeline ni CA/cible
    const equip = equipBySol.get(id) ?? EMPTY_EQUIP;
    if (
      id !== "__none__" &&
      opps.length === 0 &&
      equip.targetAmount <= 0 &&
      equip.billedAmount <= 0
    ) {
      continue;
    }
    const { processAvg, mappingAvg } = scoresFor(opps, domains, weights);
    const moduleHits = opps.reduce(
      (n, o) => n + (o.moduleIds?.length ?? 0),
      0,
    );
    rows.push({
      id,
      name: sol?.name ?? (id === "__none__" ? "Sans solution" : id),
      code: sol?.code,
      oppCount: opps.filter(
        (o) =>
          clf.isWhitespaceTargetOpp(o) ||
          clf.isPipelineTargetOpp(o) ||
          clf.isOpenRenewalOpp(o),
      ).length,
      amount: equip.potentialAmount,
      processAvg,
      mappingAvg,
      moduleHits,
      opportunities: opps
        .slice()
        .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "fr")),
      equip,
    });
  }

  return rows.sort(
    (a, b) =>
      b.equip.whitespaceAmount - a.equip.whitespaceAmount ||
      b.amount - a.amount ||
      a.name.localeCompare(b.name, "fr"),
  );
}

function buildModuleRows(
  opportunities: Opportunity[],
  solutions: SolutionDef[],
  domains: ProcessDomainDef[],
  weights: MappingWeightLookup,
): ModuleRow[] {
  const oppsBySol = new Map<string, number>();
  for (const o of opportunities) {
    if (!o.solutionId) continue;
    oppsBySol.set(o.solutionId, (oppsBySol.get(o.solutionId) ?? 0) + 1);
  }

  const byMod = new Map<
    string,
    { solutionId: string; opps: Opportunity[] }
  >();

  for (const o of opportunities) {
    for (const mid of o.moduleIds ?? []) {
      const key = `${o.solutionId || "_"}:${mid}`;
      const cur = byMod.get(key) ?? {
        solutionId: o.solutionId || "",
        opps: [],
      };
      if (!cur.opps.some((x) => x.id === o.id)) cur.opps.push(o);
      byMod.set(key, cur);
    }
  }

  const rows: ModuleRow[] = [];
  for (const [key, { solutionId, opps }] of byMod) {
    const mid = key.split(":").slice(1).join(":");
    const sol = solutions.find((s) => s.id === solutionId);
    const mod = sol?.modules?.find((m) => m.id === mid);
    const { processAvg, mappingAvg } = scoresFor(opps, domains, weights);
    const solutionOppCount = oppsBySol.get(solutionId) ?? 0;
    rows.push({
      id: key,
      label: mod?.label ?? mid,
      solutionId,
      solutionName: sol?.name ?? "—",
      oppCount: opps.length,
      amount: opps.reduce((s, o) => s + (o.amount || 0), 0),
      processAvg,
      mappingAvg,
      solutionOppCount,
      presencePct: presenceRate(opps.length, solutionOppCount),
      opportunities: opps
        .slice()
        .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "fr")),
    });
  }

  return rows.sort(
    (a, b) =>
      (b.presencePct ?? -1) - (a.presencePct ?? -1) ||
      b.amount - a.amount ||
      a.solutionName.localeCompare(b.solutionName, "fr") ||
      a.label.localeCompare(b.label, "fr"),
  );
}

function fmtPct(v: number | null) {
  return v === null ? "—" : `${v}%`;
}

function pctTone(v: number | null): string {
  if (v === null) return "neutral";
  if (v >= 70) return "ok";
  if (v >= 35) return "mid";
  return "risk";
}

type Props = {
  onOpenOpportunity: (id: string) => void;
};

/** Analyse équipement + pipeline par solution et module. */
export default function DashboardCatalogueAnalysis({
  onOpenOpportunity,
}: Props) {
  const { activeSolutions, activeProcessDomains, config, catalogFeatures, kpiClassifier } =
    useOrgConfig();
  const { activeOpportunities } = useOpportunities();
  const { soldSolutions } = useSales();
  const { activeAccounts } = useDomain();
  const [filters, setFilters] = useState<Record<string, string>>({
    q: "",
    solutionId: "",
  });
  const [expandedSol, setExpandedSol] = useState<string | null>(null);
  const [expandedMod, setExpandedMod] = useState<string | null>(null);

  const mappingWeights = useMemo(
    () => mappingWeightsFromSubtypes(config.oppMappingSubtypes ?? []),
    [config.oppMappingSubtypes],
  );

  const activeAccountIds = useMemo(
    () => new Set(activeAccounts.map((a) => a.id)),
    [activeAccounts],
  );

  const scopedSales = useMemo(
    () =>
      soldSolutions.filter(
        (s) => !s.accountId || activeAccountIds.has(s.accountId),
      ),
    [soldSolutions, activeAccountIds],
  );

  const equipBySol = useMemo(
    () => buildEquipBySolution(scopedSales, activeOpportunities, kpiClassifier),
    [scopedSales, activeOpportunities, kpiClassifier],
  );

  const solutionRows = useMemo(
    () =>
      buildSolutionRows(
        activeOpportunities,
        activeSolutions,
        activeProcessDomains,
        mappingWeights,
        equipBySol,
        kpiClassifier,
      ),
    [
      activeOpportunities,
      activeSolutions,
      activeProcessDomains,
      mappingWeights,
      equipBySol,
      kpiClassifier,
    ],
  );

  const moduleRows = useMemo(
    () =>
      buildModuleRows(
        activeOpportunities,
        activeSolutions,
        activeProcessDomains,
        mappingWeights,
      ),
    [
      activeOpportunities,
      activeSolutions,
      activeProcessDomains,
      mappingWeights,
    ],
  );

  const filteredSolutions = useMemo(() => {
    const q = filters.q ?? "";
    return solutionRows.filter((r) => {
      if (filters.solutionId && r.id !== filters.solutionId) return false;
      return matchesQuery(q, r.name, r.code, String(r.oppCount));
    });
  }, [solutionRows, filters]);

  const filteredModules = useMemo(() => {
    const q = filters.q ?? "";
    return moduleRows.filter((r) => {
      if (filters.solutionId && r.solutionId !== filters.solutionId) {
        return false;
      }
      return matchesQuery(q, r.label, r.solutionName, String(r.oppCount));
    });
  }, [moduleRows, filters]);

  const totals = useMemo(() => {
    const year = new Date().getFullYear();
    const clf = kpiClassifier;
    const salesBilled = scopedSales.reduce(
      (s, l) => s + (l.billedAmount || 0),
      0,
    );
    const wonInstalled = activeOpportunities.reduce(
      (s, o) => (clf.isWonInstalledOpp(o, year) ? s + (o.amount || 0) : s),
      0,
    );
    const billed = salesBilled + wonInstalled;
    const whitespace = activeOpportunities.reduce(
      (s, o) => (clf.isWhitespaceTargetOpp(o) ? s + (o.amount || 0) : s),
      0,
    );
    const potential = activeOpportunities.reduce(
      (s, o) => (clf.isPipelineTargetOpp(o) ? s + (o.amount || 0) : s),
      0,
    );
    const renewal = activeOpportunities.reduce(
      (s, o) => (clf.isOpenRenewalOpp(o) ? s + (o.amount || 0) : s),
      0,
    );
    const target = whitespace + potential + renewal;
    const equipped = new Set<string>();
    const addressable = new Set<string>();
    for (const l of scopedSales) {
      if ((l.billedAmount || 0) > 0)
        equipped.add(`${l.accountId}:${l.solutionId}`);
    }
    for (const o of activeOpportunities) {
      if (!o.solutionId) continue;
      if (clf.isWonInstalledOpp(o, year)) {
        equipped.add(`${o.primaryAccountId}:${o.solutionId}`);
      }
      if (
        clf.isWhitespaceTargetOpp(o) ||
        clf.isPipelineTargetOpp(o) ||
        clf.isOpenRenewalOpp(o)
      ) {
        addressable.add(`${o.primaryAccountId}:${o.solutionId}`);
      }
    }
    const modulePresence = moduleRows
      .map((m) => m.presencePct)
      .filter((v): v is number => v !== null);
    return {
      amount: potential,
      oppCount: activeOpportunities.filter(
        (o) =>
          clf.isWhitespaceTargetOpp(o) ||
          clf.isPipelineTargetOpp(o) ||
          clf.isOpenRenewalOpp(o),
      ).length,
      billed,
      target,
      whitespace,
      renewal,
      equipRatePct: equipRate(billed, target),
      presencePct: presenceRate(
        equipped.size,
        Math.max(addressable.size, equipped.size),
      ),
      modulePresenceAvg: avg(modulePresence),
    };
  }, [scopedSales, activeOpportunities, moduleRows, kpiClassifier]);

  return (
    <div className="dash-catalogue-analysis">
      <header className="dash-analysis-head">
        <div>
          <h2>
            Analyse par solution
            {catalogFeatures.modules ? " & module" : ""}
          </h2>
        </div>
      </header>

      <section className="dash-analysis-kpis" aria-label="Synthèse catalogue">
        <article>
          <span>Taux d’équipement</span>
          <strong>
            <span className={`opp-score-pill tone-${pctTone(totals.equipRatePct)}`}>
              {fmtPct(totals.equipRatePct)}
            </span>
          </strong>
        </article>
        <article>
          <span>CA installé</span>
          <strong>{formatEur(totals.billed)}</strong>
        </article>
        <article>
          <span>Cible</span>
          <strong>{formatEur(totals.target)}</strong>
        </article>
        <article>
          <span>Whitespace</span>
          <strong>{formatEur(totals.whitespace)}</strong>
        </article>
        <article>
          <span>Pipeline</span>
          <strong>{formatEur(totals.amount)}</strong>
        </article>
        <article>
          <span>Renouvellement</span>
          <strong>{formatEur(totals.renewal)}</strong>
        </article>
        <article>
          <span>Présence comptes</span>
          <strong>
            <span className={`opp-score-pill tone-${pctTone(totals.presencePct)}`}>
              {fmtPct(totals.presencePct)}
            </span>
          </strong>
        </article>
        {catalogFeatures.modules && (
        <article>
          <span>Présence modules (moy.)</span>
          <strong>
            <span
              className={`opp-score-pill tone-${pctTone(totals.modulePresenceAvg)}`}
            >
              {fmtPct(totals.modulePresenceAvg)}
            </span>
          </strong>
        </article>
        )}
        <article>
          <span>Opportunités</span>
          <strong>{totals.oppCount}</strong>
        </article>
      </section>

      <SearchFilterBar
        values={filters}
        onChange={(id, value) =>
          setFilters((prev) => ({ ...prev, [id]: value }))
        }
        resultCount={filteredSolutions.length + filteredModules.length}
        resultLabel="ligne"
        fields={[
          {
            id: "q",
            kind: "search",
            placeholder: "Filtrer solution ou module…",
          },
          {
            id: "solutionId",
            kind: "select",
            label: "Solution",
            options: activeSolutions.map((s) => ({
              value: s.id,
              label: s.code ? `${s.name} (${s.code})` : s.name,
            })),
          },
        ]}
      />

      <section className="dash-analysis-block" aria-label="Par solution">
        <h3>Par solution</h3>
        <div className="ecosystem-table-wrap">
          <table className="ecosystem-table dash-analysis-table">
            <thead>
              <tr>
                <th>Solution</th>
                <th title="CA facturé / cible">Taux</th>
                <th>CA installé</th>
                <th>Cible</th>
                <th>Whitespace</th>
                <th>Pipeline</th>
                <th>Renouvellement</th>
                <th title="Comptes avec CA > 0 / comptes adressables">
                  Présence
                </th>
                <th>Opps</th>
                <th>Process</th>
                <th>Mapping</th>
                <th aria-label="Détail" />
              </tr>
            </thead>
            <tbody>
              {filteredSolutions.length === 0 ? (
                <tr>
                  <td colSpan={12} className="muted">
                    Aucune solution pour ce filtre.
                  </td>
                </tr>
              ) : (
                filteredSolutions.map((row) => (
                  <Fragment key={row.id}>
                    <tr>
                      <td>
                        <strong>{row.name}</strong>
                        {row.code ? (
                          <span className="meta">{row.code}</span>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`opp-score-pill tone-${pctTone(row.equip.equipRatePct)}`}
                        >
                          {fmtPct(row.equip.equipRatePct)}
                        </span>
                      </td>
                      <td>{formatEur(row.equip.billedAmount)}</td>
                      <td>{formatEur(row.equip.targetAmount)}</td>
                      <td>{formatEur(row.equip.whitespaceAmount)}</td>
                      <td>{formatEur(row.equip.potentialAmount)}</td>
                      <td>{formatEur(row.equip.renewalAmount)}</td>
                      <td>
                        <span
                          className={`opp-score-pill tone-${pctTone(row.equip.presencePct)}`}
                        >
                          {fmtPct(row.equip.presencePct)}
                        </span>
                        <span className="meta">
                          {row.equip.accountsEquipped}/
                          {row.equip.accountsAddressable}
                        </span>
                      </td>
                      <td>{row.oppCount}</td>
                      <td>
                        <span
                          className={`opp-score-pill tone-${pctTone(row.processAvg)}`}
                        >
                          {fmtPct(row.processAvg)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`opp-score-pill tone-${pctTone(row.mappingAvg)}`}
                        >
                          {fmtPct(row.mappingAvg)}
                        </span>
                      </td>
                      <td>
                        {row.oppCount > 0 ? (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() =>
                              setExpandedSol((cur) =>
                                cur === row.id ? null : row.id,
                              )
                            }
                          >
                            {expandedSol === row.id ? "Masquer" : "Opps"}
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                    {expandedSol === row.id && row.oppCount > 0 && (
                      <tr className="dash-analysis-detail">
                        <td colSpan={12}>
                          <ul className="dash-analysis-opp-list">
                            {row.opportunities.map((o) => (
                              <li key={o.id}>
                                <button
                                  type="button"
                                  className="ghost linkish"
                                  onClick={() => onOpenOpportunity(o.id)}
                                >
                                  {o.name}
                                </button>
                                <span className="muted">
                                  {formatEur(o.amount)}
                                </span>
                                <OppScorePills opportunity={o} compact />
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {catalogFeatures.modules && (
      <section className="dash-analysis-block" aria-label="Par module">
        <h3>Par module</h3>
        <p className="dash-analysis-hint muted">
          Présence = part des opportunités de la solution qui cochent ce module
          (proxy pipeline).
        </p>
        <div className="ecosystem-table-wrap">
          <table className="ecosystem-table dash-analysis-table">
            <thead>
              <tr>
                <th>Module</th>
                <th>Solution</th>
                <th title="Opps avec module / opps de la solution">
                  Présence
                </th>
                <th>Opps</th>
                <th>Pipeline</th>
                <th>Process</th>
                <th>Mapping</th>
                <th aria-label="Détail" />
              </tr>
            </thead>
            <tbody>
              {filteredModules.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    Aucun module sélectionné sur les opportunités filtrées.
                  </td>
                </tr>
              ) : (
                filteredModules.map((row) => (
                  <Fragment key={row.id}>
                    <tr>
                      <td>
                        <strong>{row.label}</strong>
                      </td>
                      <td>{row.solutionName}</td>
                      <td>
                        <span
                          className={`opp-score-pill tone-${pctTone(row.presencePct)}`}
                        >
                          {fmtPct(row.presencePct)}
                        </span>
                        <span className="meta">
                          {row.oppCount}/{row.solutionOppCount}
                        </span>
                      </td>
                      <td>{row.oppCount}</td>
                      <td>{formatEur(row.amount)}</td>
                      <td>
                        <span
                          className={`opp-score-pill tone-${pctTone(row.processAvg)}`}
                        >
                          {fmtPct(row.processAvg)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`opp-score-pill tone-${pctTone(row.mappingAvg)}`}
                        >
                          {fmtPct(row.mappingAvg)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            setExpandedMod((cur) =>
                              cur === row.id ? null : row.id,
                            )
                          }
                        >
                          {expandedMod === row.id ? "Masquer" : "Opps"}
                        </button>
                      </td>
                    </tr>
                    {expandedMod === row.id && (
                      <tr className="dash-analysis-detail">
                        <td colSpan={8}>
                          <ul className="dash-analysis-opp-list">
                            {row.opportunities.map((o) => (
                              <li key={o.id}>
                                <button
                                  type="button"
                                  className="ghost linkish"
                                  onClick={() => onOpenOpportunity(o.id)}
                                >
                                  {o.name}
                                </button>
                                <span className="muted">
                                  {formatEur(o.amount)}
                                </span>
                                <OppScorePills opportunity={o} compact />
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </div>
  );
}
