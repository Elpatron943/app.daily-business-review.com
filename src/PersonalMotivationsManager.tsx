import { useMemo, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import type {
  PersonalMotivationDef,
  PersonalMotivationPolarity,
} from "./config/types";

/**
 * Settings : motivations personnelles (avancer / freiner un projet).
 */
export default function PersonalMotivationsManager({
  showInactive,
}: {
  showInactive: boolean;
}) {
  const {
    config,
    addPersonalMotivation,
    updatePersonalMotivation,
    removePersonalMotivation,
  } = useOrgConfig();

  const [newLabel, setNewLabel] = useState("");
  const [newPolarity, setNewPolarity] =
    useState<PersonalMotivationPolarity>("advance");

  const items = useMemo(
    () =>
      [...(config.personalMotivations ?? [])]
        .filter((m) => showInactive || m.active)
        .sort((a, b) => {
          if (a.polarity !== b.polarity) {
            return a.polarity === "advance" ? -1 : 1;
          }
          return a.order - b.order;
        }),
    [config.personalMotivations, showInactive],
  );

  return (
    <div className="personal-motivations-manager">
      <header className="catalogue-head">
        <div>
          <h3>Motivations personnelles</h3>
          <p className="muted">
            Drivers individuels pour faire avancer ou freiner un projet
            (carrière, objectif manager…). Utilisés sur les fiches Contact et
            les contacts d’opportunité.
          </p>
        </div>
      </header>

      <form
        className="settings-add"
        onSubmit={(e) => {
          e.preventDefault();
          addPersonalMotivation(newLabel, newPolarity);
          setNewLabel("");
        }}
      >
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nouvelle motivation"
          required
        />
        <select
          value={newPolarity}
          onChange={(e) =>
            setNewPolarity(e.target.value as PersonalMotivationPolarity)
          }
          aria-label="Polarité"
        >
          <option value="advance">Faire avancer</option>
          <option value="retreat">Freiner / reculer</option>
        </select>
        <button type="submit">Ajouter</button>
      </form>

      {items.length === 0 ? (
        <p className="muted">Aucune motivation — ajoutez-en une.</p>
      ) : (
        <ul className="settings-list intel-feature-list">
          {items.map((m) => (
            <MotivationRow
              key={m.id}
              item={m}
              onChange={(patch) => updatePersonalMotivation(m.id, patch)}
              onRemove={() => removePersonalMotivation(m.id)}
              onRestore={() =>
                updatePersonalMotivation(m.id, { active: true })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MotivationRow({
  item,
  onChange,
  onRemove,
  onRestore,
}: {
  item: PersonalMotivationDef;
  onChange: (patch: Partial<PersonalMotivationDef>) => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  return (
    <li className={!item.active ? "inactive" : ""}>
      <input
        value={item.label}
        onChange={(e) => onChange({ label: e.target.value })}
        disabled={!item.active}
        placeholder="Libellé"
      />
      <select
        value={item.polarity}
        onChange={(e) =>
          onChange({
            polarity: e.target.value as PersonalMotivationPolarity,
          })
        }
        disabled={!item.active}
        aria-label="Polarité"
      >
        <option value="advance">Faire avancer</option>
        <option value="retreat">Freiner / reculer</option>
      </select>
      <textarea
        rows={2}
        value={item.description}
        onChange={(e) => onChange({ description: e.target.value })}
        disabled={!item.active}
        placeholder="Description (opt.)"
      />
      {item.active ? (
        <button type="button" className="ghost" onClick={onRemove}>
          Retirer
        </button>
      ) : (
        <button type="button" className="ghost" onClick={onRestore}>
          Réactiver
        </button>
      )}
    </li>
  );
}
