import { useMemo, useState } from "react";
import { formatEur, isPipelineOpportunityPhase, isWhitespacePhase } from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { defaultConfig } from "./config/defaults";
import { useDomain } from "./domain/DomainContext";
import { useMarketKpis } from "./MarketView";
import type { AppPage } from "./navigation";
import AccountPlanPage from "./AccountPlanPage";
import DashboardCatalogueAnalysis from "./DashboardCatalogueAnalysis";
import DashboardRiskMatrix, {
  DEAL_ZONE_LABEL,
  DEAL_ZONE_ORDER,
  dealZoneFromScores,
  type DealZone,
} from "./DashboardRiskMatrix";
import {
  useOpportunities,
  type Opportunity,
} from "./opportunities/OpportunityContext";
import { computeProcessProgress } from "./opportunities/salesProcess";
import { openOpportunityDetail } from "./opportunities/oppNavigation";
import {
  computeMappingScorecard,
  mappingWeightsFromSubtypes,
  type MappingWeightLookup,
} from "./opportunities/mappingScore";

type DashTab = "overview" | "account-plans" | "catalogue";
type DashPeriod = "month" | "quarter" | "year";

type ZoneedOpp = {
  opportunity: Opportunity;
  accountName: string;
  processPct: number;
  mappingPct: number;
  zone: DealZone;
};

const PERIOD_LABEL: Record<DashPeriod, string> = {
  month: "Mois",
  quarter: "Trimestre",
  year: "Année",
};

function mappingPctOf(
  opportunity: Opportunity,
  weights: MappingWeightLookup,
): number {
  const score = computeMappingScorecard(opportunity.mappingChecks, weights);
  if (score.masteryPct !== null) return score.masteryPct;
  if (score.total <= 0) return 0;
  return Math.round((score.covered / score.total) * 100);
}

/** Filtre closeDate sur le mois / trimestre / année calendaires courants. */
function inClosePeriod(
  closeDate: string | undefined,
  period: DashPeriod,
  now = new Date(),
): boolean {
  if (!closeDate) return false;
  const d = new Date(`${closeDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  if (d.getFullYear() !== now.getFullYear()) return false;
  if (period === "year") return true;
  if (period === "month") return d.getMonth() === now.getMonth();
  return Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3);
}

export default function DashboardPage({
  onNavigate,
}: {
  onNavigate: (page: AppPage) => void;
}) {
  const { activeAccounts } = useDomain();
  const { activeProcessDomains, config, catalogFeatures } = useOrgConfig();
  const { activeOpportunities, setActiveOpportunityId } = useOpportunities();
  const market = useMarketKpis();

  const mappingWeights = useMemo(
    () => mappingWeightsFromSubtypes(config.oppMappingSubtypes ?? []),
    [config.oppMappingSubtypes],
  );

  const [tab, setTab] = useState<DashTab>("overview");
  const [period, setPeriod] = useState<DashPeriod>("quarter");
  const [zoneFilter, setZoneFilter] = useState<DealZone | null>(null);

  function openOpportunity(id: string, oppTab?: string) {
    openOpportunityDetail(id, { type: "dashboard" });
    if (oppTab) {
      try {
        sessionStorage.setItem("powermap.openOppTab", oppTab);
      } catch {
        /* ignore */
      }
    }
    setActiveOpportunityId(id);
    onNavigate("opportunites");
  }

  const riskMatrix = config.riskMatrix ?? defaultConfig.riskMatrix;
  const lowTh = riskMatrix.processLowThreshold;
  const highTh = riskMatrix.processHighThreshold;

  const scopedOpps = useMemo(
    () =>
      activeOpportunities.filter(
        (o) =>
          isPipelineOpportunityPhase(o.phase) &&
          inClosePeriod(o.closeDate, period),
      ),
    [activeOpportunities, period],
  );

  const whitespaceOpps = useMemo(
    () =>
      activeOpportunities.filter(
        (o) =>
          isWhitespacePhase(o.phase) && inClosePeriod(o.closeDate, period),
      ),
    [activeOpportunities, period],
  );

  const renewalOpps = useMemo(
    () =>
      activeOpportunities.filter(
        (o) =>
          o.kind === "renewal" &&
          o.phase !== "Closed Lost" &&
          inClosePeriod(o.closeDate, period),
      ),
    [activeOpportunities, period],
  );

  const scopedOpportunityIds = useMemo(
    () => new Set(scopedOpps.map((o) => o.id)),
    [scopedOpps],
  );

  const overview = useMemo(() => {
    const zoned: ZoneedOpp[] = [];

    for (const o of scopedOpps) {
      const processPct = computeProcessProgress(
        activeProcessDomains,
        o.processAnswers,
      ).overallPct;
      const mappingPct = mappingPctOf(o, mappingWeights);
      const zone = dealZoneFromScores(processPct, mappingPct, highTh, lowTh);
      const account =
        activeAccounts.find((a) => a.id === o.primaryAccountId) ?? null;
      zoned.push({
        opportunity: o,
        accountName: account?.name ?? o.primaryAccountId,
        processPct,
        mappingPct,
        zone,
      });
    }

    const zoneCards = DEAL_ZONE_ORDER.map((id) => {
      const rows = zoned.filter((r) => r.zone === id);
      return {
        id,
        label: DEAL_ZONE_LABEL[id],
        count: rows.length,
        amount: rows.reduce((s, r) => s + (r.opportunity.amount || 0), 0),
      };
    });

    return {
      zoneCards,
      caInstalled: market.clients.billedAmount,
      whitespaceAmount: whitespaceOpps.reduce(
        (s, o) => s + (o.amount || 0),
        0,
      ),
      whitespaceCount: whitespaceOpps.length,
      renewalAmount: renewalOpps.reduce((s, o) => s + (o.amount || 0), 0),
      renewalCount: renewalOpps.length,
    };
  }, [
    scopedOpps,
    whitespaceOpps,
    renewalOpps,
    activeProcessDomains,
    activeAccounts,
    highTh,
    lowTh,
    mappingWeights,
    market.clients.billedAmount,
  ]);

  return (
    <div className="dashboard">
      <header className="data-page-head">
        <div>
          <h1>Dashboard</h1>
        </div>
      </header>

      <nav className="dash-tabs" aria-label="Sections dashboard">
        <button
          type="button"
          className={tab === "overview" ? "active" : ""}
          onClick={() => setTab("overview")}
        >
          Vue d’ensemble
        </button>
        <button
          type="button"
          className={tab === "account-plans" ? "active" : ""}
          onClick={() => setTab("account-plans")}
        >
          Account plans
        </button>
        <button
          type="button"
          className={tab === "catalogue" ? "active" : ""}
          onClick={() => setTab("catalogue")}
        >
          Solutions
          {catalogFeatures.modules ? " & modules" : ""}
        </button>
      </nav>

      {tab === "account-plans" ? (
        <AccountPlanPage embedded layout="kanban" />
      ) : tab === "catalogue" ? (
        <DashboardCatalogueAnalysis
          onOpenOpportunity={(id) => openOpportunity(id)}
        />
      ) : (
        <>
          <div className="dash-period-bar">
            <div
              className="dash-period-toggle"
              role="group"
              aria-label="Période"
            >
              {(["month", "quarter", "year"] as DashPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={period === p ? "active" : ""}
                  onClick={() => setPeriod(p)}
                >
                  {PERIOD_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          <section
            className="dash-kpis dash-kpis-priority"
            aria-label="Indicateurs"
          >
            {overview.zoneCards.map((card) => (
              <button
                key={card.id}
                type="button"
                className={`dash-kpi zone-${card.id}${
                  zoneFilter === card.id ? " is-active" : ""
                }${card.id === "risk" && card.count > 0 ? " is-risk" : ""}`}
                aria-pressed={zoneFilter === card.id}
                onClick={() =>
                  setZoneFilter((prev) => (prev === card.id ? null : card.id))
                }
              >
                <span>{card.label}</span>
                <strong>{formatEur(card.amount)}</strong>
                <em className="dash-kpi-meta">
                  {card.count} deal{card.count > 1 ? "s" : ""}
                </em>
              </button>
            ))}

            <button
              type="button"
              className="dash-kpi"
              onClick={() => onNavigate("map")}
            >
              <span>CA installé</span>
              <strong>{formatEur(overview.caInstalled)}</strong>
              <em className="dash-kpi-meta">Clients</em>
            </button>

            <button
              type="button"
              className="dash-kpi dash-kpi-renewal"
              onClick={() => onNavigate("opportunites")}
            >
              <span>Renouvellement</span>
              <strong>{formatEur(overview.renewalAmount)}</strong>
              <em className="dash-kpi-meta">
                {overview.renewalCount} deal
                {overview.renewalCount > 1 ? "s" : ""}
              </em>
            </button>

            <button
              type="button"
              className="dash-kpi"
              onClick={() => onNavigate("opportunites")}
            >
              <span>Whitespace</span>
              <strong>{formatEur(overview.whitespaceAmount)}</strong>
              <em className="dash-kpi-meta">
                {overview.whitespaceCount} à qualifier
              </em>
            </button>
          </section>

          <DashboardRiskMatrix
            onOpenOpportunity={(id) => openOpportunity(id, "process")}
            scopedOpportunityIds={scopedOpportunityIds}
            zoneFilter={zoneFilter}
          />
        </>
      )}
    </div>
  );
}
