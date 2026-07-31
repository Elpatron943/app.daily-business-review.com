import { useEffect, useId, type MouseEvent } from "react";
import type { SettingsInfoDiagram } from "./settingsInfoDiagrams";
import SettingsInfoScreenMock from "./SettingsInfoScreenMocks";

type Props = {
  info: SettingsInfoDiagram | null;
  open: boolean;
  onClose: () => void;
};

/** Dialogue Info : parcours + copies d’écran avec champ / calcul / IA mis en valeur. */
export default function SettingsInfoDialog({ info, open, onClose }: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !info) return null;

  return (
    <div
      className="settings-info-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-info-dialog">
        <header className="settings-info-head">
          <div>
            <p className="settings-info-kicker">Informations</p>
            <h2 id={titleId}>{info.title}</h2>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Fermer
          </button>
        </header>

        <p className="settings-info-intro">{info.explanation}</p>

        <section className="settings-info-path" aria-label="Parcours">
          <h3>Parcours</h3>
          <ol>
            {info.path.map((step, i) => (
              <li key={`${i}-${step}`}>
                <span className="settings-info-path-n">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="settings-info-screens" aria-label="Écrans">
          <h3>Dans l’app</h3>
          <div className="settings-info-screens-list">
            {info.screens.map((s) => (
              <figure key={`${s.screen}-${s.highlight}-${s.label}`}>
                <figcaption>{s.label}</figcaption>
                <SettingsInfoScreenMock
                  screen={s.screen}
                  highlight={s.highlight}
                />
              </figure>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function SettingsInfoButton({
  onClick,
  label,
}: {
  onClick: (e: MouseEvent) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      className="settings-info-trigger"
      onClick={onClick}
      title={label ?? "Voir où c’est utilisé"}
      aria-label={label ?? "Informations : où c’est utilisé dans l’app"}
    >
      i
    </button>
  );
}
