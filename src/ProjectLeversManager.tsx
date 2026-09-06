import { useMemo, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import type { ProjectLeverDef, ProjectLeverFamilyDef } from "./config/types";

/**
 * Settings : familles de leviers + critères « Pourquoi y a-t-il un projet ? ».
 */
export default function ProjectLeversManager({
  showInactive,
}: {
  showInactive: boolean;
}) {
  const {
    config,
    addProjectLeverFamily,
    updateProjectLeverFamily,
    removeProjectLeverFamily,
    addProjectLever,
    updateProjectLever,
    removeProjectLever,
  } = useOrgConfig();

  const [newFamily, setNewFamily] = useState("");
  const [newLeverByFamily, setNewLeverByFamily] = useState<
    Record<string, string>
  >({});

  const families = useMemo(
    () =>
      [...(config.projectLeverFamilies ?? [])]
        .filter((f) => showInactive || f.active)
        .sort((a, b) => a.order - b.order),
    [config.projectLeverFamilies, showInactive],
  );

  const levers = useMemo(
    () =>
      [...(config.projectLevers ?? [])]
        .filter((l) => showInactive || l.active)
        .sort((a, b) => a.order - b.order),
    [config.projectLevers, showInactive],
  );

  return (
    <div className="project-levers-manager">
      <header className="catalogue-head">
        <div>
          <h3>Leviers projet</h3>
          <p className="muted">
            Critères pour décider s’il y a un vrai projet (« Pourquoi »).
            Regroupez-les en familles de leviers.
          </p>
        </div>
      </header>

      <form
        className="settings-add"
        onSubmit={(e) => {
          e.preventDefault();
          addProjectLeverFamily(newFamily);
          setNewFamily("");
        }}
      >
        <input
          value={newFamily}
          onChange={(e) => setNewFamily(e.target.value)}
          placeholder="Nouvelle famille de leviers"
          required
        />
        <button type="submit">Ajouter une famille</button>
      </form>

      {families.length === 0 ? (
        <p className="muted">Aucune famille — créez-en une pour commencer.</p>
      ) : (
        <ul className="settings-list process-domain-list">
          {families.map((family) => (
            <FamilyRow
              key={family.id}
              family={family}
              levers={levers.filter((l) => l.familyId === family.id)}
              newLever={newLeverByFamily[family.id] ?? ""}
              onNewLeverChange={(v) =>
                setNewLeverByFamily((prev) => ({
                  ...prev,
                  [family.id]: v,
                }))
              }
              onChangeFamily={(patch) =>
                updateProjectLeverFamily(family.id, patch)
              }
              onRemoveFamily={() => removeProjectLeverFamily(family.id)}
              onRestoreFamily={() =>
                updateProjectLeverFamily(family.id, { active: true })
              }
              onAddLever={() => {
                addProjectLever(family.id, newLeverByFamily[family.id] ?? "");
                setNewLeverByFamily((prev) => ({
                  ...prev,
                  [family.id]: "",
                }));
              }}
              onChangeLever={(id, patch) => updateProjectLever(id, patch)}
              onRemoveLever={(id) => removeProjectLever(id)}
              onRestoreLever={(id) =>
                updateProjectLever(id, { active: true })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FamilyRow({
  family,
  levers,
  newLever,
  onNewLeverChange,
  onChangeFamily,
  onRemoveFamily,
  onRestoreFamily,
  onAddLever,
  onChangeLever,
  onRemoveLever,
  onRestoreLever,
}: {
  family: ProjectLeverFamilyDef;
  levers: ProjectLeverDef[];
  newLever: string;
  onNewLeverChange: (v: string) => void;
  onChangeFamily: (patch: Partial<ProjectLeverFamilyDef>) => void;
  onRemoveFamily: () => void;
  onRestoreFamily: () => void;
  onAddLever: () => void;
  onChangeLever: (id: string, patch: Partial<ProjectLeverDef>) => void;
  onRemoveLever: (id: string) => void;
  onRestoreLever: (id: string) => void;
}) {
  return (
    <li
      className={`process-domain-row${!family.active ? " inactive" : ""}`}
    >
      <div className="process-domain-head">
        <input
          value={family.label}
          onChange={(e) => onChangeFamily({ label: e.target.value })}
          disabled={!family.active}
          aria-label="Nom famille"
        />
        {family.active ? (
          <button type="button" className="ghost" onClick={onRemoveFamily}>
            Désactiver
          </button>
        ) : (
          <button type="button" className="ghost" onClick={onRestoreFamily}>
            Réactiver
          </button>
        )}
      </div>
      {family.active && (
        <>
          <label className="intel-textarea-label">
            Description famille
            <textarea
              rows={2}
              value={family.description}
              onChange={(e) =>
                onChangeFamily({ description: e.target.value })
              }
              placeholder="Ce que couvre cette famille de leviers…"
            />
          </label>

          <h4 className="nested-hint">Critères / cases à cocher</h4>
          <ul className="settings-list intel-feature-list">
            {levers.map((l) => (
              <li key={l.id} className={!l.active ? "inactive" : ""}>
                <input
                  value={l.label}
                  onChange={(e) =>
                    onChangeLever(l.id, { label: e.target.value })
                  }
                  disabled={!l.active}
                  placeholder="Libellé critère"
                />
                <textarea
                  rows={2}
                  value={l.description}
                  onChange={(e) =>
                    onChangeLever(l.id, { description: e.target.value })
                  }
                  disabled={!l.active}
                  placeholder="Aide / preuve attendue (opt.)"
                />
                {l.active ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onRemoveLever(l.id)}
                  >
                    Retirer
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onRestoreLever(l.id)}
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
              onAddLever();
            }}
          >
            <input
              value={newLever}
              onChange={(e) => onNewLeverChange(e.target.value)}
              placeholder="Nouveau critère"
              required
            />
            <button type="submit">Ajouter</button>
          </form>
        </>
      )}
    </li>
  );
}
