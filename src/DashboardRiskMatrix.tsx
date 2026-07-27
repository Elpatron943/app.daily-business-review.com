import { useMemo, useState } from "react";
import { formatEur, isPipelineOpportunityPhase } from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { defaultConfig } from "./config/defaults";
import { useDomain } from "./domain/DomainContext";
import {
  opportunityKindLabel,
  useOpportunities,
  type Opportunity,
} from "./opportunities/OpportunityContext";
import { computeProcessProgress } from "./opportunities/salesProcess";
import {
  computeMappingScorecard,
  mappingWeightsFromSubtypes,
  type MappingScorecard,
} from "./opportunities/mappingScore";

/** Zone Process × Opportunity Mapping. */
export type DealZone = "commitment" | "best_case" | "pipeline" | "risk";

type Props = {
  onOpenOpportunity: (opportunityId: string) => void;
  /** Filtre période : ids d’opportunités à afficher (null = toutes ouvertes). */
  scopedOpportunityIds?: Set<string> | null;
  zoneFilter?: DealZone | null;
};

type RiskPoint = {
  opportunity: Opportunity;
  accountName: string;
  processPct: number;
  mappingPct: number;
  mapping: MappingScorecard;
  zone: DealZone;
  jitterX: number;
  jitterY: number;
};

export const DEAL_ZONE_ORDER: DealZone[] = [
  "commitment",
  "best_case",
  "pipeline",
  "risk",
];

export const DEAL_ZONE_LABEL: Record<DealZone, string> = {
  commitment: "Commitment",
  best_case: "Best Case",
  pipeline: "Pipeline",
  risk: "Risque",
};

const PLOT_H = 280;
const PLOT_PAD = 16;

function hashJitter(id: string, salt: number): number {
  let h = salt >>> 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return (h % 1000) / 1000;
}

function mappingAxisPct(score: MappingScorecard): number {
  if (score.masteryPct !== null) return score.masteryPct;
  if (score.total <= 0) return 0;
  return Math.round((score.covered / score.total) * 100);
}

/**
 * Combinaison Process × Mapping (mêmes seuils que la matrice).
 * - Commitment : les deux élevés
 * - Risque : Process élevé + Mapping faible
 * - Best Case : Mapping élevé + Process pas encore élevé
 * - Pipeline : le reste
 */
export function dealZoneFromScores(
  processPct: number,
  mappingPct: number,
  highTh: number,
  lowTh: number,
): DealZone {
  const pStrong = processPct >= highTh;
  const mStrong = mappingPct >= highTh;
  const mWeak = mappingPct < lowTh;

  if (pStrong && mStrong) return "commitment";
  if (pStrong && mWeak) return "risk";
  if (mStrong && !pStrong) return "best_case";
  return "pipeline";
}

function bubbleRadius(amount: number, maxAmount: number): number {
  if (maxAmount <= 0) return 10;
  const t = Math.sqrt(Math.max(0, amount) / maxAmount);
  return 8 + t * 14;
}

function processTone(pct: number, high: number, low: number): string {
  if (pct >= high) return "tone-ok";
  if (pct < low) return "tone-risk";
  return "tone-warn";
}

function axisPct(value: number, jitter: number): string {
  const usable = 100 - (PLOT_PAD / PLOT_H) * 200;
  const base = (PLOT_PAD / PLOT_H) * 100 + (value / 100) * usable;
  const j = (jitter - 0.5) * 3;
  return `${Math.max(2, Math.min(98, base + j))}%`;
}

export default function DashboardRiskMatrix({
  onOpenOpportunity,
  scopedOpportunityIds = null,
  zoneFilter = null,
}: Props) {
  const { activeOpportunities } = useOpportunities();
  const { activeProcessDomains, config } = useOrgConfig();
  const { activeAccounts } = useDomain();
  const [hoverId, setHoverId] = useState<string | null>(null);

  const riskMatrix = config.riskMatrix ?? defaultConfig.riskMatrix;
  const highTh = riskMatrix.processHighThreshold;
  const lowTh = riskMatrix.processLowThreshold;
  const axis = riskMatrix.axisLabels;
  const mappingRiskTh = lowTh;

  const domainDefs = useMemo(
    () =>
      [...activeProcessDomains]
        .filter((d) => d.active !== false)
        .sort((a, b) => a.order - b.order),
    [activeProcessDomains],
  );

  const mappingWeights = useMemo(
    () => mappingWeightsFromSubtypes(config.oppMappingSubtypes ?? []),
    [config.oppMappingSubtypes],
  );

  const { points, maxAmount } = useMemo(() => {
    const pts: RiskPoint[] = activeOpportunities
      .filter((o) => isPipelineOpportunityPhase(o.phase))
      .filter((o) =>
        scopedOpportunityIds ? scopedOpportunityIds.has(o.id) : true,
      )
      .map((o) => {
        const { overallPct } = computeProcessProgress(
          domainDefs,
          o.processAnswers,
        );
        const mapping = computeMappingScorecard(
          o.mappingChecks,
          mappingWeights,
        );
        const mappingPct = mappingAxisPct(mapping);
        const zone = dealZoneFromScores(
          overallPct,
          mappingPct,
          highTh,
          lowTh,
        );
        const account =
          activeAccounts.find((a) => a.id === o.primaryAccountId) ?? null;
        return {
          opportunity: o,
          accountName: account?.name ?? "—",
          processPct: overallPct,
          mappingPct,
          mapping,
          zone,
          jitterX: hashJitter(o.id, 7),
          jitterY: hashJitter(o.id, 13),
        };
      });

    const maxAmt = Math.max(
      0,
      ...pts.map((p) => p.opportunity.amount || 0),
    );

    return { points: pts, maxAmount: maxAmt };
  }, [
    activeOpportunities,
    scopedOpportunityIds,
    domainDefs,
    activeAccounts,
    highTh,
    lowTh,
    mappingWeights,
  ]);

  const visiblePoints = useMemo(
    () =>
      zoneFilter ? points.filter((p) => p.zone === zoneFilter) : points,
    [points, zoneFilter],
  );

  const hovered =
    visiblePoints.find((p) => p.opportunity.id === hoverId) ?? null;
  const mappingLabel =
    !axis.pipeline || /pipeline/i.test(axis.pipeline)
      ? "Opportunity Mapping"
      : axis.pipeline;

  return (
    <section className="dash-risk" aria-label="Matrice des risques">
      <div className="dash-risk-head">
        <div className="dash-risk-head-main">
          <h2>Matrice des risques</h2>
        </div>
      </div>

      {points.length === 0 ? (
        <p className="muted">Aucune opportunité ouverte.</p>
      ) : (
        <div className="dash-scatter-frame">
          <div className="dash-scatter-y-axis" aria-hidden>
            <span>100%</span>
            <span>{axis.processHigh}</span>
            <span>0%</span>
          </div>

          <div className="dash-scatter-main">
            <div
              className="dash-scatter-plot"
              style={{ height: PLOT_H }}
              role="img"
              aria-label="Nuage Process × Opportunity Mapping"
            >
              <div
                className="dash-scatter-threshold high"
                style={{ bottom: axisPct(highTh, 0.5) }}
                title={`Seuil process élevé ${highTh}%`}
              />
              <div
                className="dash-scatter-threshold low"
                style={{ bottom: axisPct(lowTh, 0.5) }}
                title={`Seuil process faible ${lowTh}%`}
              />
              <div
                className="dash-scatter-vline mapping-high"
                style={{ left: axisPct(highTh, 0.5) }}
                title={`Seuil mapping élevé ${highTh}%`}
              />
              <div
                className="dash-scatter-vline mapping-risk"
                style={{ left: axisPct(mappingRiskTh, 0.5) }}
                title={`Seuil mapping faible ${mappingRiskTh}%`}
              />

              {points.map((p) => {
                const r = bubbleRadius(p.opportunity.amount || 0, maxAmount);
                const tone = processTone(p.processPct, highTh, lowTh);
                const dimmed =
                  zoneFilter != null && p.zone !== zoneFilter;
                return (
                  <button
                    key={p.opportunity.id}
                    type="button"
                    className={`dash-scatter-dot ${tone}${
                      p.zone === "risk" ? " is-late-weak" : ""
                    }${hoverId === p.opportunity.id ? " is-hover" : ""}${
                      dimmed ? " is-dimmed" : ""
                    }`}
                    style={{
                      left: axisPct(p.mappingPct, p.jitterX),
                      bottom: axisPct(p.processPct, p.jitterY),
                      width: r * 2,
                      height: r * 2,
                    }}
                    title={`${p.opportunity.name} · ${DEAL_ZONE_LABEL[p.zone]} · Process ${p.processPct}% · Mapping ${p.mappingPct}% · ${formatEur(p.opportunity.amount)}`}
                    onMouseEnter={() => setHoverId(p.opportunity.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onFocus={() => setHoverId(p.opportunity.id)}
                    onBlur={() => setHoverId(null)}
                    onClick={() => onOpenOpportunity(p.opportunity.id)}
                  >
                    <span className="sr-only">{p.opportunity.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="dash-scatter-x-labels continuous">
              <span>0%</span>
              <span>{mappingLabel}</span>
              <span>100%</span>
            </div>
          </div>

          <aside className="dash-scatter-legend" aria-live="polite">
            {hovered ? (
              <div className="dash-scatter-card">
                <strong>{hovered.opportunity.name}</strong>
                <span>{DEAL_ZONE_LABEL[hovered.zone]}</span>
                <span>
                  Process {hovered.processPct}% · Mapping{" "}
                  {hovered.mappingPct}%
                </span>
                <span>
                  {hovered.mapping.covered}✓ · {hovered.mapping.notMastered}✗ ·{" "}
                  {hovered.mapping.open}○ · {hovered.mapping.total} carte
                  {hovered.mapping.total !== 1 ? "s" : ""}
                </span>
                <span>{formatEur(hovered.opportunity.amount)}</span>
                <em>
                  {opportunityKindLabel[hovered.opportunity.kind]} ·{" "}
                  {hovered.accountName}
                </em>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onOpenOpportunity(hovered.opportunity.id)}
                >
                  Ouvrir
                </button>
              </div>
            ) : (
              <p className="muted">
                {zoneFilter
                  ? `${DEAL_ZONE_LABEL[zoneFilter]} · ${visiblePoints.length} deal${visiblePoints.length > 1 ? "s" : ""}`
                  : "Survole un point · clic pour ouvrir."}
              </p>
            )}
            <ul className="dash-scatter-key">
              <li>
                <i className="tone-ok" /> Process élevé
              </li>
              <li>
                <i className="tone-warn" /> Process moyen
              </li>
              <li>
                <i className="tone-risk" /> Process faible
              </li>
            </ul>
          </aside>
        </div>
      )}
    </section>
  );
}
