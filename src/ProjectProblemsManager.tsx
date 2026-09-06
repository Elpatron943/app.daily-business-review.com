import { useMemo, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import type {
  ProjectProblemDef,
  ProjectProblemFamilyDef,
} from "./config/types";

/**
 * Settings : familles + problèmes à résoudre (« Pourquoi »).
 */
export default function ProjectProblemsManager({
  showInactive,
}: {
  showInactive: boolean;
}) {
  const {
    config,
    addProjectProblemFamily,
    updateProjectProblemFamily,
    removeProjectProblemFamily,
    addProjectProblem,
    updateProjectProblem,
    removeProjectProblem,
  } = useOrgConfig();

  const [newFamily, setNewFamily] = useState("");
  const [newProblemByFamily, setNewProblemByFamily] = useState<
    Record<string, string>
  >({});

  const families = useMemo(
    () =>
      [...(config.projectProblemFamilies ?? [])]
        .filter((f) => showInactive || f.active)
        .sort((a, b) => a.order - b.order),
    [config.projectProblemFamilies, showInactive],
  );

  const problems = useMemo(
    () =>
      [...(config.projectProblems ?? [])]
        .filter((p) => showInactive || p.active)
        .sort((a, b) => a.order - b.order),
    [config.projectProblems, showInactive],
  );

  return (
    <div className="project-problems-manager">
      <header className="catalogue-head">
        <div>
          <h3>Problèmes projet</h3>
          <p className="muted">
            Problèmes que le client veut résoudre (« Pourquoi »). Regroupez-les
            en familles.
          </p>
        </div>
      </header>

      <form
        className="settings-add"
        onSubmit={(e) => {
          e.preventDefault();
          addProjectProblemFamily(newFamily);
          setNewFamily("");
        }}
      >
        <input
          value={newFamily}
          onChange={(e) => setNewFamily(e.target.value)}
          placeholder="Nouvelle famille de problèmes"
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
              problems={problems.filter((p) => p.familyId === family.id)}
              newProblem={newProblemByFamily[family.id] ?? ""}
              onNewProblemChange={(v) =>
                setNewProblemByFamily((prev) => ({
                  ...prev,
                  [family.id]: v,
                }))
              }
              onChangeFamily={(patch) =>
                updateProjectProblemFamily(family.id, patch)
              }
              onRemoveFamily={() => removeProjectProblemFamily(family.id)}
              onRestoreFamily={() =>
                updateProjectProblemFamily(family.id, { active: true })
              }
              onAddProblem={() => {
                addProjectProblem(
                  family.id,
                  newProblemByFamily[family.id] ?? "",
                );
                setNewProblemByFamily((prev) => ({
                  ...prev,
                  [family.id]: "",
                }));
              }}
              onChangeProblem={(id, patch) => updateProjectProblem(id, patch)}
              onRemoveProblem={(id) => removeProjectProblem(id)}
              onRestoreProblem={(id) =>
                updateProjectProblem(id, { active: true })
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
  problems,
  newProblem,
  onNewProblemChange,
  onChangeFamily,
  onRemoveFamily,
  onRestoreFamily,
  onAddProblem,
  onChangeProblem,
  onRemoveProblem,
  onRestoreProblem,
}: {
  family: ProjectProblemFamilyDef;
  problems: ProjectProblemDef[];
  newProblem: string;
  onNewProblemChange: (v: string) => void;
  onChangeFamily: (patch: Partial<ProjectProblemFamilyDef>) => void;
  onRemoveFamily: () => void;
  onRestoreFamily: () => void;
  onAddProblem: () => void;
  onChangeProblem: (id: string, patch: Partial<ProjectProblemDef>) => void;
  onRemoveProblem: (id: string) => void;
  onRestoreProblem: (id: string) => void;
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
              placeholder="Ce que couvre cette famille de problèmes…"
            />
          </label>

          <h4 className="nested-hint">Problèmes / cases à cocher</h4>
          <ul className="settings-list intel-feature-list">
            {problems.map((p) => (
              <li key={p.id} className={!p.active ? "inactive" : ""}>
                <input
                  value={p.label}
                  onChange={(e) =>
                    onChangeProblem(p.id, { label: e.target.value })
                  }
                  disabled={!p.active}
                  placeholder="Libellé problème"
                />
                <textarea
                  rows={2}
                  value={p.description}
                  onChange={(e) =>
                    onChangeProblem(p.id, { description: e.target.value })
                  }
                  disabled={!p.active}
                  placeholder="Aide / preuve attendue (opt.)"
                />
                {p.active ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onRemoveProblem(p.id)}
                  >
                    Retirer
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onRestoreProblem(p.id)}
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
              onAddProblem();
            }}
          >
            <input
              value={newProblem}
              onChange={(e) => onNewProblemChange(e.target.value)}
              placeholder="Nouveau problème"
              required
            />
            <button type="submit">Ajouter</button>
          </form>
        </>
      )}
    </li>
  );
}
