import { useMemo, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import type {
  WhyNowObjectiveDef,
  WhyNowObjectiveKind,
  WhyNowValueUnit,
} from "./config/types";
import { WHY_NOW_VALUE_UNITS } from "./config/types";

/**
 * Settings : objectifs quanti / quali — obsolète sur le deal.
 */
export default function WhyNowObjectivesManager({
  showInactive,
}: {
  showInactive: boolean;
}) {
  const {
    config,
    addWhyNowObjective,
    updateWhyNowObjective,
    removeWhyNowObjective,
  } = useOrgConfig();

  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] =
    useState<WhyNowObjectiveKind>("quantitative");
  const [newUnit, setNewUnit] = useState<WhyNowValueUnit>("percent");

  const items = useMemo(
    () =>
      [...(config.whyNowObjectives ?? [])]
        .filter((o) => showInactive || o.active)
        .sort((a, b) => {
          if (a.kind !== b.kind) {
            return a.kind === "quantitative" ? -1 : 1;
          }
          return a.order - b.order;
        }),
    [config.whyNowObjectives, showInactive],
  );

  return (
    <div className="why-now-objectives-manager">
      <header className="catalogue-head">
        <div>
          <h3>Objectifs Pourquoi maintenant (obsolète)</h3>
          <p className="muted">
            Retiré du deal. CE = date / priorisation ; CoI = ampleur du
            problème. Catalogue conservé pour migration.
          </p>
        </div>
      </header>

      <form
        className="settings-add"
        onSubmit={(e) => {
          e.preventDefault();
          addWhyNowObjective(newLabel, newKind, {
            valueUnit: newKind === "quantitative" ? newUnit : "number",
          });
          setNewLabel("");
        }}
      >
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nouvel objectif"
          required
        />
        <select
          value={newKind}
          onChange={(e) =>
            setNewKind(e.target.value as WhyNowObjectiveKind)
          }
          aria-label="Type"
        >
          <option value="quantitative">Quantitatif</option>
          <option value="qualitative">Qualitatif</option>
        </select>
        {newKind === "quantitative" ? (
          <select
            value={newUnit}
            onChange={(e) =>
              setNewUnit(e.target.value as WhyNowValueUnit)
            }
            aria-label="Unité"
          >
            {WHY_NOW_VALUE_UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        ) : null}
        <button type="submit">Ajouter</button>
      </form>

      {items.length === 0 ? (
        <p className="muted">Aucun objectif — ajoutez-en un.</p>
      ) : (
        <ul className="settings-list intel-feature-list">
          {items.map((o) => (
            <ObjectiveRow
              key={o.id}
              item={o}
              onChange={(patch) => updateWhyNowObjective(o.id, patch)}
              onRemove={() => removeWhyNowObjective(o.id)}
              onRestore={() =>
                updateWhyNowObjective(o.id, { active: true })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ObjectiveRow({
  item,
  onChange,
  onRemove,
  onRestore,
}: {
  item: WhyNowObjectiveDef;
  onChange: (patch: Partial<WhyNowObjectiveDef>) => void;
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
        value={item.kind}
        onChange={(e) =>
          onChange({ kind: e.target.value as WhyNowObjectiveKind })
        }
        disabled={!item.active}
        aria-label="Type"
      >
        <option value="quantitative">Quantitatif</option>
        <option value="qualitative">Qualitatif</option>
      </select>
      {item.kind === "quantitative" ? (
        <select
          value={item.valueUnit || "number"}
          onChange={(e) =>
            onChange({ valueUnit: e.target.value as WhyNowValueUnit })
          }
          disabled={!item.active}
          aria-label="Unité"
        >
          {WHY_NOW_VALUE_UNITS.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      ) : null}
      <textarea
        rows={2}
        value={item.description}
        onChange={(e) => onChange({ description: e.target.value })}
        disabled={!item.active}
        placeholder="Aide / exemple (opt.)"
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
