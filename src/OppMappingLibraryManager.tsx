import { useMemo, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import {
  OPP_MAPPING_CATEGORIES,
  OPP_MAPPING_SWOT_ORDER,
  type OppMappingCategory,
} from "./config/types";
import { resolveThemeLabel } from "./config/oppMappingLibrary";

function clampWeightInput(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(10, Math.round(n * 100) / 100);
}

export default function OppMappingLibraryManager({
  showInactive,
}: {
  showInactive: boolean;
}) {
  const {
    config,
    activeOppMappingThemes,
    updateOppMappingSubtype,
    removeOppMappingSubtype,
    addOppMappingSubtype,
    addOppMappingTheme,
    updateOppMappingTheme,
    removeOppMappingTheme,
  } = useOrgConfig();
  const [catFilter, setCatFilter] = useState<OppMappingCategory | "all">(
    "all",
  );
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] =
    useState<OppMappingCategory>("signaux_positifs");
  const [newTheme, setNewTheme] = useState("custom");
  const [newThemeLabel, setNewThemeLabel] = useState("");

  const allThemes = useMemo(
    () =>
      [...(config.oppMappingThemes ?? [])].sort(
        (a, b) =>
          a.order - b.order || a.label.localeCompare(b.label, "fr"),
      ),
    [config.oppMappingThemes],
  );

  const themesForSelect = useMemo(() => {
    const active = activeOppMappingThemes;
    if (active.some((t) => t.id === newTheme)) return active;
    const orphan = allThemes.find((t) => t.id === newTheme);
    return orphan ? [...active, orphan] : active;
  }, [activeOppMappingThemes, allThemes, newTheme]);

  const cards = useMemo(() => {
    return [...(config.oppMappingSubtypes ?? [])]
      .filter((s) => showInactive || s.active !== false)
      .filter((s) => (catFilter === "all" ? true : s.category === catFilter))
      .sort((a, b) => {
        const ai = OPP_MAPPING_SWOT_ORDER.indexOf(a.category);
        const bi = OPP_MAPPING_SWOT_ORDER.indexOf(b.category);
        if (ai !== bi) return ai - bi;
        return a.order - b.order || a.label.localeCompare(b.label, "fr");
      });
  }, [config.oppMappingSubtypes, showInactive, catFilter]);

  const catMeta = useMemo(
    () => Object.fromEntries(OPP_MAPPING_CATEGORIES.map((c) => [c.id, c])),
    [],
  );

  const themesVisible = useMemo(
    () =>
      allThemes.filter((t) => showInactive || t.active !== false),
    [allThemes, showInactive],
  );

  return (
    <div className="omap-weights-manager">
      <header className="catalogue-head">
        <div>
          <h3>Opportunity Mapping · bibliothèque</h3>
        </div>
      </header>

      <section className="omap-themes-panel" aria-label="Thèmes">
        <h4>Thèmes</h4>
        <form
          className="settings-add omap-weights-add"
          onSubmit={(e) => {
            e.preventDefault();
            const id = addOppMappingTheme(newThemeLabel);
            if (id) {
              setNewThemeLabel("");
              setNewTheme(id);
            }
          }}
        >
          <input
            value={newThemeLabel}
            onChange={(e) => setNewThemeLabel(e.target.value)}
            placeholder="Nouveau thème…"
            required
          />
          <button type="submit">Ajouter le thème</button>
        </form>
        <ul className="omap-themes-list">
          {themesVisible.map((theme) => (
            <li
              key={theme.id}
              className={theme.active === false ? "inactive" : ""}
            >
              <input
                className="omap-card-label"
                value={theme.label}
                disabled={theme.active === false}
                onChange={(e) =>
                  updateOppMappingTheme(theme.id, { label: e.target.value })
                }
                aria-label={`Libellé thème ${theme.label}`}
              />
              {theme.active !== false ? (
                theme.id === "custom" ? (
                  <span className="muted omap-theme-locked">Défaut</span>
                ) : (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => removeOppMappingTheme(theme.id)}
                  >
                    Désactiver
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    updateOppMappingTheme(theme.id, { active: true })
                  }
                >
                  Réactiver
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="omap-weights-filters" role="group" aria-label="Catégories">
        <button
          type="button"
          className={catFilter === "all" ? "active" : ""}
          onClick={() => setCatFilter("all")}
        >
          Toutes
        </button>
        {OPP_MAPPING_SWOT_ORDER.map((id) => {
          const cat = catMeta[id];
          return (
            <button
              key={id}
              type="button"
              className={catFilter === id ? "active" : ""}
              onClick={() => setCatFilter(id)}
            >
              {cat.swot} · {cat.label}
            </button>
          );
        })}
      </div>

      <form
        className="settings-add omap-weights-add"
        onSubmit={(e) => {
          e.preventDefault();
          const id = addOppMappingSubtype(newCategory, newLabel, newTheme);
          if (id) setNewLabel("");
        }}
      >
        <select
          value={newCategory}
          onChange={(e) =>
            setNewCategory(e.target.value as OppMappingCategory)
          }
          aria-label="Catégorie"
        >
          {OPP_MAPPING_SWOT_ORDER.map((id) => (
            <option key={id} value={id}>
              {catMeta[id].label}
            </option>
          ))}
        </select>
        <select
          value={newTheme}
          onChange={(e) => setNewTheme(e.target.value)}
          aria-label="Thème"
        >
          {themesForSelect.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nouvelle carte…"
          required
        />
        <button type="submit">Ajouter</button>
      </form>

      <div className="omap-weights-table-wrap">
        <table className="omap-weights-table">
          <thead>
            <tr>
              <th>Carte</th>
              <th>Catégorie</th>
              <th>Thème</th>
              <th title="Pondération si maîtrisée (✓)">Bonus ✓</th>
              <th title="Pondération si non maîtrisée (✗)">Malus ✗</th>
              <th title="Toujours présente sur chaque opportunité">
                Obligatoire
              </th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {cards.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  Aucune carte.
                </td>
              </tr>
            ) : (
              cards.map((card) => {
                const cat = catMeta[card.category];
                const themeId = card.theme ?? "custom";
                const themeOptions = (() => {
                  const active = activeOppMappingThemes;
                  if (active.some((t) => t.id === themeId)) return active;
                  const orphan = allThemes.find((t) => t.id === themeId);
                  if (orphan) return [...active, orphan];
                  return [
                    ...active,
                    {
                      id: themeId,
                      label: resolveThemeLabel(themeId, allThemes) ?? themeId,
                      active: false,
                      order: 999,
                    },
                  ];
                })();
                return (
                  <tr
                    key={card.id}
                    className={card.active === false ? "inactive" : ""}
                  >
                    <td>
                      <input
                        className="omap-card-label"
                        value={card.label}
                        onChange={(e) =>
                          updateOppMappingSubtype(card.id, {
                            label: e.target.value,
                          })
                        }
                        disabled={card.active === false}
                      />
                    </td>
                    <td>
                      <span className="omap-cat-pill">
                        {cat?.swot} · {cat?.label ?? card.category}
                      </span>
                    </td>
                    <td>
                      <select
                        className="omap-theme-select"
                        value={themeId}
                        disabled={card.active === false}
                        onChange={(e) =>
                          updateOppMappingSubtype(card.id, {
                            theme: e.target.value,
                          })
                        }
                        aria-label={`Thème ${card.label}`}
                      >
                        {themeOptions.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step={0.25}
                        className="omap-weight-input"
                        value={card.bonus ?? 1}
                        disabled={card.active === false}
                        onChange={(e) =>
                          updateOppMappingSubtype(card.id, {
                            bonus: clampWeightInput(e.target.value),
                          })
                        }
                        aria-label={`Bonus ${card.label}`}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step={0.25}
                        className="omap-weight-input"
                        value={card.malus ?? 1}
                        disabled={card.active === false}
                        onChange={(e) =>
                          updateOppMappingSubtype(card.id, {
                            malus: clampWeightInput(e.target.value),
                          })
                        }
                        aria-label={`Malus ${card.label}`}
                      />
                    </td>
                    <td className="omap-required-cell">
                      <label className="omap-required-toggle">
                        <input
                          type="checkbox"
                          checked={card.required === true}
                          disabled={card.active === false}
                          onChange={(e) =>
                            updateOppMappingSubtype(card.id, {
                              required: e.target.checked,
                            })
                          }
                          aria-label={`Obligatoire ${card.label}`}
                        />
                        <span>{card.required ? "Oui" : "Non"}</span>
                      </label>
                    </td>
                    <td>
                      {card.active !== false ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => removeOppMappingSubtype(card.id)}
                        >
                          Désactiver
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            updateOppMappingSubtype(card.id, { active: true })
                          }
                        >
                          Réactiver
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
