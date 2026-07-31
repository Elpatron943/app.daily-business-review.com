import { useOrgConfig } from "../config/ConfigContext";
import { defaultConfig } from "../config/defaults";

/** Carte « finalité » + mini illustration selon le sous-menu. */
export default function SettingsPurposeCard({
  where,
  purpose,
  visual,
}: {
  where: string;
  purpose: string;
  visual?: "risk-matrix" | "kpi" | "map-types" | "funnel" | "generic";
}) {
  return (
    <aside className="settings-purpose" aria-label="Finalité du paramétrage">
      <div className="settings-purpose-copy">
        <p className="settings-purpose-where">
          <span>Dans l’app</span> {where}
        </p>
        <p className="settings-purpose-text">{purpose}</p>
      </div>
      {visual === "risk-matrix" && <RiskMatrixPreview />}
      {visual === "kpi" && <KpiPreview />}
      {visual === "map-types" && <MapTypesPreview />}
      {visual === "funnel" && <FunnelPreview />}
    </aside>
  );
}

function RiskMatrixPreview() {
  const { config } = useOrgConfig();
  const matrix = config.riskMatrix ?? defaultConfig.riskMatrix;
  const high = matrix.axisLabels.processHigh || "Élevé";
  const mid = matrix.axisLabels.processMid || "Moyen";
  const low = matrix.axisLabels.processLow || "Faible";
  const pipeline = matrix.axisLabels.pipeline || "Mapping";

  return (
    <div className="settings-viz settings-viz-risk" aria-hidden>
      <div className="settings-viz-risk-grid">
        <span className="settings-viz-risk-y">{high}</span>
        <span className="settings-viz-risk-y">{mid}</span>
        <span className="settings-viz-risk-y">{low}</span>
        <div className="settings-viz-risk-band is-high">
          <i />
          <i className="dim" />
        </div>
        <div className="settings-viz-risk-band is-mid">
          <i className="dim" />
          <i />
          <i className="dim" />
        </div>
        <div className="settings-viz-risk-band is-low">
          <i />
          <i className="dim" />
        </div>
      </div>
      <div className="settings-viz-risk-x">
        <span>
          ≤{matrix.processLowThreshold}%
        </span>
        <span>{pipeline}</span>
        <span>≥{matrix.processHighThreshold}%</span>
      </div>
      <p className="settings-viz-caption">
        Aperçu : seuils {matrix.processLowThreshold}% /{" "}
        {matrix.processHighThreshold}%
      </p>
    </div>
  );
}

function KpiPreview() {
  return (
    <div className="settings-viz settings-viz-kpi" aria-hidden>
      <div className="settings-viz-kpi-card">
        <span>CA installé</span>
        <strong>€</strong>
      </div>
      <div className="settings-viz-kpi-card is-target">
        <span>Cible</span>
        <strong>€</strong>
      </div>
      <p className="settings-viz-caption">Cartes KPI du Dashboard</p>
    </div>
  );
}

function MapTypesPreview() {
  const { activeContactTypes } = useOrgConfig();
  const sample = activeContactTypes.slice(0, 4);
  return (
    <div className="settings-viz settings-viz-map" aria-hidden>
      <div className="settings-viz-map-canvas">
        {(sample.length ? sample : [{ id: "x", label: "Rôle", color: "#0f766e" }]).map(
          (t, i) => (
            <span
              key={t.id}
              className="settings-viz-map-dot"
              style={{
                background: t.color,
                left: `${18 + i * 18}%`,
                top: `${30 + (i % 2) * 28}%`,
              }}
              title={t.label}
            />
          ),
        )}
      </div>
      <p className="settings-viz-caption">Pastilles sur la cartographie</p>
    </div>
  );
}

function FunnelPreview() {
  const { activeOppPhases } = useOrgConfig();
  const phases = activeOppPhases.slice(0, 5);
  const labels = phases.length
    ? phases.map((p) => p.label)
    : ["Whitespace", "Discovery", "…", "Won"];
  return (
    <div className="settings-viz settings-viz-funnel" aria-hidden>
      <ol>
        {labels.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ol>
      <p className="settings-viz-caption">Phases du funnel opportunité</p>
    </div>
  );
}
