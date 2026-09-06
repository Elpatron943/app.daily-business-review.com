import { useMemo, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import {
  FEATURE_COVERAGES,
  type FeatureCoverage,
  type SolutionBattleFeatureDef,
  type SolutionCompetitorDef,
  type SolutionDef,
  type SolutionFeatureGroupDef,
} from "./config/types";

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/**
 * Catalogue global org : Solutions + grille concurrentielle (features / groupes).
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
  } = useOrgConfig();

  const [newSolutionName, setNewSolutionName] = useState("");
  const [newSolutionCode, setNewSolutionCode] = useState("");

  const solutions = useMemo(
    () =>
      [...config.solutions]
        .filter((s) => showInactive || s.active)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "fr")),
    [config.solutions, showInactive],
  );

  const activeCount = config.solutions.filter((s) => s.active).length;

  return (
    <div className="catalogue-manager">
      <header className="catalogue-head">
        <div>
          <h3>Catalogue produits</h3>
          <p className="muted">
            Solutions, features (regroupées) et couverture vs concurrents.
          </p>
        </div>
        <p className="catalogue-stats">
          {catalogFeatures.solutions && (
            <span>
              {activeCount} solution{activeCount !== 1 ? "s" : ""}
            </span>
          )}
        </p>
      </header>

      <section
        className="catalogue-structure"
        aria-label="Structure de l’offre"
      >
        <h4>Structure de l’offre</h4>
        <div className="catalogue-structure-toggles">
          <label className="sold-check">
            <input
              type="checkbox"
              checked={catalogFeatures.solutions}
              onChange={(e) =>
                updateCatalogFeatures({
                  solutions: e.target.checked,
                })
              }
            />
            <span>
              <strong>Solutions</strong>
              <em className="meta">Catalogue produits / offres</em>
            </span>
          </label>
          <label className="sold-check">
            <input
              type="checkbox"
              checked={catalogFeatures.personae}
              onChange={(e) =>
                updateCatalogFeatures({ personae: e.target.checked })
              }
            />
            <span>
              <strong>Personae</strong>
              <em className="meta">Équipement / ventes par persona</em>
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
                  onChange={(patch) => updateSolution(s.id, patch)}
                  onRemove={() => removeSolution(s.id)}
                  onRestore={() => updateSolution(s.id, { active: true })}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function SolutionRow({
  solution,
  showInactive,
  onChange,
  onRemove,
  onRestore,
}: {
  solution: SolutionDef;
  showInactive: boolean;
  onChange: (patch: Partial<SolutionDef>) => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  return (
    <li
      className={`process-domain-row${!solution.active ? " inactive" : ""}`}
    >
      <div className="process-domain-head">
        <input
          value={solution.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={!solution.active}
          aria-label="Nom solution"
        />
        <input
          className="code"
          value={solution.code ?? ""}
          onChange={(e) => onChange({ code: e.target.value })}
          disabled={!solution.active}
          placeholder="Code"
          aria-label="Code solution"
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
              value={solution.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="Pitch / positionnement de la solution…"
            />
          </label>
          <SolutionBattleEditor
            solution={solution}
            showInactive={showInactive}
            onChange={onChange}
          />
        </>
      )}
    </li>
  );
}

function SolutionBattleEditor({
  solution,
  showInactive,
  onChange,
}: {
  solution: SolutionDef;
  showInactive: boolean;
  onChange: (patch: Partial<SolutionDef>) => void;
}) {
  const [newGroup, setNewGroup] = useState("");
  const [newFeature, setNewFeature] = useState("");
  const [newFeatureGroupId, setNewFeatureGroupId] = useState("");
  const [newCompetitor, setNewCompetitor] = useState("");

  const groups = useMemo(
    () =>
      [...(solution.featureGroups ?? [])]
        .filter((g) => showInactive || g.active)
        .sort((a, b) => a.order - b.order),
    [solution.featureGroups, showInactive],
  );

  const features = useMemo(
    () =>
      [...(solution.features ?? [])]
        .filter((f) => showInactive || f.active)
        .sort((a, b) => a.order - b.order),
    [solution.features, showInactive],
  );

  const competitors = useMemo(
    () =>
      [...(solution.competitors ?? [])]
        .filter((c) => showInactive || c.active)
        .sort((a, b) => a.order - b.order),
    [solution.competitors, showInactive],
  );

  const groupMap = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups],
  );

  const groupedSections = useMemo(() => {
    const sections: {
      key: string;
      label: string;
      items: SolutionBattleFeatureDef[];
    }[] = [];
    for (const g of groups) {
      const items = features.filter((f) => f.groupId === g.id);
      sections.push({ key: g.id, label: g.label || "Groupe", items });
    }
    const ungrouped = features.filter(
      (f) => !f.groupId || !groupMap.has(f.groupId),
    );
    if (ungrouped.length > 0 || groups.length === 0) {
      sections.push({
        key: "_none",
        label: groups.length === 0 ? "Features" : "Hors regroupement",
        items: ungrouped,
      });
    }
    return sections;
  }, [groups, features, groupMap]);

  function patchGroups(next: SolutionFeatureGroupDef[]) {
    onChange({ featureGroups: next });
  }
  function patchFeatures(next: SolutionBattleFeatureDef[]) {
    onChange({ features: next });
  }
  function patchCompetitors(next: SolutionCompetitorDef[]) {
    onChange({ competitors: next });
  }

  function setOurCoverage(featureId: string, ourCoverage: FeatureCoverage) {
    patchFeatures(
      (solution.features ?? []).map((f) =>
        f.id === featureId ? { ...f, ourCoverage } : f,
      ),
    );
  }

  function setCompetitorCoverage(
    competitorId: string,
    featureId: string,
    coverage: FeatureCoverage,
  ) {
    patchCompetitors(
      (solution.competitors ?? []).map((c) =>
        c.id === competitorId
          ? {
              ...c,
              featureCoverage: {
                ...c.featureCoverage,
                [featureId]: coverage,
              },
            }
          : c,
      ),
    );
  }

  return (
    <div className="sol-battle">
      <h4>Grille concurrentielle</h4>
      <p className="muted settings-hint">
        Listez les features du marché, regroupez-les, puis indiquez pour
        chaque ligne si vous (et chaque concurrent) les adressez totalement,
        partiellement ou pas du tout.
      </p>

      <div className="sol-battle-admin">
        <section aria-label="Regroupements">
          <h5>Regroupements</h5>
          <ul className="settings-list sol-battle-mini-list">
            {groups.map((g) => (
              <li key={g.id}>
                <input
                  value={g.label}
                  onChange={(e) =>
                    patchGroups(
                      (solution.featureGroups ?? []).map((x) =>
                        x.id === g.id ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                  disabled={!g.active}
                  placeholder="Nom du groupe"
                />
                {g.active ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      patchGroups(
                        (solution.featureGroups ?? []).map((x) =>
                          x.id === g.id ? { ...x, active: false } : x,
                        ),
                      )
                    }
                  >
                    Retirer
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      patchGroups(
                        (solution.featureGroups ?? []).map((x) =>
                          x.id === g.id ? { ...x, active: true } : x,
                        ),
                      )
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
              const label = newGroup.trim();
              if (!label) return;
              const list = solution.featureGroups ?? [];
              patchGroups([
                ...list,
                {
                  id: uid("sfg"),
                  label,
                  active: true,
                  order: list.length + 1,
                },
              ]);
              setNewGroup("");
            }}
          >
            <input
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder="Nouveau regroupement"
              required
            />
            <button type="submit">Ajouter</button>
          </form>
        </section>

        <section aria-label="Concurrents produit">
          <h5>Produits concurrents</h5>
          <ul className="settings-list sol-battle-mini-list">
            {competitors.map((c) => (
              <li key={c.id} className="sol-battle-comp-row">
                <input
                  value={c.name}
                  onChange={(e) =>
                    patchCompetitors(
                      (solution.competitors ?? []).map((x) =>
                        x.id === c.id ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                  disabled={!c.active}
                  placeholder="Nom du concurrent"
                />
                <input
                  value={c.description}
                  onChange={(e) =>
                    patchCompetitors(
                      (solution.competitors ?? []).map((x) =>
                        x.id === c.id
                          ? { ...x, description: e.target.value }
                          : x,
                      ),
                    )
                  }
                  disabled={!c.active}
                  placeholder="Note (opt.)"
                />
                {c.active ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      patchCompetitors(
                        (solution.competitors ?? []).map((x) =>
                          x.id === c.id ? { ...x, active: false } : x,
                        ),
                      )
                    }
                  >
                    Retirer
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      patchCompetitors(
                        (solution.competitors ?? []).map((x) =>
                          x.id === c.id ? { ...x, active: true } : x,
                        ),
                      )
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
              const name = newCompetitor.trim();
              if (!name) return;
              const list = solution.competitors ?? [];
              patchCompetitors([
                ...list,
                {
                  id: uid("scomp"),
                  name,
                  description: "",
                  featureCoverage: {},
                  active: true,
                  order: list.length + 1,
                },
              ]);
              setNewCompetitor("");
            }}
          >
            <input
              value={newCompetitor}
              onChange={(e) => setNewCompetitor(e.target.value)}
              placeholder="Nouveau produit concurrent"
              required
            />
            <button type="submit">Ajouter</button>
          </form>
        </section>
      </div>

      <section className="sol-battle-features" aria-label="Features">
        <h5>Features</h5>
        <p className="muted settings-hint">
          Chaque feature peut être liée à un regroupement via le menu
          « Regroupement ». Créez d’abord des regroupements ci-dessus si
          besoin.
        </p>
        <form
          className="settings-add nested sol-battle-add-feature"
          onSubmit={(e) => {
            e.preventDefault();
            const label = newFeature.trim();
            if (!label) return;
            const list = solution.features ?? [];
            const activeGroups = groups.filter((g) => g.active);
            const chosen =
              newFeatureGroupId &&
              activeGroups.some((g) => g.id === newFeatureGroupId)
                ? newFeatureGroupId
                : null;
            patchFeatures([
              ...list,
              {
                id: uid("sbf"),
                label,
                description: "",
                groupId: chosen,
                ourCoverage: "none",
                active: true,
                order: list.length + 1,
              },
            ]);
            setNewFeature("");
          }}
        >
          <input
            value={newFeature}
            onChange={(e) => setNewFeature(e.target.value)}
            placeholder="Nouvelle feature"
            required
          />
          <select
            value={newFeatureGroupId}
            onChange={(e) => setNewFeatureGroupId(e.target.value)}
            aria-label="Lier au regroupement"
            title="Lier au regroupement"
          >
            <option value="">— Sans regroupement —</option>
            {groups
              .filter((g) => g.active)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label || "Groupe"}
                </option>
              ))}
          </select>
          <button type="submit">Ajouter feature</button>
        </form>

        {features.length === 0 ? (
          <p className="muted">Aucune feature — ajoutez-en pour remplir la grille.</p>
        ) : (
          <div className="sol-battle-matrix-scroll">
            <table className="sol-battle-matrix">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">Regroupement</th>
                  <th scope="col">Nous</th>
                  {competitors.map((c) => (
                    <th key={c.id} scope="col">
                      {c.name || "Concurrent"}
                    </th>
                  ))}
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {groupedSections.map((section) =>
                  section.items.length === 0 && section.key !== "_none" ? (
                    <tr key={`${section.key}-empty`} className="sol-battle-group-row">
                      <td colSpan={4 + competitors.length}>
                        <em>{section.label}</em>
                        <span className="muted"> — aucune feature</span>
                      </td>
                    </tr>
                  ) : (
                    section.items.map((f, idx) => {
                      const activeGroups = groups.filter((g) => g.active);
                      const assigned = f.groupId
                        ? (solution.featureGroups ?? []).find(
                            (g) => g.id === f.groupId,
                          )
                        : null;
                      const options =
                        assigned && !assigned.active
                          ? [assigned, ...activeGroups]
                          : activeGroups;
                      return (
                      <tr key={f.id}>
                        <td>
                          {idx === 0 ||
                          section.items[idx - 1]?.groupId !== f.groupId ? (
                            <span className="sol-battle-group-tag">
                              {section.label}
                            </span>
                          ) : null}
                          <input
                            value={f.label}
                            onChange={(e) =>
                              patchFeatures(
                                (solution.features ?? []).map((x) =>
                                  x.id === f.id
                                    ? { ...x, label: e.target.value }
                                    : x,
                                ),
                              )
                            }
                            disabled={!f.active}
                            aria-label="Libellé feature"
                          />
                        </td>
                        <td>
                          <select
                            className="sol-battle-group-select"
                            value={f.groupId ?? ""}
                            onChange={(e) =>
                              patchFeatures(
                                (solution.features ?? []).map((x) =>
                                  x.id === f.id
                                    ? {
                                        ...x,
                                        groupId: e.target.value || null,
                                      }
                                    : x,
                                ),
                              )
                            }
                            disabled={!f.active}
                            aria-label="Lier au regroupement"
                          >
                            <option value="">— Sans regroupement —</option>
                            {options.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.label || "Groupe"}
                                {!g.active ? " (inactif)" : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <CoverageSelect
                            value={f.ourCoverage}
                            disabled={!f.active}
                            onChange={(v) => setOurCoverage(f.id, v)}
                          />
                        </td>
                        {competitors.map((c) => (
                          <td key={c.id}>
                            <CoverageSelect
                              value={
                                c.featureCoverage?.[f.id] ?? "none"
                              }
                              disabled={!f.active || !c.active}
                              onChange={(v) =>
                                setCompetitorCoverage(c.id, f.id, v)
                              }
                            />
                          </td>
                        ))}
                        <td>
                          {f.active ? (
                            <button
                              type="button"
                              className="ghost"
                              onClick={() =>
                                patchFeatures(
                                  (solution.features ?? []).map((x) =>
                                    x.id === f.id
                                      ? { ...x, active: false }
                                      : x,
                                  ),
                                )
                              }
                            >
                              Retirer
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="ghost"
                              onClick={() =>
                                patchFeatures(
                                  (solution.features ?? []).map((x) =>
                                    x.id === f.id
                                      ? { ...x, active: true }
                                      : x,
                                  ),
                                )
                              }
                            >
                              Réactiver
                            </button>
                          )}
                        </td>
                      </tr>
                      );
                    })
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CoverageSelect({
  value,
  disabled,
  onChange,
}: {
  value: FeatureCoverage;
  disabled?: boolean;
  onChange: (v: FeatureCoverage) => void;
}) {
  return (
    <select
      className={`sol-coverage sol-coverage-${value}`}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as FeatureCoverage)}
      aria-label="Couverture"
    >
      {FEATURE_COVERAGES.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
