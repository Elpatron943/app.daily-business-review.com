import { useMemo } from "react";
import { useOrgConfig } from "./config/ConfigContext";

type Props = {
  selectedIds: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Contexte court sous le titre. */
  hint?: string;
};

/** Cases motivations personnelles (avancer / reculer), catalogue org. */
export default function PersonalMotivationsChecks({
  selectedIds,
  onChange,
  disabled,
  hint = "Drivers personnels pour faire avancer ou ralentir le projet.",
}: Props) {
  const { activePersonalMotivations } = useOrgConfig();

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const advance = useMemo(
    () => activePersonalMotivations.filter((m) => m.polarity === "advance"),
    [activePersonalMotivations],
  );
  const retreat = useMemo(
    () => activePersonalMotivations.filter((m) => m.polarity === "retreat"),
    [activePersonalMotivations],
  );

  function toggle(id: string) {
    if (disabled) return;
    const next = selected.has(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  }

  if (activePersonalMotivations.length === 0) {
    return (
      <p className="muted">
        Aucune motivation configurée (Setup → Contacts → Motivations
        personnelles).
      </p>
    );
  }

  return (
    <div className="personal-motivations">
      {hint ? <p className="muted personal-motivations-hint">{hint}</p> : null}
      <div className="personal-motivations-cols">
        {advance.length > 0 && (
          <div className="personal-motivations-col is-advance">
            <h4>Faire avancer</h4>
            <ul className="opp-module-checks">
              {advance.map((m) => (
                <li key={m.id}>
                  <label title={m.description || undefined}>
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      disabled={disabled}
                      onChange={() => toggle(m.id)}
                    />
                    <span>
                      <strong>{m.label}</strong>
                      {m.description ? (
                        <em className="muted">{m.description}</em>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        {retreat.length > 0 && (
          <div className="personal-motivations-col is-retreat">
            <h4>Freiner / reculer</h4>
            <ul className="opp-module-checks">
              {retreat.map((m) => (
                <li key={m.id}>
                  <label title={m.description || undefined}>
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      disabled={disabled}
                      onChange={() => toggle(m.id)}
                    />
                    <span>
                      <strong>{m.label}</strong>
                      {m.description ? (
                        <em className="muted">{m.description}</em>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
