import {
  INACTION_FORMULA_OPS,
  addFormulaInput,
  defaultFrequencyForVar,
  formatInactionFormulaPreview,
  formulaVarsByGroup,
  formulaVarLabel,
  frequenciesForVar,
  hasFrequencySelect,
  removeFormulaInput,
  setFormulaInputFrequency,
  setFormulaInputLabel,
  setFormulaInputVar,
  type InactionFormula,
  type InactionFormulaOp,
  type ManTimeFrequency,
} from "./formula";

type Props = {
  formula: InactionFormula;
  onChange: (next: InactionFormula) => void;
  /** Compact = deal ; full = settings */
  compact?: boolean;
};

/**
 * Constructeur de formule CoI — facteurs via sélecteur structuré.
 */
export default function InactionFormulaEditor({
  formula,
  onChange,
  compact = false,
}: Props) {
  const groups = formulaVarsByGroup();

  function setEnabled(enabled: boolean) {
    onChange({
      ...formula,
      enabled,
      inputs:
        formula.inputs.length > 0 ? formula.inputs : [{ id: "amountEur" }],
      operators: formula.operators,
    });
  }

  function patchOp(index: number, op: InactionFormulaOp) {
    const operators = formula.operators.map((o, i) => (i === index ? op : o));
    onChange({ ...formula, operators });
  }

  return (
    <div className={`inaction-formula${compact ? " is-compact" : ""}`}>
      <label className="inaction-formula-enable">
        <input
          type="checkbox"
          checked={formula.enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>Résultat = calcul (pas une saisie € seule)</span>
      </label>

      {formula.enabled && (
        <>
          <p className="muted inaction-formula-preview">
            {formatInactionFormulaPreview(formula)}
          </p>
          <ul className="inaction-formula-chain">
            {formula.inputs.map((inp, i) => (
              <li key={`${inp.id}-${i}`}>
                {i > 0 && (
                  <select
                    className="inaction-formula-op"
                    value={formula.operators[i - 1] ?? "*"}
                    aria-label={`Opérateur ${i}`}
                    onChange={(e) =>
                      patchOp(i - 1, e.target.value as InactionFormulaOp)
                    }
                  >
                    {INACTION_FORMULA_OPS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  className="inaction-formula-var"
                  value={inp.id}
                  aria-label={`Variable ${i + 1}`}
                  onChange={(e) =>
                    onChange(setFormulaInputVar(formula, i, e.target.value))
                  }
                >
                  {groups.map((g) => (
                    <optgroup key={g.group} label={g.label}>
                      {g.vars.map((v) => (
                        <option
                          key={v.id}
                          value={v.id}
                          disabled={
                            formula.inputs.some(
                              (other, j) => j !== i && other.id === v.id,
                            )
                          }
                        >
                          {v.unit ? `${v.label} (${v.unit})` : v.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  className="inaction-formula-alias"
                  type="text"
                  value={inp.label ?? ""}
                  placeholder={formulaVarLabel(inp.id)}
                  aria-label={`Libellé personnalisé ${i + 1}`}
                  onChange={(e) =>
                    onChange(setFormulaInputLabel(formula, i, e.target.value))
                  }
                />
                {hasFrequencySelect(inp.id) && (
                  <select
                    className="inaction-formula-freq"
                    value={
                      frequenciesForVar(inp.id).some(
                        (f) =>
                          f.id ===
                          (inp.frequency ?? defaultFrequencyForVar(inp.id)),
                      )
                        ? (inp.frequency ?? defaultFrequencyForVar(inp.id))
                        : defaultFrequencyForVar(inp.id)
                    }
                    aria-label={`Périodicité ${i + 1}`}
                    onChange={(e) =>
                      onChange(
                        setFormulaInputFrequency(
                          formula,
                          i,
                          e.target.value as ManTimeFrequency,
                        ),
                      )
                    }
                  >
                    {frequenciesForVar(inp.id).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                )}
                {formula.inputs.length > 1 && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onChange(removeFormulaInput(formula, i))}
                  >
                    Retirer
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="ghost"
            onClick={() => onChange(addFormulaInput(formula))}
            disabled={formula.inputs.length >= 14}
          >
            + Facteur
          </button>
          <p className="muted inaction-formula-hint">
            Temps homme = heures par période (→ h/an). Coût ETP = € par
            période (→ €/h). Produit = €/an. « % de » = gauche × droite / 100.
          </p>
        </>
      )}
    </div>
  );
}
