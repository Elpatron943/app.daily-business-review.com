import { useMemo } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import {
  computeProcessProgress,
  funnelMidPhases,
} from "./opportunities/salesProcess";
import {
  computeMappingScorecard,
  mappingWeightsFromSubtypes,
} from "./opportunities/mappingScore";
import {
  diagnoseOpportunity,
  type FindingSeverity,
} from "./opportunities/dealDiagnosis";
import type { Opportunity } from "./opportunities/OpportunityContext";

type Props = {
  opportunity: Opportunity;
  onStartReview?: () => void;
};

const SEV_LABEL: Record<FindingSeverity, string> = {
  bloquant: "Bloquant",
  risque: "Risque",
  vigilance: "Vigilance",
};

export default function DealBlockersPanel({
  opportunity,
  onStartReview,
}: Props) {
  const { activeContacts, activeAccounts } = useDomain();
  const { activeProcessDomains, config, activeOppPhases } = useOrgConfig();

  const findings = useMemo(() => {
    const proc = computeProcessProgress(
      activeProcessDomains,
      opportunity.processAnswers,
    );
    const weights = mappingWeightsFromSubtypes(config.oppMappingSubtypes ?? []);
    const mapping = computeMappingScorecard(opportunity.mappingChecks, weights);
    const mappingPct =
      mapping.masteryPct !== null
        ? mapping.masteryPct
        : mapping.total > 0
          ? Math.round((mapping.covered / mapping.total) * 100)
          : null;

    const mid = funnelMidPhases(activeOppPhases).map((p) => p.id);
    const phaseOrder = [
      "Whitespace",
      ...mid,
      "Closed Won",
      "Closed Lost",
    ];

    return diagnoseOpportunity({
      opportunity,
      contacts: activeContacts.map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title,
        accountId: c.accountId,
      })),
      accounts: activeAccounts.map((a) => ({
        id: a.id,
        type: a.type,
        holdingId: a.holdingId,
      })),
      processDomains: activeProcessDomains,
      phaseOrder,
      processPct: proc.overallPct,
      mappingPct,
    });
  }, [
    opportunity,
    activeContacts,
    activeAccounts,
    activeProcessDomains,
    activeOppPhases,
    config.oppMappingSubtypes,
  ]);

  if (findings.length === 0) {
    return (
      <section className="deal-blockers-panel">
        <header className="deal-blockers-head">
          <h3>Points de blocage</h3>
          <span className="deal-blockers-ok">Aucun constat bloquant</span>
        </header>
        <p className="muted">
          La grille ne détecte pas de risque structuré sur les données
          actuelles. Tu peux quand même lancer une revue pour challenger le
          deal.
        </p>
        {onStartReview ? (
          <button type="button" onClick={onStartReview}>
            Lancer une revue
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="deal-blockers-panel">
      <header className="deal-blockers-head">
        <div>
          <h3>Points de blocage</h3>
          <p className="muted">
            Diagnostic déterministe — {findings.length} constat
            {findings.length > 1 ? "s" : ""} (code, pas IA).
          </p>
        </div>
        {onStartReview ? (
          <button type="button" onClick={onStartReview}>
            Challenger avec le directeur commercial
          </button>
        ) : null}
      </header>
      <ul className="deal-blockers-list">
        {findings.map((f) => (
          <li
            key={`${f.code}-${f.fact.slice(0, 40)}`}
            className={`deal-blocker-item sev-${f.severity}`}
          >
            <div className="deal-blocker-meta">
              <span className="deal-blocker-code">{f.code}</span>
              <span className={`deal-blocker-sev sev-${f.severity}`}>
                {SEV_LABEL[f.severity]}
              </span>
              <span className="muted">{f.family}</span>
            </div>
            <p className="deal-blocker-fact">{f.fact}</p>
            <p className="deal-blocker-q">
              <strong>Challenge — </strong>
              {f.question}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
