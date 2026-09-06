import { useMemo } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import {
  type Opportunity,
  type OpportunityWhyNow,
  EMPTY_DUAL,
  EMPTY_OPPORTUNITY_WHY_NOW,
} from "./opportunities/OpportunityContext";

type Props = {
  opportunity: Opportunity;
  onUpdate: (patch: Partial<Opportunity>) => void;
};

/**
 * Pourquoi maintenant → Compelling events : date / priorisation projet.
 */
export default function OpportunityCompellingEventsPanel({
  opportunity,
  onUpdate,
}: Props) {
  const { activeCompellingEvents } = useOrgConfig();
  const whyNow = opportunity.whyNow ?? EMPTY_OPPORTUNITY_WHY_NOW;

  const ceSelected = useMemo(
    () => new Set(opportunity.compellingEventIds ?? []),
    [opportunity.compellingEventIds],
  );

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

  function toggleCe(id: string) {
    const cur = opportunity.compellingEventIds ?? [];
    const next = ceSelected.has(id)
      ? cur.filter((x) => x !== id)
      : [...cur, id];
    onUpdate({ compellingEventIds: next });
  }

  return (
    <section className="opp-whynow" aria-label="Compelling events">
      <header className="opp-whynow-head">
        <div>
          <h2>Compelling events</h2>
          <p className="muted">
            Ce qui impose une échéance et priorise le projet. Le coût
            d’inaction (onglet suivant) mesure l’ampleur pour faire avancer
            cette date.
          </p>
        </div>
      </header>

      <article className="opp-whynow-card">
        <h3>Événements</h3>
        <p className="muted opp-whynow-card-hint">
          Catalogue org (Setup → Opportunités → Intel deal).
        </p>
        {activeCompellingEvents.length === 0 ? (
          <p className="muted">Aucun compelling event configuré.</p>
        ) : (
          <ul className="opp-module-checks">
            {activeCompellingEvents.map((ce) => (
              <li key={ce.id}>
                <label title={ce.description || undefined}>
                  <input
                    type="checkbox"
                    checked={ceSelected.has(ce.id)}
                    onChange={() => toggleCe(ce.id)}
                  />
                  <span>
                    <strong>{ce.label}</strong>
                    {ce.description ? (
                      <em className="muted">{ce.description}</em>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="data-form-grid opp-whynow-dates">
          <label>
            Date cible (priorisation)
            <input
              type="date"
              value={whyNow.decisionDeadline}
              onChange={(e) =>
                patchWhyNow({ decisionDeadline: e.target.value })
              }
            />
          </label>
          <label>
            Date de close (pipeline)
            <input
              type="date"
              value={opportunity.closeDate || ""}
              onChange={(e) => onUpdate({ closeDate: e.target.value })}
            />
          </label>
        </div>
      </article>
    </section>
  );
}
