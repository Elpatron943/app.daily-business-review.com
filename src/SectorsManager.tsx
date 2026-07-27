import { useMemo, useState, type FormEvent } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import type { SectorDef } from "./config/types";

export default function SectorsManager({
  showInactive,
}: {
  showInactive: boolean;
}) {
  const { config, addSector, updateSector, removeSector } = useOrgConfig();

  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const list = useMemo(
    () =>
      [...(config.sectors ?? [])]
        .filter((s) => showInactive || s.active)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "fr")),
    [config.sectors, showInactive],
  );

  const resetForm = () => {
    setEditingId(null);
    setName("");
  };

  const startEdit = (s: SectorDef) => {
    setEditingId(s.id);
    setName(s.name);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (editingId) {
      updateSector(editingId, { name: name.trim() });
    } else {
      addSector(name);
    }
    resetForm();
  };

  return (
    <div className="directions-manager">
      <form className="settings-add" onSubmit={submit}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du secteur (ex. Tech / SaaS)"
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
        {list.map((s) => (
          <li key={s.id} className={!s.active ? "inactive" : ""}>
            <button
              type="button"
              className="linkish dir-name"
              onClick={() => startEdit(s)}
            >
              {s.name}
            </button>
            {s.active ? (
              <button
                type="button"
                className="ghost"
                onClick={() => removeSector(s.id)}
              >
                Désactiver
              </button>
            ) : (
              <button
                type="button"
                className="ghost"
                onClick={() => updateSector(s.id, { active: true })}
              >
                Réactiver
              </button>
            )}
          </li>
        ))}
        {list.length === 0 && (
          <li className="muted">Aucun secteur dans le catalogue.</li>
        )}
      </ul>
    </div>
  );
}
