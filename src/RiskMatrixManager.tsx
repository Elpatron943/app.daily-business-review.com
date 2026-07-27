import { useOrgConfig } from "./config/ConfigContext";
import { defaultConfig } from "./config/defaults";

export default function RiskMatrixManager() {
  const { config, updateRiskMatrix } = useOrgConfig();
  const matrix = config.riskMatrix ?? defaultConfig.riskMatrix;

  const setHigh = (value: string) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    updateRiskMatrix({
      processHighThreshold: Math.min(100, Math.max(0, Math.round(n))),
    });
  };

  const setLow = (value: string) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    updateRiskMatrix({
      processLowThreshold: Math.min(100, Math.max(0, Math.round(n))),
    });
  };

  const patchAxis = (
    key: keyof typeof matrix.axisLabels,
    value: string,
  ) => {
    updateRiskMatrix({
      axisLabels: { ...matrix.axisLabels, [key]: value },
    });
  };

  const resetDefaults = () => {
    updateRiskMatrix(structuredClone(defaultConfig.riskMatrix));
  };

  return (
    <div className="risk-matrix-manager">
      <section className="risk-cfg-section">
        <h3>Seuils process (couleur des points)</h3>
        <div className="risk-cfg-grid">
          <label className="risk-cfg-field">
            <span>Seuil process élevé (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={matrix.processHighThreshold}
              onChange={(e) => setHigh(e.target.value)}
            />
          </label>
          <label className="risk-cfg-field">
            <span>Seuil process / mapping faible (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={matrix.processLowThreshold}
              onChange={(e) => setLow(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="risk-cfg-section">
        <h3>Libellés d’axes</h3>
        <div className="risk-cfg-grid">
          {(
            [
              ["processHigh", "Libellé process élevé"],
              ["processMid", "Libellé process moyen"],
              ["processLow", "Libellé process faible"],
              ["pipeline", "Axe horizontal (mapping)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="risk-cfg-field">
              <span>{label}</span>
              <input
                value={matrix.axisLabels[key]}
                onChange={(e) => patchAxis(key, e.target.value)}
              />
            </label>
          ))}
        </div>
      </section>

      <div className="risk-cfg-actions">
        <button type="button" className="ghost" onClick={resetDefaults}>
          Réinitialiser les défauts
        </button>
      </div>
    </div>
  );
}
