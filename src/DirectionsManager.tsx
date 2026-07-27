import { useMemo, useState, type FormEvent } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import type { DirectionDef } from "./config/types";

export default function DirectionsManager({
  showInactive,
}: {
  showInactive: boolean;
}) {
  const {
    config,
    addDirection,
    updateDirection,
    removeDirection,
  } = useOrgConfig();

  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const list = useMemo(
    () =>
      [...config.directions]
        .filter((d) => showInactive || d.active)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [config.directions, showInactive],
  );

  const resetForm = () => {
    setEditingId(null);
    setName("");
  };

  const startEdit = (d: DirectionDef) => {
    setEditingId(d.id);
    setName(d.name);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (editingId) {
      updateDirection(editingId, { name: name.trim() });
    } else {
      addDirection(name);
    }
    resetForm();
  };

  return (
    <div className="directions-manager">
      <form className="settings-add" onSubmit={submit}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom de la direction (ex. Finance)"
          required
        />
        <button type="submit">{editingId ? "Enregistrer" : "Ajouter"}</button>
        {editingId && (
          <button type="button" className="ghost" onClick={resetForm}>
            Annuler
          </button>
        )}
      </form>

      <ul className="settings-list">
        {list.map((d) => (
          <li key={d.id} className={!d.active ? "inactive" : ""}>
            <button
              type="button"
              className="linkish dir-name"
              onClick={() => startEdit(d)}
            >
              {d.name}
            </button>
            {d.active ? (
              <button
                type="button"
                className="ghost"
                onClick={() => removeDirection(d.id)}
              >
                Désactiver
              </button>
            ) : (
              <button
                type="button"
                className="ghost"
                onClick={() => updateDirection(d.id, { active: true })}
              >
                Réactiver
              </button>
            )}
          </li>
        ))}
        {list.length === 0 && (
          <li className="muted">Aucune direction dans le catalogue.</li>
        )}
      </ul>
    </div>
  );
}
