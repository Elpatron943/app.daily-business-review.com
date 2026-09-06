import type { Opportunity } from "../opportunities/OpportunityContext";
import type { SolutionDef } from "../config/types";
import { useOrgConfig } from "../config/ConfigContext";

type Props = {
  opportunity: Opportunity;
  solutions: SolutionDef[];
  onUpdate: (patch: Partial<Opportunity>) => void;
};

/** Offre (solution / modules) et personas info sur la fiche. */
export default function OpportunityCatalogueFields({
  opportunity,
  solutions,
  onUpdate,
}: Props) {
  const { catalogFeatures, activePersonae } = useOrgConfig();
  const activeSolutions = solutions.filter((s) => s.active);
  const selectedSolution =
    activeSolutions.find((s) => s.id === opportunity.solutionId) ??
    solutions.find((s) => s.id === opportunity.solutionId) ??
    null;
  const solutionModules = (selectedSolution?.modules ?? []).filter(
    (m) => m.active,
  );
  const selectedPersonaIds = opportunity.personaIds ?? [];

  return (
    <>
      <section className="opp-catalogue" aria-label="Catalogue">
        <h3>Catalogue</h3>
        {catalogFeatures.solutions && (
          <div className="data-form-grid">
            <label>
              Solution
              <select
                value={opportunity.solutionId}
                onChange={(e) =>
                  onUpdate({
                    solutionId: e.target.value,
                    moduleIds: [],
                  })
                }
              >
                <option value="">— Aucune —</option>
                {activeSolutions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.code ? ` (${s.code})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {catalogFeatures.modules && selectedSolution && (
          <div className="opp-modules">
            <h4>Modules</h4>
            {solutionModules.length === 0 ? (
              <p className="muted">
                Aucun module actif sur {selectedSolution.name}.
              </p>
            ) : (
              <ul className="opp-module-checks">
                {solutionModules.map((m) => {
                  const checked = opportunity.moduleIds.includes(m.id);
                  const uspN = (m.usps ?? []).filter((u) => u.active).length;
                  return (
                    <li key={m.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? opportunity.moduleIds.filter((id) => id !== m.id)
                              : [...opportunity.moduleIds, m.id];
                            onUpdate({ moduleIds: next });
                          }}
                        />
                        {m.label}
                        {uspN > 0 ? (
                          <span className="muted">
                            {" "}
                            · {uspN} USP
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      {catalogFeatures.personae && (
        <section className="opp-personae" aria-label="Personas">
          <header className="opp-personae-head">
            <h3>Persona(s) adressée(s)</h3>
            <p className="muted">
              Informationnel : fonction(s) ciblée(s) par l’offre. Aucune case =
              niveau entreprise.
            </p>
          </header>
          {activePersonae.length === 0 ? (
            <p className="muted">Aucune persona active.</p>
          ) : (
            <ul className="opp-module-checks">
              {activePersonae.map((p) => {
                const checked = selectedPersonaIds.includes(p.id);
                return (
                  <li key={p.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? selectedPersonaIds.filter((id) => id !== p.id)
                            : [...selectedPersonaIds, p.id];
                          onUpdate({ personaIds: next });
                        }}
                      />
                      {p.name}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
