import { useMemo } from "react";
import { formatEur } from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import {
  computeWhyNowValue,
  type DualNumber,
  type Opportunity,
  type OpportunityWhyNow,
  EMPTY_DUAL,
  EMPTY_OPPORTUNITY_WHY_NOW,
} from "./opportunities/OpportunityContext";
import { DualField, MetricDual, formatWhyNowNum } from "./whyNowDualUi";

type Props = {
  opportunity: Opportunity;
  onUpdate: (patch: Partial<Opportunity>) => void;
};

type BoDualKey =
  | "residualEtp"
  | "attainmentPct"
  | "solutionOneShotEur"
  | "solutionAnnualEur";

/**
 * Pourquoi nous → Business Outcomes : impact après notre solution.
 */
export default function OpportunityBusinessOutcomesPanel({
  opportunity,
  onUpdate,
}: Props) {
  const { activeSolutions } = useOrgConfig();

  const whyNow = opportunity.whyNow ?? EMPTY_OPPORTUNITY_WHY_NOW;
  const value = useMemo(() => computeWhyNowValue(whyNow), [whyNow]);

  const solutionLabel = useMemo(() => {
    if (!opportunity.solutionId) return null;
    return (
      activeSolutions.find((s) => s.id === opportunity.solutionId)?.name ??
      opportunity.solutionId
    );
  }, [opportunity.solutionId, activeSolutions]);

  function patchWhyNow(patch: Partial<OpportunityWhyNow>) {
    onUpdate({
      whyNow: {
        ...EMPTY_OPPORTUNITY_WHY_NOW,
        ...whyNow,
        ...patch,
        etpAnnualCostEur: {
          ...EMPTY_DUAL,
          ...(patch.etpAnnualCostEur ?? whyNow.etpAnnualCostEur),
        },
        inactionEtp: {
          ...EMPTY_DUAL,
          ...(patch.inactionEtp ?? whyNow.inactionEtp),
        },
        inactionRisk: {
          ...EMPTY_DUAL,
          ...(patch.inactionRisk ?? whyNow.inactionRisk),
        },
        inactionEurAnnual: {
          ...EMPTY_DUAL,
          ...(patch.inactionEurAnnual ?? whyNow.inactionEurAnnual),
        },
        residualEtp: {
          ...EMPTY_DUAL,
          ...(patch.residualEtp ?? whyNow.residualEtp),
        },
        attainmentPct: {
          ...EMPTY_DUAL,
          ...(patch.attainmentPct ?? whyNow.attainmentPct),
        },
        solutionOneShotEur: {
          ...EMPTY_DUAL,
          ...(patch.solutionOneShotEur ?? whyNow.solutionOneShotEur),
        },
        solutionAnnualEur: {
          ...EMPTY_DUAL,
          ...(patch.solutionAnnualEur ?? whyNow.solutionAnnualEur),
        },
        objectiveGaps: whyNow.objectiveGaps ?? {},
        objectiveOutcomes: whyNow.objectiveOutcomes ?? {},
      },
    });
  }

  function patchDual(field: BoDualKey, side: keyof DualNumber, raw: string) {
    const cur = whyNow[field] ?? EMPTY_DUAL;
    let n = raw === "" ? 0 : Number(raw) || 0;
    if (field === "attainmentPct" && n > 0) {
      n = Math.min(100, Math.max(0, n));
    }
    patchWhyNow({
      [field]: { ...cur, [side]: n },
    });
  }

  return (
    <section className="opp-whynow" aria-label="Business Outcomes">
      <header className="opp-whynow-head">
        <div>
          <h2>Business Outcomes</h2>
          <p className="muted">
            Impact après mise en place de{" "}
            <strong>{solutionLabel ?? "notre solution"}</strong> — face au
            coût d’inaction (Pourquoi maintenant). Peut varier selon les
            fonctionnalités vs concurrents.
          </p>
        </div>
      </header>

      <article className="opp-whynow-card opp-whynow-outcomes">
        <h3>Après notre solution</h3>
        <p className="muted opp-whynow-card-hint">
          Temps résiduel (en baisse vs CoI) et % d’amélioration / couverture du
          problème. Prospect = client, Hypothèse = nous.
        </p>
        <div className="opp-whynow-metric-grid">
          <MetricDual
            label="ETP résiduel"
            value={whyNow.residualEtp ?? EMPTY_DUAL}
            onChange={(side, raw) => patchDual("residualEtp", side, raw)}
          />
          <MetricDual
            label="% d’impact / atteinte"
            value={whyNow.attainmentPct ?? EMPTY_DUAL}
            min={0}
            max={100}
            onChange={(side, raw) => patchDual("attainmentPct", side, raw)}
          />
        </div>
      </article>

      <article className="opp-whynow-card">
        <h3>Coût de notre solution</h3>
        <div className="opp-whynow-dual-deal">
          <DualField
            label="Investissement one-shot (€)"
            value={whyNow.solutionOneShotEur ?? EMPTY_DUAL}
            onChange={(side, raw) =>
              patchDual("solutionOneShotEur", side, raw)
            }
          />
          <DualField
            label="Coût annuel solution (€)"
            value={whyNow.solutionAnnualEur ?? EMPTY_DUAL}
            onChange={(side, raw) =>
              patchDual("solutionAnnualEur", side, raw)
            }
          />
          <label className="opp-whynow-horizon">
            Horizon (années)
            <input
              type="number"
              min={1}
              max={20}
              value={whyNow.horizonYears || 3}
              onChange={(e) =>
                patchWhyNow({
                  horizonYears: Math.max(
                    1,
                    Math.min(20, Number(e.target.value) || 3),
                  ),
                })
              }
            />
          </label>
        </div>
      </article>

      <div className="opp-whynow-kpis" aria-label="Synthèse valeur">
        <article>
          <span>Coût d’inaction / an (réf.)</span>
          <strong>{formatEur(value.gapEurTotal)}</strong>
        </article>
        <article>
          <span>ETP évités</span>
          <strong>{formatWhyNowNum(value.etpAvoided)}</strong>
        </article>
        <article>
          <span>Bénéfice net / an</span>
          <strong>{formatEur(value.annualBenefit)}</strong>
        </article>
        <article>
          <span>Investissement</span>
          <strong>{formatEur(value.solutionOneShot)}</strong>
        </article>
        <article>
          <span>Valeur nette ({value.horizonYears} ans)</span>
          <strong className={value.netValue >= 0 ? "positive" : "negative"}>
            {formatEur(value.netValue)}
          </strong>
        </article>
        <article>
          <span>ROI</span>
          <strong>
            {value.roiPct == null ? "—" : `${value.roiPct} %`}
          </strong>
        </article>
        <article>
          <span>Payback</span>
          <strong>
            {value.paybackMonths == null
              ? "—"
              : `${value.paybackMonths} mois`}
          </strong>
        </article>
        <article>
          <span>% impact</span>
          <strong>
            {value.avgAttainmentPct == null
              ? "—"
              : `${value.avgAttainmentPct} %`}
          </strong>
        </article>
      </div>
    </section>
  );
}
