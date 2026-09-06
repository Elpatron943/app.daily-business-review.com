import { useMemo, useState } from "react";
import { formatEur } from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import {
  computeWhyNowValue,
  inactionLeverAnnualEur,
  type DualNumber,
  type InactionLeverQuant,
  type Opportunity,
  type OpportunityWhyNow,
  DEFAULT_PRODUCTIVE_HOURS_PER_YEAR,
  EMPTY_DUAL,
  EMPTY_INACTION_LEVER_QUANT,
  EMPTY_OPPORTUNITY_WHY_NOW,
} from "./opportunities/OpportunityContext";
import { formatWhyNowNum } from "./whyNowDualUi";
import InactionFormulaModal from "./inaction/InactionFormulaModal";
import { INACTION_KIND_GROUPS } from "./inaction/kinds";
import {
  emptyInactionFormula,
  formatInactionFormulaPreview,
  formulaInputLabel,
  hasFrequencySelect,
  isManTimeVar,
  isEtpCostVar,
  defaultFrequencyForVar,
  frequenciesForVar,
  normalizeManTimeFrequency,
  annualEtpToPeriodCost,
  type InactionFormula,
  type ManTimeFrequency,
} from "./inaction/formula";

type Props = {
  opportunity: Opportunity;
  onUpdate: (patch: Partial<Opportunity>) => void;
};

/** Une seule valeur — stockée en Dual pour compatibilité. */
function dualOne(n: number): DualNumber {
  return { prospect: n, seller: n };
}

function dualRead(d: DualNumber | undefined): number {
  if (!d) return 0;
  return d.prospect || d.seller || 0;
}

function inputVal(n: number): number | "" {
  return n === 0 ? "" : n;
}

/**
 * Pourquoi maintenant → Coût d’inaction :
 * saisie simple (pas Prospect / Hypothèse).
 */
export default function OpportunityWhyNowPanel({
  opportunity,
  onUpdate,
}: Props) {
  const { config, activeInactionLevers } = useOrgConfig();
  const whyNow = opportunity.whyNow ?? EMPTY_OPPORTUNITY_WHY_NOW;
  const leverCatalog = useMemo(
    () =>
      activeInactionLevers.map((l) => ({
        id: l.id,
        valueKind: l.valueKind,
        formula: (l.formula as InactionFormula | null | undefined) ?? null,
      })),
    [activeInactionLevers],
  );

  const value = useMemo(
    () => computeWhyNowValue(whyNow, undefined, leverCatalog),
    [whyNow, leverCatalog],
  );

  const [formulaModalLeverId, setFormulaModalLeverId] = useState<string | null>(
    null,
  );
  const formulaModalLever = activeInactionLevers.find(
    (l) => l.id === formulaModalLeverId,
  );

  const hoursYear =
    whyNow.productiveHoursPerYear || DEFAULT_PRODUCTIVE_HOURS_PER_YEAR;
  const etpCost = dualRead(whyNow.etpAnnualCostEur);
  const hourly = pickHourly(etpCost, hoursYear);

  const selected = useMemo(
    () => new Set(whyNow.inactionLeverIds ?? []),
    [whyNow.inactionLeverIds],
  );

  const needsEtpRate = useMemo(
    () => activeInactionLevers.some((l) => l.valueKind === "productivity"),
    [activeInactionLevers],
  );

  const sections = useMemo(() => {
    const families = config.inactionLeverFamilies ?? [];
    return INACTION_KIND_GROUPS.map((group) => {
      const family = families.find((f) => f.id === group.familyId);
      if (family?.active !== true) return null;
      return {
        group,
        description: family.description?.trim() || group.blurb,
        levers: activeInactionLevers.filter((l) => l.valueKind === group.kind),
      };
    }).filter(
      (s): s is NonNullable<typeof s> =>
        s != null && s.levers.length > 0,
    );
  }, [activeInactionLevers, config.inactionLeverFamilies]);

  function patchWhyNow(patch: Partial<OpportunityWhyNow>) {
    onUpdate({
      whyNow: {
        ...EMPTY_OPPORTUNITY_WHY_NOW,
        ...whyNow,
        ...patch,
        etpAnnualCostEur: {
          ...EMPTY_DUAL,
          ...(patch.etpAnnualCostEur ?? whyNow.etpAnnualCostEur),
        },
        productiveHoursPerYear:
          patch.productiveHoursPerYear ??
          whyNow.productiveHoursPerYear ??
          DEFAULT_PRODUCTIVE_HOURS_PER_YEAR,
        inactionEtp: {
          ...EMPTY_DUAL,
          ...(patch.inactionEtp ?? whyNow.inactionEtp),
        },
        inactionRisk: {
          ...EMPTY_DUAL,
          ...(patch.inactionRisk ?? whyNow.inactionRisk),
        },
        inactionEurAnnual: {
          ...EMPTY_DUAL,
          ...(patch.inactionEurAnnual ?? whyNow.inactionEurAnnual),
        },
        residualEtp: {
          ...EMPTY_DUAL,
          ...(patch.residualEtp ?? whyNow.residualEtp),
        },
        attainmentPct: {
          ...EMPTY_DUAL,
          ...(patch.attainmentPct ?? whyNow.attainmentPct),
        },
        solutionOneShotEur: {
          ...EMPTY_DUAL,
          ...(patch.solutionOneShotEur ?? whyNow.solutionOneShotEur),
        },
        solutionAnnualEur: {
          ...EMPTY_DUAL,
          ...(patch.solutionAnnualEur ?? whyNow.solutionAnnualEur),
        },
        inactionLeverIds: patch.inactionLeverIds ?? whyNow.inactionLeverIds ?? [],
        inactionLeverValues:
          patch.inactionLeverValues ?? whyNow.inactionLeverValues ?? {},
        objectiveGaps: whyNow.objectiveGaps ?? {},
        objectiveOutcomes: whyNow.objectiveOutcomes ?? {},
      },
    });
  }

  function toggleLever(id: string) {
    const cur = whyNow.inactionLeverIds ?? [];
    if (selected.has(id)) {
      const values = { ...(whyNow.inactionLeverValues ?? {}) };
      delete values[id];
      patchWhyNow({
        inactionLeverIds: cur.filter((x) => x !== id),
        inactionLeverValues: values,
      });
    } else {
      patchWhyNow({
        inactionLeverIds: [...cur, id],
        inactionLeverValues: {
          ...(whyNow.inactionLeverValues ?? {}),
          [id]:
            whyNow.inactionLeverValues?.[id] ?? {
              ...EMPTY_INACTION_LEVER_QUANT,
              etpCount: { ...EMPTY_DUAL },
              hours: { ...EMPTY_DUAL },
              frequencyPerYear: { ...EMPTY_DUAL },
              eur: { ...EMPTY_DUAL },
              formulaInputs: {},
            },
        },
      });
    }
  }

  function patchQuant(
    id: string,
    field: keyof InactionLeverQuant,
    raw: string,
  ) {
    const cur =
      whyNow.inactionLeverValues?.[id] ?? {
        etpCount: { ...EMPTY_DUAL },
        hours: { ...EMPTY_DUAL },
        frequencyPerYear: { ...EMPTY_DUAL },
        eur: { ...EMPTY_DUAL },
        formulaInputs: {},
      };
    const n = raw === "" ? 0 : Number(raw) || 0;
    if (field === "formulaInputs" || field === "formulaOverride") return;
    patchWhyNow({
      inactionLeverValues: {
        ...(whyNow.inactionLeverValues ?? {}),
        [id]: {
          ...cur,
          [field]: dualOne(n),
        },
      },
    });
  }

  function patchFormulaInput(id: string, inputId: string, raw: string) {
    const cur =
      whyNow.inactionLeverValues?.[id] ?? {
        ...EMPTY_INACTION_LEVER_QUANT,
        formulaInputs: {},
      };
    const n = raw === "" ? 0 : Number(raw) || 0;
    patchWhyNow({
      inactionLeverValues: {
        ...(whyNow.inactionLeverValues ?? {}),
        [id]: {
          ...cur,
          formulaInputs: { ...(cur.formulaInputs ?? {}), [inputId]: n },
        },
      },
    });
  }

  function patchFormulaFrequency(
    id: string,
    inputId: string,
    frequency: ManTimeFrequency,
  ) {
    const cur =
      whyNow.inactionLeverValues?.[id] ?? {
        ...EMPTY_INACTION_LEVER_QUANT,
        formulaInputs: {},
      };
    const nextFreq = isManTimeVar(inputId)
      ? normalizeManTimeFrequency(frequency)
      : frequency;
    patchWhyNow({
      inactionLeverValues: {
        ...(whyNow.inactionLeverValues ?? {}),
        [id]: {
          ...cur,
          formulaFrequencies: {
            ...(cur.formulaFrequencies ?? {}),
            [inputId]: nextFreq,
          },
        },
      },
    });
  }

  function patchFormulaOverride(id: string, formula: InactionFormula) {
    const cur =
      whyNow.inactionLeverValues?.[id] ?? {
        ...EMPTY_INACTION_LEVER_QUANT,
        formulaInputs: {},
      };
    patchWhyNow({
      inactionLeverValues: {
        ...(whyNow.inactionLeverValues ?? {}),
        [id]: { ...cur, formulaOverride: formula },
      },
    });
  }

  function resolveFormula(
    leverId: string,
    catalogFormula: InactionFormula | null | undefined,
  ): InactionFormula | null {
    const q = whyNow.inactionLeverValues?.[leverId];
    if (q && "formulaOverride" in q && q.formulaOverride !== undefined) {
      return q.formulaOverride;
    }
    return catalogFormula ?? null;
  }

  return (
    <section className="opp-whynow" aria-label="Coût de l’inaction">
      <header className="opp-whynow-head">
        <div>
          <h2>Coût de l’inaction</h2>
          <p className="muted">
            Trois natures : productivité (temps → €), gain (CA), coût évité
            (risque). Settings → Opportunités → Coût d’inaction.
          </p>
        </div>
      </header>

      {needsEtpRate && (
      <article className="opp-whynow-card opp-whynow-gap">
        <div className="opp-whynow-dual-deal">
          <label className="opp-whynow-single-field">
            <span className="opp-whynow-dual-label">
              Coût annuel d’1 ETP (€)
              <em className="muted">
                Pour les lignes productivité uniquement.
              </em>
            </span>
            <input
              type="number"
              min={0}
              step="any"
              value={inputVal(etpCost)}
              placeholder="0"
              onChange={(e) => {
                const n = e.target.value === "" ? 0 : Number(e.target.value) || 0;
                patchWhyNow({ etpAnnualCostEur: dualOne(n) });
              }}
            />
          </label>
          <label className="opp-whynow-horizon">
            Heures productives / an
            <input
              type="number"
              min={1}
              step={1}
              value={hoursYear || ""}
              onChange={(e) =>
                patchWhyNow({
                  productiveHoursPerYear: Math.max(
                    1,
                    Number(e.target.value) || DEFAULT_PRODUCTIVE_HOURS_PER_YEAR,
                  ),
                })
              }
            />
          </label>
        </div>
        <p className="muted opp-whynow-card-hint">
          Coût horaire dérivé : {hourly == null ? "—" : formatEur(hourly)}
        </p>
      </article>
      )}

      {sections.length === 0 ? (
        <p className="muted">
          Aucune ligne configurée. Ajoutez des familles et des lignes dans
          Settings → Opportunités → Coût d’inaction.
        </p>
      ) : (
        <div className="opp-whynow-inaction-families">
          {sections.map(({ group, description, levers }) => (
            <article
              key={group.kind}
              className="opp-whynow-card opp-whynow-inaction"
            >
              <h3>{group.label}</h3>
              {description ? (
                <p className="opp-whynow-card-hint muted">{description}</p>
              ) : null}
              <ul className="opp-module-checks opp-whynow-quant-list">
                {levers.map((lever) => {
                  const on = selected.has(lever.id);
                  const quant =
                    whyNow.inactionLeverValues?.[lever.id] ??
                    EMPTY_INACTION_LEVER_QUANT;
                  const kind =
                    lever.valueKind === "revenue"
                      ? "revenue"
                      : lever.valueKind === "avoided"
                        ? "avoided"
                        : "productivity";
                  const kindLabel =
                    kind === "revenue"
                      ? "gain"
                      : kind === "avoided"
                        ? "coût évité"
                        : "productivité";
                  const catalogFormula =
                    (lever.formula as InactionFormula | null | undefined) ??
                    null;
                  const formula = resolveFormula(lever.id, catalogFormula);
                  const useFormula = Boolean(formula?.enabled);
                  const eur = inactionLeverAnnualEur(
                    quant,
                    whyNow.etpAnnualCostEur,
                    hoursYear,
                    "prospect",
                    kind,
                    catalogFormula,
                  );
                  return (
                    <li key={lever.id} className={on ? "is-on" : undefined}>
                      <label className="opp-whynow-quant-main">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleLever(lever.id)}
                        />
                        <span>
                          {lever.label}
                          <em className="muted">
                            {" "}
                            · {kindLabel}
                            {useFormula ? " · formule" : ""}
                            {lever.description
                              ? ` — ${lever.description}`
                              : ""}
                          </em>
                        </span>
                      </label>
                      {on && (
                        <div className="opp-whynow-quant-value">
                          {useFormula && formula ? (
                            <>
                              <p className="muted inaction-formula-preview">
                                {formatInactionFormulaPreview(
                                  formula,
                                  quant.formulaFrequencies,
                                )}
                              </p>
                              {formula.inputs.map((inp) => {
                                const rawFreq =
                                  quant.formulaFrequencies?.[inp.id] ??
                                  inp.frequency ??
                                  defaultFrequencyForVar(inp.id);
                                const freq = isManTimeVar(inp.id)
                                  ? normalizeManTimeFrequency(rawFreq)
                                  : rawFreq;
                                const periodOptions = frequenciesForVar(inp.id);
                                const showFreq = hasFrequencySelect(inp.id);
                                const etpPlaceholder =
                                  isEtpCostVar(inp.id) && etpCost > 0
                                    ? String(
                                        Math.round(
                                          annualEtpToPeriodCost(
                                            etpCost,
                                            freq,
                                            hoursYear,
                                          ) * 100,
                                        ) / 100,
                                      )
                                    : "0";
                                return (
                                  <div
                                    key={inp.id}
                                    className={
                                      showFreq
                                        ? "opp-whynow-man-time"
                                        : undefined
                                    }
                                  >
                                    <label className="opp-whynow-single-field">
                                      <span className="opp-whynow-dual-label">
                                        {showFreq
                                          ? inp.label?.trim() ||
                                            (isManTimeVar(inp.id)
                                              ? "Temps homme"
                                              : "Coût unitaire chargé ETP")
                                          : formulaInputLabel(inp)}
                                      </span>
                                      <input
                                        type="number"
                                        min={0}
                                        step="any"
                                        value={inputVal(
                                          quant.formulaInputs?.[inp.id] ?? 0,
                                        )}
                                        placeholder={etpPlaceholder}
                                        onChange={(e) =>
                                          patchFormulaInput(
                                            lever.id,
                                            inp.id,
                                            e.target.value,
                                          )
                                        }
                                      />
                                    </label>
                                    {showFreq && (
                                      <label className="opp-whynow-single-field opp-whynow-freq-field">
                                        <span className="opp-whynow-dual-label">
                                          {isManTimeVar(inp.id)
                                            ? "Heures par"
                                            : "Coût par"}
                                        </span>
                                        <select
                                          value={
                                            periodOptions.some(
                                              (o) => o.id === freq,
                                            )
                                              ? freq
                                              : defaultFrequencyForVar(inp.id)
                                          }
                                          onChange={(e) =>
                                            patchFormulaFrequency(
                                              lever.id,
                                              inp.id,
                                              e.target
                                                .value as ManTimeFrequency,
                                            )
                                          }
                                        >
                                          {periodOptions.map((f) => (
                                            <option key={f.id} value={f.id}>
                                              {f.label}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    )}
                                  </div>
                                );
                              })}
                              <div className="opp-whynow-computed-eur">
                                <span>€ / an (calculé)</span>
                                <strong>{formatEur(eur)}</strong>
                              </div>
                              <p className="muted inaction-formula-hint">
                                Temps × coût : heures / an × € / h = € / an.
                              </p>
                            </>
                          ) : (
                            <>
                              {kind === "productivity" && (
                                <>
                                  <label className="opp-whynow-single-field">
                                    <span className="opp-whynow-dual-label">
                                      Nb ETP
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      value={inputVal(dualRead(quant.etpCount))}
                                      placeholder="0"
                                      onChange={(e) =>
                                        patchQuant(
                                          lever.id,
                                          "etpCount",
                                          e.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="opp-whynow-single-field">
                                    <span className="opp-whynow-dual-label">
                                      Temps (h / occurrence / ETP)
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      value={inputVal(dualRead(quant.hours))}
                                      placeholder="0"
                                      onChange={(e) =>
                                        patchQuant(
                                          lever.id,
                                          "hours",
                                          e.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="opp-whynow-single-field">
                                    <span className="opp-whynow-dual-label">
                                      Fréquence / an
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      value={inputVal(
                                        dualRead(quant.frequencyPerYear),
                                      )}
                                      placeholder="0"
                                      onChange={(e) =>
                                        patchQuant(
                                          lever.id,
                                          "frequencyPerYear",
                                          e.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <div className="opp-whynow-computed-eur">
                                    <span>€ / an (temps × coût ETP)</span>
                                    <strong>{formatEur(eur)}</strong>
                                  </div>
                                </>
                              )}
                              {kind === "revenue" && (
                                <label className="opp-whynow-single-field">
                                  <span className="opp-whynow-dual-label">
                                    CA / an (€)
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={inputVal(dualRead(quant.eur))}
                                    placeholder="0"
                                    onChange={(e) =>
                                      patchQuant(
                                        lever.id,
                                        "eur",
                                        e.target.value,
                                      )
                                    }
                                  />
                                </label>
                              )}
                              {kind === "avoided" && (
                                <>
                                  <label className="opp-whynow-single-field">
                                    <span className="opp-whynow-dual-label">
                                      Impact (€ / occurrence)
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      value={inputVal(dualRead(quant.eur))}
                                      placeholder="0"
                                      onChange={(e) =>
                                        patchQuant(
                                          lever.id,
                                          "eur",
                                          e.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="opp-whynow-single-field">
                                    <span className="opp-whynow-dual-label">
                                      Fréquence attendue / an
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      value={inputVal(
                                        dualRead(quant.frequencyPerYear),
                                      )}
                                      placeholder="0"
                                      onChange={(e) =>
                                        patchQuant(
                                          lever.id,
                                          "frequencyPerYear",
                                          e.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <div className="opp-whynow-computed-eur">
                                    <span>€ / an (espérance)</span>
                                    <strong>{formatEur(eur)}</strong>
                                  </div>
                                </>
                              )}
                            </>
                          )}

                          <button
                            type="button"
                            className="ghost inaction-formula-toggle"
                            onClick={() => setFormulaModalLeverId(lever.id)}
                          >
                            {useFormula
                              ? "Modifier le calcul"
                              : "Créer un calcul"}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      )}

      <InactionFormulaModal
        open={Boolean(formulaModalLeverId)}
        title={
          formulaModalLever
            ? `Calcul — ${formulaModalLever.label}`
            : "Calcul"
        }
        subtitle="Surcharge la formule catalogue pour ce deal uniquement."
        formula={
          formulaModalLever
            ? resolveFormula(
                formulaModalLever.id,
                (formulaModalLever.formula as InactionFormula | null) ?? null,
              ) ?? emptyInactionFormula()
            : emptyInactionFormula()
        }
        onClose={() => setFormulaModalLeverId(null)}
        onSave={(next) => {
          if (!formulaModalLeverId) return;
          patchFormulaOverride(formulaModalLeverId, next);
        }}
      />

      <div className="opp-whynow-mini-kpis" aria-label="Synthèse inaction">
        <article>
          <span>Lignes cochées</span>
          <strong>{formatWhyNowNum(selected.size)}</strong>
        </article>
        <article>
          <span>Coût d’inaction / an</span>
          <strong>{formatEur(value.gapEurTotal)}</strong>
        </article>
      </div>

      <label className="opp-whynow-inaction-note">
        Narratif
        <textarea
          rows={3}
          value={whyNow.inactionNote}
          placeholder="Si on n’agit pas avant [date CE], l’ampleur du problème est…"
          onChange={(e) => patchWhyNow({ inactionNote: e.target.value })}
        />
      </label>
    </section>
  );
}

function pickHourly(etpAnnual: number, hoursYear: number): number | null {
  if (!(etpAnnual > 0) || !(hoursYear > 0)) return null;
  return etpAnnual / hoursYear;
}
