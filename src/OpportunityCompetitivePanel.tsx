import { useMemo, Fragment } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import {
  FEATURE_COVERAGES,
  type FeatureCoverage,
  type SolutionBattleFeatureDef,
} from "./config/types";
import type {
  Opportunity,
  OppFeatureAssessment,
  OppFeatureImportance,
} from "./opportunities/OpportunityContext";

type Props = {
  opportunity: Opportunity;
  onUpdate: (patch: Partial<Opportunity>) => void;
  onNavigateTab?: (tab: "fiche" | "process" | "mapping") => void;
};

function coverageLabel(v: FeatureCoverage): string {
  return FEATURE_COVERAGES.find((c) => c.id === v)?.label ?? v;
}

function coverageRank(v: FeatureCoverage): number {
  if (v === "full") return 2;
  if (v === "partial") return 1;
  return 0;
}

export default function OpportunityCompetitivePanel({
  opportunity,
  onUpdate,
  onNavigateTab,
}: Props) {
  const { config } = useOrgConfig();

  const solution = useMemo(
    () =>
      config.solutions.find((s) => s.id === opportunity.solutionId) ?? null,
    [config.solutions, opportunity.solutionId],
  );

  const solutionCompetitors = useMemo(
    () =>
      [...(solution?.competitors ?? [])]
        .filter((c) => c.active)
        .sort(
          (a, b) => a.order - b.order || a.name.localeCompare(b.name, "fr"),
        ),
    [solution],
  );

  const selectedCompetitorIds = useMemo(
    () => new Set(opportunity.competitorIds ?? []),
    [opportunity.competitorIds],
  );

  const dealCompetitors = useMemo(
    () =>
      solutionCompetitors.filter((c) => selectedCompetitorIds.has(c.id)),
    [solutionCompetitors, selectedCompetitorIds],
  );

  const features = useMemo(
    () =>
      [...(solution?.features ?? [])]
        .filter((f) => f.active)
        .sort((a, b) => a.order - b.order),
    [solution],
  );

  const groups = useMemo(
    () =>
      [...(solution?.featureGroups ?? [])]
        .filter((g) => g.active)
        .sort((a, b) => a.order - b.order),
    [solution],
  );

  const groupedFeatures = useMemo(() => {
    const sections: {
      key: string;
      label: string;
      items: SolutionBattleFeatureDef[];
    }[] = [];
    const groupIds = new Set(groups.map((g) => g.id));
    for (const g of groups) {
      sections.push({
        key: g.id,
        label: g.label || "Groupe",
        items: features.filter((f) => f.groupId === g.id),
      });
    }
    const ungrouped = features.filter(
      (f) => !f.groupId || !groupIds.has(f.groupId),
    );
    if (ungrouped.length > 0) {
      sections.push({
        key: "_none",
        label: groups.length ? "Hors regroupement" : "Features",
        items: ungrouped,
      });
    }
    return sections.filter((s) => s.items.length > 0);
  }, [groups, features]);

  function assessmentOf(featureId: string): OppFeatureAssessment {
    return (
      opportunity.featureAssessments?.[featureId] ?? {
        clientNeed: false,
        importance: 2,
      }
    );
  }

  const board = useMemo(() => {
    let ourAdvantage = 0;
    let criticalExpected = 0;
    let advantageAndCritical = 0;
    let threat = 0;

    for (const f of features) {
      const assessment = opportunity.featureAssessments?.[f.id] ?? {
        clientNeed: false,
        importance: 2 as OppFeatureImportance,
      };
      const isCriticalExpected =
        assessment.clientNeed === true && assessment.importance === 3;
      if (isCriticalExpected) criticalExpected += 1;

      const our = coverageRank(f.ourCoverage);
      let isAdvantage = false;
      let isThreat = false;

      if (dealCompetitors.length > 0) {
        const bestRival = Math.max(
          ...dealCompetitors.map((c) =>
            coverageRank(c.featureCoverage?.[f.id] ?? "none"),
          ),
        );
        isAdvantage = our > bestRival;
        // Menace : besoin critique attendu, nous en retard (partiel/absent), concurrent mieux.
        isThreat =
          isCriticalExpected && our < 2 && bestRival > our;
      }
      if (isAdvantage) ourAdvantage += 1;
      if (isAdvantage && isCriticalExpected) advantageAndCritical += 1;
      if (isThreat) threat += 1;
    }

    return { ourAdvantage, criticalExpected, advantageAndCritical, threat };
  }, [features, dealCompetitors, opportunity.featureAssessments]);

  function toggleCompetitor(id: string) {
    const cur = opportunity.competitorIds ?? [];
    const next = selectedCompetitorIds.has(id)
      ? cur.filter((x) => x !== id)
      : [...cur, id];
    onUpdate({ competitorIds: next });
  }

  function patchAssessment(
    featureId: string,
    patch: Partial<OppFeatureAssessment>,
  ) {
    const prev = assessmentOf(featureId);
    onUpdate({
      featureAssessments: {
        ...(opportunity.featureAssessments ?? {}),
        [featureId]: {
          clientNeed: patch.clientNeed ?? prev.clientNeed,
          importance: patch.importance ?? prev.importance,
        },
      },
    });
  }

  const coverageColSpan = 3 + dealCompetitors.length;

  return (
    <section className="opp-competitive" aria-label="Concurrence du deal">
      <header className="opp-competitive-head">
        <div>
          <h2>Concurrence</h2>
          <p className="muted">
            Features, concurrents retenus et couverture sur ce deal.
          </p>
        </div>
      </header>

      <div className="opp-competitive-board" aria-label="Synthèse différenciants">
        <div className="opp-competitive-kpi">
          <span className="opp-competitive-kpi-value">{board.ourAdvantage}</span>
          <span className="opp-competitive-kpi-label">
            Différenciants à notre avantage
          </span>
          <span className="muted">
            {dealCompetitors.length === 0
              ? "Cochez un concurrent pour calculer"
              : `vs ${dealCompetitors.length} concurrent${dealCompetitors.length > 1 ? "s" : ""}`}
          </span>
        </div>
        <div className="opp-competitive-kpi">
          <span className="opp-competitive-kpi-value">
            {board.criticalExpected}
          </span>
          <span className="opp-competitive-kpi-label">
            Critiques · attendues client
          </span>
          <span className="muted">Importance 3 + besoin attendu</span>
        </div>
        <div className="opp-competitive-kpi is-accent">
          <span className="opp-competitive-kpi-value">
            {board.advantageAndCritical}
          </span>
          <span className="opp-competitive-kpi-label">
            Avantage × critique attendue
          </span>
          <span className="muted">Différenciants clés à pousser</span>
        </div>
        <div className="opp-competitive-kpi is-threat">
          <span className="opp-competitive-kpi-value">{board.threat}</span>
          <span className="opp-competitive-kpi-label">Menaces</span>
          <span className="muted">
            Critique attendue · nous partiel/absent · concurrent mieux
          </span>
        </div>
      </div>

      <article
        className="opp-competitive-block"
        aria-label="Concurrents du deal"
      >
        <h3>Concurrents</h3>
        {!solution ? (
          <p className="muted opp-competitive-empty">
            Sélectionnez d’abord une solution sur la Fiche.
            {onNavigateTab ? (
              <>
                {" "}
                <button
                  type="button"
                  className="ghost linkish"
                  onClick={() => onNavigateTab("fiche")}
                >
                  Ouvrir la Fiche
                </button>
              </>
            ) : null}
          </p>
        ) : (
          <div className="opp-competitive-split">
            <div>
              <h4>Features</h4>
              {features.length === 0 ? (
                <p className="muted opp-competitive-empty">
                  Aucune feature sur cette solution (Setup → Catalogue).
                </p>
              ) : (
                <ul className="opp-competitive-feature-list">
                  {groupedFeatures.map((section) => (
                    <li
                      key={section.key}
                      className="opp-competitive-feature-group"
                    >
                      <em>{section.label}</em>
                      <ul>
                        {section.items.map((f) => (
                          <li key={f.id}>{f.label}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4>Produits concurrents</h4>
              {solutionCompetitors.length === 0 ? (
                <p className="muted opp-competitive-empty">
                  Aucun concurrent sur cette solution. Ajoutez-en dans Setup →
                  Catalogue solutions.
                </p>
              ) : (
                <ul className="opp-module-checks opp-competitive-comp-checks">
                  {solutionCompetitors.map((c) => {
                    const on = selectedCompetitorIds.has(c.id);
                    return (
                      <li key={c.id}>
                        <label title={c.description || undefined}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleCompetitor(c.id)}
                          />
                          {c.name}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {dealCompetitors.length > 0 ? (
                <p className="muted opp-competitive-hint">
                  {dealCompetitors.length} concurrent
                  {dealCompetitors.length > 1 ? "s" : ""} retenu
                  {dealCompetitors.length > 1 ? "s" : ""} sur ce deal.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </article>

      <article
        className="opp-competitive-block opp-competitive-matrix-wrap"
        aria-label="Couverture features"
      >
        <h3>Couverture features</h3>
        {!solution ? (
          <p className="muted opp-competitive-empty">
            Aucune solution sélectionnée.
          </p>
        ) : features.length === 0 ? (
          <p className="muted opp-competitive-empty">
            Aucune feature configurée sur cette solution (Setup → Catalogue).
          </p>
        ) : (
          <div className="opp-competitive-matrix-scroll">
            <table className="opp-competitive-matrix sol-battle-matrix">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">Besoin client</th>
                  <th scope="col">Importance</th>
                  <th scope="col">Nous</th>
                  {dealCompetitors.map((c) => (
                    <th key={c.id} scope="col">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedFeatures.map((section) => (
                  <Fragment key={section.key}>
                    <tr className="sol-battle-group-row">
                      <td colSpan={coverageColSpan}>
                        <em>{section.label}</em>
                      </td>
                    </tr>
                    {section.items.map((f) => {
                      const assessment = assessmentOf(f.id);
                      return (
                        <tr key={f.id}>
                          <th scope="row">{f.label}</th>
                          <td>
                            <label className="opp-feature-need">
                              <input
                                type="checkbox"
                                checked={assessment.clientNeed}
                                onChange={(e) =>
                                  patchAssessment(f.id, {
                                    clientNeed: e.target.checked,
                                  })
                                }
                              />
                              Attendu
                            </label>
                          </td>
                          <td>
                            <select
                              className="opp-feature-importance"
                              value={assessment.importance}
                              aria-label={`Importance · ${f.label}`}
                              onChange={(e) =>
                                patchAssessment(f.id, {
                                  importance: Number(
                                    e.target.value,
                                  ) as OppFeatureImportance,
                                })
                              }
                            >
                              <option value={1}>1 · Faible</option>
                              <option value={2}>2 · Moyen</option>
                              <option value={3}>3 · Fort</option>
                            </select>
                          </td>
                          <td>
                            <span
                              className={`sol-coverage-pill sol-coverage-${f.ourCoverage}`}
                            >
                              {coverageLabel(f.ourCoverage)}
                            </span>
                          </td>
                          {dealCompetitors.map((c) => {
                            const cov =
                              c.featureCoverage?.[f.id] ?? ("none" as const);
                            return (
                              <td key={c.id}>
                                <span
                                  className={`sol-coverage-pill sol-coverage-${cov}`}
                                >
                                  {coverageLabel(cov)}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {dealCompetitors.length === 0 ? (
              <p className="muted opp-competitive-hint">
                Cochez un concurrent ci-dessus pour comparer les couvertures.
              </p>
            ) : null}
          </div>
        )}
      </article>
    </section>
  );
}
