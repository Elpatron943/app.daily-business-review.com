import { useOrgConfig } from "./config/ConfigContext";
import type { Opportunity } from "./opportunities/OpportunityContext";
import { computeDealScore } from "./opportunities/dealScore";
import { computeProcessProgress } from "./opportunities/salesProcess";
import {
  computeMappingScorecard,
  mappingWeightsFromSubtypes,
} from "./opportunities/mappingScore";

function tone(pct: number | null): "ok" | "mid" | "risk" | "neutral" {
  if (pct === null) return "neutral";
  if (pct >= 70) return "ok";
  if (pct >= 35) return "mid";
  return "risk";
}

function mappingDisplayPct(
  masteryPct: number | null,
  covered: number,
  total: number,
): number | null {
  if (masteryPct !== null) return masteryPct;
  if (total <= 0) return null;
  return Math.round((covered / total) * 100);
}

/** Pastilles Process %, Mapping % et Score global (P×M) pour une opportunité. */
export default function OppScorePills({
  opportunity,
  compact = false,
}: {
  opportunity: Opportunity;
  compact?: boolean;
}) {
  const { activeProcessDomains, config } = useOrgConfig();
  const proc = computeProcessProgress(
    activeProcessDomains,
    opportunity.processAnswers,
  );
  const mappingWeights = mappingWeightsFromSubtypes(
    config.oppMappingSubtypes ?? [],
  );
  const mapping = computeMappingScorecard(
    opportunity.mappingChecks,
    mappingWeights,
  );
  const processPct = proc.overallPct;
  const mappingPct = mappingDisplayPct(
    mapping.masteryPct,
    mapping.covered,
    mapping.total,
  );
  const dealPct = computeDealScore(processPct, mappingPct ?? 0);

  return (
    <span
      className={`opp-score-pills${compact ? " is-compact" : ""}`}
      aria-label={`Score ${dealPct}% · Process ${processPct}% · Mapping ${
        mappingPct === null ? "—" : `${mappingPct}%`
      }`}
    >
      <span
        className={`opp-score-pill tone-${tone(dealPct)} is-deal`}
        title="Score deal (√ Process × Mapping)"
      >
        <em>S</em> {dealPct}%
      </span>
      <span
        className={`opp-score-pill tone-${tone(processPct)}`}
        title="Score Process"
      >
        <em>P</em> {processPct}%
      </span>
      <span
        className={`opp-score-pill tone-${tone(mappingPct)}`}
        title="Opportunity Mapping"
      >
        <em>M</em> {mappingPct === null ? "—" : `${mappingPct}%`}
      </span>
    </span>
  );
}
