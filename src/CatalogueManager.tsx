import { useMemo, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import type {
  SolutionDef,
  SolutionModuleDef,
  UspDef,
} from "./config/types";

/**
 * Catalogue global org : Solutions → Modules (features) → USP.
 * Personnalisable ici, consommé par les opportunités, fiches et dashboards.
 */
export default function CatalogueManager({
  showInactive,
}: {
  showInactive: boolean;
}) {
  const {
    config,
    catalogFeatures,
    updateCatalogFeatures,
    addSolution,
    updateSolution,
    removeSolution,
    addSolutionModule,
    updateSolutionModule,
    removeSolutionModule,
    swapSolutionModuleOrder,
    addModuleUsp,
    updateModuleUsp,
    removeModuleUsp,
  } = useOrgConfig();

  const [newSolutionName, setNewSolutionName] = useState("");
  const [newSolutionCode, setNewSolutionCode] = useState("");
  const [newModuleBySolution, setNewModuleBySolution] = useState<
    Record<string, string>
  >({});
  const [newUspByModule, setNewUspByModule] = useState<Record<string, string>>(
    {},
  );

  const solutions = useMemo(
    () =>
      [...config.solutions]
        .filter((s) => showInactive || s.active)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "fr")),
    [config.solutions, showInactive],
  );

  const activeCount = config.solutions.filter((s) => s.active).length;
  const moduleCount = config.solutions
    .filter((s) => s.active)
    .reduce(
      (n, s) => n + (s.modules ?? []).filter((m) => m.active).length,
      0,
    );

  return (
    <div className="catalogue-manager">
      <header className="catalogue-head">
        <div>
          <h3>Catalogue produits</h3>
        </div>
        <p className="catalogue-stats">
          {catalogFeatures.solutions && (
            <span>
              {activeCount} solution{activeCount !== 1 ? "s" : ""}
            </span>
          )}
          {catalogFeatures.modules && (
            <span>
              {moduleCount} module{moduleCount !== 1 ? "s" : ""}
            </span>
          )}
        </p>
      </header>

      <section
        className="catalogue-structure"
        aria-label="Structure de l’offre"
      >
        <h4>Structure de l’offre</h4>
        <p className="muted">
          Active uniquement les niveaux utilisés par ton organisation. Ex. :
          solutions seules, sans modules.
        </p>
        <div className="catalogue-structure-toggles">
          <label className="sold-check">
            <input
              type="checkbox"
              checked={catalogFeatures.solutions}
              onChange={(e) =>
                updateCatalogFeatures({
                  solutions: e.target.checked,
                  modules: e.target.checked
                    ? catalogFeatures.modules
                    : false,
                })
              }
            />
            <span>
              <strong>Solutions</strong>
              <em className="meta">Catalogue produits / offres</em>
            </span>
          </label>
          <label
            className={`sold-check${!catalogFeatures.solutions ? " is-disabled" : ""}`}
          >
            <input
              type="checkbox"
              checked={catalogFeatures.modules}
              disabled={!catalogFeatures.solutions}
              onChange={(e) =>
                updateCatalogFeatures({ modules: e.target.checked })
              }
            />
            <span>
              <strong>Modules</strong>
              <em className="meta">Features sous chaque solution</em>
            </span>
          </label>
          <label className="sold-check">
            <input
              type="checkbox"
              checked={catalogFeatures.directions}
              onChange={(e) =>
                updateCatalogFeatures({ directions: e.target.checked })
              }
            />
            <span>
              <strong>Directions</strong>
              <em className="meta">Équipement / ventes par direction</em>
            </span>
          </label>
        </div>
      </section>

      {!catalogFeatures.solutions ? (
        <p className="muted">
          Active les solutions ci-dessus pour gérer le catalogue produits.
        </p>
      ) : (
        <>
      <form
        className="settings-add"
        onSubmit={(e) => {
          e.preventDefault();
          addSolution(newSolutionName, newSolutionCode);
          setNewSolutionName("");
          setNewSolutionCode("");
        }}
      >
        <input
          value={newSolutionName}
          onChange={(e) => setNewSolutionName(e.target.value)}
          placeholder="Nom de la solution"
          required
        />
        <input
          value={newSolutionCode}
          onChange={(e) => setNewSolutionCode(e.target.value)}
          placeholder="Code (opt.)"
          className="code"
        />
        <button type="submit">Ajouter une solution</button>
      </form>

      {solutions.length === 0 ? (
        <p className="muted">Aucune solution dans le catalogue.</p>
      ) : (
        <ul className="settings-list process-domain-list">
          {solutions.map((s) => (
            <SolutionRow
              key={s.id}
              solution={s}
              showInactive={showInactive}
              modulesEnabled={catalogFeatures.modules}
              newModule={newModuleBySolution[s.id] ?? ""}
              onNewModuleChange={(v) =>
                setNewModuleBySolution((prev) => ({
                  ...prev,
                  [s.id]: v,
                }))
              }
              newUspByModule={newUspByModule}
              onNewUspChange={(moduleId, v) =>
                setNewUspByModule((prev) => ({
                  ...prev,
                  [`${s.id}:${moduleId}`]: v,
                }))
              }
              onChange={(patch) => updateSolution(s.id, patch)}
              onRemove={() => removeSolution(s.id)}
              onRestore={() => updateSolution(s.id, { active: true })}
              onAddModule={() => {
                addSolutionModule(s.id, newModuleBySolution[s.id] ?? "");
                setNewModuleBySolution((prev) => ({
                  ...prev,
                  [s.id]: "",
                }));
              }}
              onUpdateModule={(mid, patch) =>
                updateSolutionModule(s.id, mid, patch)
              }
              onRemoveModule={(mid) => removeSolutionModule(s.id, mid)}
              onMoveModule={(mid, dir) => {
                const mods = [...(s.modules ?? [])]
                  .filter((m) => showInactive || m.active)
                  .sort((a, b) => a.order - b.order);
                const mi = mods.findIndex((m) => m.id === mid);
                const neighbor = mods[mi + dir];
                if (mi < 0 || !neighbor) return;
                swapSolutionModuleOrder(s.id, mid, neighbor.id);
              }}
              onAddModuleUsp={(mid) => {
                const key = `${s.id}:${mid}`;
                addModuleUsp(s.id, mid, newUspByModule[key] ?? "");
                setNewUspByModule((prev) => ({ ...prev, [key]: "" }));
              }}
              onUpdateModuleUsp={(mid, uid, patch) =>
                updateModuleUsp(s.id, mid, uid, patch)
              }
              onRemoveModuleUsp={(mid, uid) =>
                removeModuleUsp(s.id, mid, uid)
              }
            />
          ))}
        </ul>
      )}
        </>
      )}
    </div>
  );
}

function OrderButtons({
  onMoveUp,
  onMoveDown,
  disabled,
}: {
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="order-arrows">
      <button
        type="button"
        className="ghost order-arrow"
        onClick={onMoveUp}
        disabled={disabled || !onMoveUp}
        title="Monter"
        aria-label="Monter"
      >
        ▲
      </button>
      <button
        type="button"
        className="ghost order-arrow"
        onClick={onMoveDown}
        disabled={disabled || !onMoveDown}
        title="Descendre"
        aria-label="Descendre"
      >
        ▼
      </button>
    </span>
  );
}

function SolutionRow({
  solution,
  showInactive,
  modulesEnabled,
  newModule,
  onNewModuleChange,
  newUspByModule,
  onNewUspChange,
  onChange,
  onRemove,
  onRestore,
  onAddModule,
  onUpdateModule,
  onRemoveModule,
  onMoveModule,
  onAddModuleUsp,
  onUpdateModuleUsp,
  onRemoveModuleUsp,
}: {
  solution: SolutionDef;
  showInactive: boolean;
  modulesEnabled: boolean;
  newModule: string;
  onNewModuleChange: (v: string) => void;
  newUspByModule: Record<string, string>;
  onNewUspChange: (moduleId: string, v: string) => void;
  onChange: (patch: Partial<SolutionDef>) => void;
  onRemove: () => void;
  onRestore: () => void;
  onAddModule: () => void;
  onUpdateModule: (
    moduleId: string,
    patch: Partial<SolutionModuleDef>,
  ) => void;
  onRemoveModule: (moduleId: string) => void;
  onMoveModule: (moduleId: string, direction: -1 | 1) => void;
  onAddModuleUsp: (moduleId: string) => void;
  onUpdateModuleUsp: (
    moduleId: string,
    uspId: string,
    patch: Partial<UspDef>,
  ) => void;
  onRemoveModuleUsp: (moduleId: string, uspId: string) => void;
}) {
  const modules = [...(solution.modules ?? [])]
    .filter((m) => showInactive || m.active)
    .sort((a, b) => a.order - b.order);

  return (
    <li className={`process-domain-row${!solution.active ? " inactive" : ""}`}>
      <div className="process-domain-head">
        <input
          value={solution.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={!solution.active}
          aria-label="Nom de la solution"
        />
        <input
          className="code"
          value={solution.code ?? ""}
          onChange={(e) => onChange({ code: e.target.value || undefined })}
          placeholder="Code"
          disabled={!solution.active}
        />
        {solution.active ? (
          <button type="button" className="ghost" onClick={onRemove}>
            Désactiver
          </button>
        ) : (
          <button type="button" className="ghost" onClick={onRestore}>
            Réactiver
          </button>
        )}
      </div>
      {solution.active && (
        <>
          <label className="intel-textarea-label">
            Description solution
            <textarea
              rows={3}
              value={solution.description ?? ""}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="Pitch / positionnement de la solution…"
            />
          </label>
          {modulesEnabled && (
          <>
          <ul className="settings-list intel-module-list">
            {modules.map((m, mi) => {
              const usps = [...(m.usps ?? [])]
                .filter((u) => showInactive || u.active)
                .sort((a, b) => a.order - b.order);
              const uspKey = `${solution.id}:${m.id}`;
              return (
                <li
                  key={m.id}
                  className={`intel-module-row${!m.active ? " inactive" : ""}`}
                >
                  <div className="intel-module-head">
                    <input
                      value={m.label}
                      onChange={(e) =>
                        onUpdateModule(m.id, { label: e.target.value })
                      }
                      disabled={!m.active}
                      aria-label="Libellé du module"
                    />
                    <OrderButtons
                      onMoveUp={
                        mi > 0 ? () => onMoveModule(m.id, -1) : undefined
                      }
                      onMoveDown={
                        mi < modules.length - 1
                          ? () => onMoveModule(m.id, 1)
                          : undefined
                      }
                      disabled={!m.active}
                    />
                    {m.active ? (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => onRemoveModule(m.id)}
                      >
                        Retirer
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => onUpdateModule(m.id, { active: true })}
                      >
                        Réactiver
                      </button>
                    )}
                  </div>
                  {m.active && (
                    <>
                      <textarea
                        rows={2}
                        value={m.description ?? ""}
                        onChange={(e) =>
                          onUpdateModule(m.id, {
                            description: e.target.value,
                          })
                        }
                        placeholder="Description du module…"
                        aria-label="Description module"
                      />
                      <h4 className="nested-hint">USP</h4>
                      <ul className="settings-list intel-usp-list">
                        {usps.map((u) => (
                          <li
                            key={u.id}
                            className={`intel-usp-row${!u.active ? " inactive" : ""}`}
                          >
                            <input
                              value={u.label}
                              onChange={(e) =>
                                onUpdateModuleUsp(m.id, u.id, {
                                  label: e.target.value,
                                })
                              }
                              disabled={!u.active}
                              placeholder="Libellé USP"
                            />
                            <textarea
                              rows={2}
                              value={u.description}
                              onChange={(e) =>
                                onUpdateModuleUsp(m.id, u.id, {
                                  description: e.target.value,
                                })
                              }
                              disabled={!u.active}
                              placeholder="Pourquoi on gagne vs concurrent…"
                            />
                            {u.active ? (
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => onRemoveModuleUsp(m.id, u.id)}
                              >
                                Retirer
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="ghost"
                                onClick={() =>
                                  onUpdateModuleUsp(m.id, u.id, {
                                    active: true,
                                  })
                                }
                              >
                                Réactiver
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                      <form
                        className="settings-add nested"
                        onSubmit={(e) => {
                          e.preventDefault();
                          onAddModuleUsp(m.id);
                        }}
                      >
                        <input
                          value={newUspByModule[uspKey] ?? ""}
                          onChange={(e) =>
                            onNewUspChange(m.id, e.target.value)
                          }
                          placeholder="Nouvel USP pour ce module"
                          required
                        />
                        <button type="submit">Ajouter USP</button>
                      </form>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <form
            className="settings-add nested"
            onSubmit={(e) => {
              e.preventDefault();
              onAddModule();
            }}
          >
            <input
              value={newModule}
              onChange={(e) => onNewModuleChange(e.target.value)}
              placeholder="Nouveau module / feature"
              required
            />
            <button type="submit">Ajouter un module</button>
          </form>
          </>
          )}
        </>
      )}
    </li>
  );
}
