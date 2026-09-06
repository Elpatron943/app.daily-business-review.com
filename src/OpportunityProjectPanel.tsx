import { useMemo } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import type { Opportunity } from "./opportunities/OpportunityContext";

type Props = {
  opportunity: Opportunity;
  onUpdate: (patch: Partial<Opportunity>) => void;
};

/**
 * Onglet Projet : problèmes à résoudre + leviers (pourquoi y a-t-il un projet).
 */
export default function OpportunityProjectPanel({
  opportunity,
  onUpdate,
}: Props) {
  const {
    activeProjectLeverFamilies,
    activeProjectLevers,
    activeProjectProblemFamilies,
    activeProjectProblems,
  } = useOrgConfig();

  const selectedProblems = useMemo(
    () => new Set(opportunity.projectProblemIds ?? []),
    [opportunity.projectProblemIds],
  );

  const selectedLevers = useMemo(
    () => new Set(opportunity.projectLeverIds ?? []),
    [opportunity.projectLeverIds],
  );

  const problemSections = useMemo(() => {
    return activeProjectProblemFamilies
      .map((family) => ({
        family,
        problems: activeProjectProblems.filter((p) => p.familyId === family.id),
      }))
      .filter((s) => s.problems.length > 0);
  }, [activeProjectProblemFamilies, activeProjectProblems]);

  const leverSections = useMemo(() => {
    return activeProjectLeverFamilies
      .map((family) => ({
        family,
        levers: activeProjectLevers.filter((l) => l.familyId === family.id),
      }))
      .filter((s) => s.levers.length > 0);
  }, [activeProjectLeverFamilies, activeProjectLevers]);

  const problemCount = useMemo(
    () => activeProjectProblems.filter((p) => selectedProblems.has(p.id)).length,
    [activeProjectProblems, selectedProblems],
  );

  const leverCount = useMemo(
    () => activeProjectLevers.filter((l) => selectedLevers.has(l.id)).length,
    [activeProjectLevers, selectedLevers],
  );

  function toggleProblem(id: string) {
    const cur = opportunity.projectProblemIds ?? [];
    const next = selectedProblems.has(id)
      ? cur.filter((x) => x !== id)
      : [...cur, id];
    onUpdate({ projectProblemIds: next });
  }

  function toggleLever(id: string) {
    const cur = opportunity.projectLeverIds ?? [];
    const next = selectedLevers.has(id)
      ? cur.filter((x) => x !== id)
      : [...cur, id];
    onUpdate({ projectLeverIds: next });
  }

  return (
    <section className="opp-project" aria-label="Projet">
      <header className="opp-project-head">
        <div>
          <h2>Projet</h2>
          <p className="muted">
            Quel problème veulent-ils résoudre — et pourquoi considérer qu’il y
            a un vrai projet ?
          </p>
        </div>
        <p className="opp-project-count">
          <strong>{problemCount}</strong> problème
          {problemCount !== 1 ? "s" : ""}
          {" · "}
          <strong>{leverCount}</strong> levier
          {leverCount !== 1 ? "s" : ""}
        </p>
      </header>

      <div className="opp-project-levers-head">
        <h3>Problème(s) à résoudre</h3>
        <p className="muted">
          Cochez les problèmes client. Configurable dans Setup → Opportunités →
          Problèmes projet.
        </p>
      </div>

      {problemSections.length === 0 ? (
        <p className="muted">
          Aucun problème configuré. Ajoutez des familles et cases dans Setup →
          Opportunités → Problèmes projet.
        </p>
      ) : (
        <div className="opp-project-families">
          {problemSections.map(({ family, problems }) => {
            const familyChecked = problems.filter((p) =>
              selectedProblems.has(p.id),
            ).length;
            return (
              <article
                key={family.id}
                className="opp-project-family"
                aria-label={family.label}
              >
                <header>
                  <h3>{family.label}</h3>
                  {family.description ? (
                    <p className="muted">{family.description}</p>
                  ) : null}
                  <span className="opp-project-family-count">
                    {familyChecked}/{problems.length}
                  </span>
                </header>
                <ul className="opp-module-checks opp-project-checks">
                  {problems.map((p) => {
                    const on = selectedProblems.has(p.id);
                    return (
                      <li key={p.id}>
                        <label title={p.description || undefined}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleProblem(p.id)}
                          />
                          <span>
                            <strong>{p.label}</strong>
                            {p.description ? (
                              <em className="muted">{p.description}</em>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      )}

      <div className="opp-project-levers-head">
        <h3>Leviers projet</h3>
        <p className="muted">
          Signaux qui confirment qu’un projet se structure autour de ces
          problèmes.
        </p>
      </div>

      {leverSections.length === 0 ? (
        <p className="muted">
          Aucun levier projet configuré. Ajoutez des familles et critères dans
          Setup → Opportunités → Leviers projet.
        </p>
      ) : (
        <div className="opp-project-families">
          {leverSections.map(({ family, levers }) => {
            const familyChecked = levers.filter((l) =>
              selectedLevers.has(l.id),
            ).length;
            return (
              <article
                key={family.id}
                className="opp-project-family"
                aria-label={family.label}
              >
                <header>
                  <h3>{family.label}</h3>
                  {family.description ? (
                    <p className="muted">{family.description}</p>
                  ) : null}
                  <span className="opp-project-family-count">
                    {familyChecked}/{levers.length}
                  </span>
                </header>
                <ul className="opp-module-checks opp-project-checks">
                  {levers.map((l) => {
                    const on = selectedLevers.has(l.id);
                    return (
                      <li key={l.id}>
                        <label title={l.description || undefined}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleLever(l.id)}
                          />
                          <span>
                            <strong>{l.label}</strong>
                            {l.description ? (
                              <em className="muted">{l.description}</em>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
