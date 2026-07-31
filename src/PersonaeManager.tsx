import { useMemo, useState, type FormEvent } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import type { PersonaDef } from "./config/types";

export default function PersonaeManager({
  showInactive,
}: {
  showInactive: boolean;
}) {
  const { config, addPersona, updatePersona, removePersona } = useOrgConfig();

  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const list = useMemo(
    () =>
      [...(config.personae ?? [])]
        .filter((d) => showInactive || d.active)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [config.personae, showInactive],
  );

  const resetForm = () => {
    setEditingId(null);
    setName("");
  };

  const startEdit = (d: PersonaDef) => {
    setEditingId(d.id);
    setName(d.name);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (editingId) {
      updatePersona(editingId, { name: name.trim() });
    } else {
      addPersona(name);
    }
    resetForm();
  };

  return (
    <div className="personae-manager">
      <form className="settings-add" onSubmit={submit}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du persona (ex. CFO / Finance Buyer)"
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
                onClick={() => removePersona(d.id)}
              >
                Désactiver
              </button>
            ) : (
              <button
                type="button"
                className="ghost"
                onClick={() => updatePersona(d.id, { active: true })}
              >
                Réactiver
              </button>
            )}
          </li>
        ))}
      </ul>
      {list.length === 0 && (
        <p className="muted">Aucun persona — ajoutez vos profils acheteurs cibles.</p>
      )}
    </div>
  );
}
