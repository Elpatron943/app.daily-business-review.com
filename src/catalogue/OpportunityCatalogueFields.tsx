import type { Opportunity } from "../opportunities/OpportunityContext";
import type { CompellingEventDef, SolutionDef } from "../config/types";
import { useOrgConfig } from "../config/ConfigContext";

type Props = {
  opportunity: Opportunity;
  solutions: SolutionDef[];
  compellingEvents: CompellingEventDef[];
  onUpdate: (patch: Partial<Opportunity>) => void;
  /** Optionnel : synchronise la question Process Compelling Event. */
  onCompellingEventsChange?: (ids: string[]) => void;
};

/** Saisie catalogue (solution + modules + personae + compelling events) sur une opportunité. */
export default function OpportunityCatalogueFields({
  opportunity,
  solutions,
  compellingEvents,
  onUpdate,
  onCompellingEventsChange,
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
  const activeEvents = compellingEvents.filter((c) => c.active);
  const selectedCeIds = opportunity.compellingEventIds ?? [];
  const selectedPersonaIds = opportunity.personaIds ?? [];

  function setCompellingEventIds(next: string[]) {
    onUpdate({ compellingEventIds: next });
    onCompellingEventsChange?.(next);
  }

  return (
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

      {catalogFeatures.personae && (
        <div className="opp-modules">
          <h4>Persona(s) adressée(s)</h4>
          <p className="muted sold-multi-hint">
            Aucune case = niveau entreprise.
          </p>
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
        </div>
      )}

      <div className="opp-compelling-events">
        <h4>Compelling Events</h4>
        {activeEvents.length === 0 ? (
          <p className="muted">Aucun Compelling Event.</p>
        ) : (
          <ul className="opp-module-checks">
            {activeEvents.map((ce) => {
              const checked = selectedCeIds.includes(ce.id);
              return (
                <li key={ce.id}>
                  <label title={ce.description || undefined}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? selectedCeIds.filter((id) => id !== ce.id)
                          : [...selectedCeIds, ce.id];
                        setCompellingEventIds(next);
                      }}
                    />
                    <span>
                      {ce.label}
                      {ce.description ? (
                        <span className="muted opp-ce-desc">
                          {" "}
                          — {ce.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
