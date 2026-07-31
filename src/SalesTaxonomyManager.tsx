import { useMemo, useState, type FormEvent } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import type {
  AccountSizeDef,
  CommercialStatusDef,
  OppKindDef,
  OppKindTargetMode,
  OppPhaseDef,
} from "./config/types";
import { isBuiltInOppPhaseId } from "./config/types";

const KIND_MODES: {
  id: OppKindTargetMode;
  label: string;
  hint: string;
}[] = [
  {
    id: "by_phase",
    label: "Suit la phase",
    hint: "Le montant suit Whitespace / étapes / Won selon la phase du deal",
  },
  {
    id: "renewal",
    label: "Renouvellement",
    hint: "Compte dans le bucket Renouvellement de la cible (tant que le deal est ouvert)",
  },
  {
    id: "none",
    label: "Hors cible",
    hint: "N’entre jamais dans la cible Dashboard (ex. deal interne)",
  },
];

function kindModeLabel(mode: OppKindTargetMode | string): string {
  return KIND_MODES.find((m) => m.id === mode)?.label ?? mode;
}

function phaseKindBadge(p: OppPhaseDef): string {
  if (p.kpiRole === "whitespace") return "Whitespace · 1ʳᵉ étape";
  if (p.kpiRole === "won") return "Won · CA installé";
  if (p.kpiRole === "lost") return "Lost · hors KPI";
  return "Étape du funnel";
}

export type SalesTaxonomySection =
  | "kpi"
  | "phases"
  | "kinds"
  | "statuses"
  | "sizes";

const ALL_SECTIONS: SalesTaxonomySection[] = [
  "kpi",
  "phases",
  "kinds",
  "statuses",
  "sizes",
];

export default function SalesTaxonomyManager({
  showInactive,
  sections = ALL_SECTIONS,
}: {
  showInactive: boolean;
  /** Sous-sections à afficher (défaut : toutes). */
  sections?: SalesTaxonomySection[];
}) {
  const show = (s: SalesTaxonomySection) => sections.includes(s);
  const {
    config,
    addOppPhase,
    updateOppPhase,
    removeOppPhase,
    moveOppPhase,
    addOppKind,
    updateOppKind,
    removeOppKind,
    addCommercialStatus,
    updateCommercialStatus,
    removeCommercialStatus,
    addAccountSize,
    updateAccountSize,
    removeAccountSize,
    updateKpiRules,
  } = useOrgConfig();

  const rules = config.kpiRules;

  const phases = useMemo(
    () =>
      [...(config.oppPhases ?? [])]
        .filter((p) => showInactive || p.active)
        .sort((a, b) => a.order - b.order),
    [config.oppPhases, showInactive],
  );
  const kinds = useMemo(
    () =>
      [...(config.oppKinds ?? [])]
        .filter((k) => showInactive || k.active)
        .sort((a, b) => a.order - b.order),
    [config.oppKinds, showInactive],
  );
  const statuses = useMemo(
    () =>
      [...(config.commercialStatuses ?? [])]
        .filter((s) => showInactive || s.active)
        .sort((a, b) => a.order - b.order),
    [config.commercialStatuses, showInactive],
  );
  const sizes = useMemo(
    () =>
      [...(config.accountSizes ?? [])]
        .filter((s) => showInactive || s.active)
        .sort((a, b) => a.order - b.order),
    [config.accountSizes, showInactive],
  );

  const [phaseLabel, setPhaseLabel] = useState("");
  const [editingPhase, setEditingPhase] = useState<string | null>(null);

  const [kindLabel, setKindLabel] = useState("");
  const [kindMode, setKindMode] = useState<OppKindTargetMode>("by_phase");
  const [editingKind, setEditingKind] = useState<string | null>(null);

  const [statusLabel, setStatusLabel] = useState("");
  const [editingStatus, setEditingStatus] = useState<string | null>(null);

  const [sizeLabel, setSizeLabel] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [editingSize, setEditingSize] = useState<string | null>(null);

  const submitPhase = (e: FormEvent) => {
    e.preventDefault();
    if (!phaseLabel.trim()) return;
    if (editingPhase) {
      updateOppPhase(editingPhase, { label: phaseLabel.trim() });
    } else {
      addOppPhase(phaseLabel);
    }
    setEditingPhase(null);
    setPhaseLabel("");
  };

  const startEditPhase = (p: OppPhaseDef) => {
    setEditingPhase(p.id);
    setPhaseLabel(p.label);
  };

  const customPhases = useMemo(
    () => phases.filter((p) => !isBuiltInOppPhaseId(p.id)),
    [phases],
  );

  const submitKind = (e: FormEvent) => {
    e.preventDefault();
    if (!kindLabel.trim()) return;
    if (editingKind) {
      updateOppKind(editingKind, {
        label: kindLabel.trim(),
        targetMode: kindMode,
      });
    } else {
      addOppKind(kindLabel, kindMode);
    }
    setEditingKind(null);
    setKindLabel("");
    setKindMode("by_phase");
  };

  const startEditKind = (k: OppKindDef) => {
    setEditingKind(k.id);
    setKindLabel(k.label);
    setKindMode(k.targetMode);
  };

  const submitStatus = (e: FormEvent) => {
    e.preventDefault();
    if (!statusLabel.trim()) return;
    if (editingStatus) {
      updateCommercialStatus(editingStatus, { label: statusLabel.trim() });
    } else {
      addCommercialStatus(statusLabel);
    }
    setEditingStatus(null);
    setStatusLabel("");
  };

  const startEditStatus = (s: CommercialStatusDef) => {
    setEditingStatus(s.id);
    setStatusLabel(s.label);
  };

  const submitSize = (e: FormEvent) => {
    e.preventDefault();
    if (!sizeLabel.trim()) return;
    if (editingSize) {
      updateAccountSize(editingSize, { label: sizeLabel.trim() });
    } else {
      addAccountSize(sizeLabel, sizeId || undefined);
    }
    setEditingSize(null);
    setSizeLabel("");
    setSizeId("");
  };

  const startEditSize = (s: AccountSizeDef) => {
    setEditingSize(s.id);
    setSizeLabel(s.label);
    setSizeId(s.id);
  };

  return (
    <div className="sales-taxonomy-manager">
      {show("kpi") && (
      <section className="settings-block">
        <h3>Règles KPI</h3>
        <p className="muted">
          Définit comment sont calculés le CA installé et la cible.
        </p>
        <div className="settings-checks">
          <label>
            <input
              type="checkbox"
              checked={rules.includeSalesInInstalled}
              onChange={(e) =>
                updateKpiRules({ includeSalesInInstalled: e.target.checked })
              }
            />
            CA installé : inclure les lignes de vente facturées
          </label>
          <label>
            <input
              type="checkbox"
              checked={rules.includeWonOppsInInstalled}
              onChange={(e) =>
                updateKpiRules({ includeWonOppsInInstalled: e.target.checked })
              }
            />
            CA installé : aussi sommer les opportunités Won (déconseillé —
            un passage en Won crée déjà une ligne de vente)
          </label>
          <label>
            <input
              type="checkbox"
              checked={rules.wonCalendarYearOnly}
              onChange={(e) =>
                updateKpiRules({ wonCalendarYearOnly: e.target.checked })
              }
            />
            Won : année civile uniquement (si sommation Won activée)
          </label>
          <label>
            <input
              type="checkbox"
              checked={rules.includeWhitespaceInTarget}
              onChange={(e) =>
                updateKpiRules({ includeWhitespaceInTarget: e.target.checked })
              }
            />
            Cible : Whitespace
          </label>
          <label>
            <input
              type="checkbox"
              checked={rules.includePipelineInTarget}
              onChange={(e) =>
                updateKpiRules({ includePipelineInTarget: e.target.checked })
              }
            />
            Cible : étapes en cours (hors Whitespace / Won / Lost)
          </label>
          <label>
            <input
              type="checkbox"
              checked={rules.includeRenewalInTarget}
              onChange={(e) =>
                updateKpiRules({ includeRenewalInTarget: e.target.checked })
              }
            />
            Cible : Renouvellements en cours
          </label>
        </div>
      </section>
      )}

      {show("phases") && (
      <section className="settings-block">
        <h3>Phases d’opportunité</h3>
        <p className="muted">
          Funnel pipeline (Discovery, Proposal…). Ajouter une phase crée aussi
          un domaine Process vide du même nom. Whitespace, Won et Lost sont les
          ancres KPI — les étapes du milieu sont réordonnables (▲ ▼).
        </p>
        <form className="settings-add" onSubmit={submitPhase}>
          <input
            value={phaseLabel}
            onChange={(e) => setPhaseLabel(e.target.value)}
            placeholder="Libellé d’étape (ex. RDV fait)"
            required
          />
          <button type="submit">{editingPhase ? "Enregistrer" : "Ajouter"}</button>
          {editingPhase && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setEditingPhase(null);
                setPhaseLabel("");
              }}
            >
              Annuler
            </button>
          )}
        </form>
        <ul className="settings-list">
          {phases.map((p) => {
            const builtIn = isBuiltInOppPhaseId(p.id);
            const customIndex = customPhases.findIndex((c) => c.id === p.id);
            return (
              <li key={p.id} className={!p.active ? "inactive" : ""}>
                {!builtIn ? (
                  <span className="order-arrows">
                    <button
                      type="button"
                      className="ghost order-arrow"
                      onClick={() => moveOppPhase(p.id, -1)}
                      disabled={customIndex <= 0}
                      title="Monter"
                      aria-label="Monter"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="ghost order-arrow"
                      onClick={() => moveOppPhase(p.id, 1)}
                      disabled={
                        customIndex < 0 ||
                        customIndex >= customPhases.length - 1
                      }
                      title="Descendre"
                      aria-label="Descendre"
                    >
                      ▼
                    </button>
                  </span>
                ) : (
                  <span className="order-arrows order-arrows-spacer" aria-hidden />
                )}
                <button
                  type="button"
                  className="linkish dir-name"
                  onClick={() => startEditPhase(p)}
                >
                  {p.label}
                </button>
                <span className="muted">{phaseKindBadge(p)}</span>
                {p.id === "Whitespace" ? (
                  <span className="muted">Toujours active</span>
                ) : p.active ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => removeOppPhase(p.id)}
                  >
                    Désactiver
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => updateOppPhase(p.id, { active: true })}
                  >
                    Réactiver
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      )}

      {show("kinds") && (
      <section className="settings-block">
        <h3>Natures de deal</h3>
        <p className="muted">
          Préparamétré : Upsell, Cross-sell, New logo, Renouvellement. Tu peux
          en ajouter d’autres. Le 2ᵉ champ dit comment le montant compte dans
          la cible Dashboard (en général « Suit la phase », sauf Renouvellement).
        </p>
        <form className="settings-add settings-add-kinds" onSubmit={submitKind}>
          <label className="settings-add-field">
            <span>Nature</span>
            <input
              value={kindLabel}
              onChange={(e) => setKindLabel(e.target.value)}
              placeholder="ex. Expansion…"
              required
            />
          </label>
          <label className="settings-add-field">
            <span>Compte dans la cible ?</span>
            <select
              value={kindMode}
              onChange={(e) => setKindMode(e.target.value as OppKindTargetMode)}
            >
              {KIND_MODES.map((m) => (
                <option key={m.id} value={m.id} title={m.hint}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">{editingKind ? "Enregistrer" : "Ajouter"}</button>
          {editingKind && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setEditingKind(null);
                setKindLabel("");
                setKindMode("by_phase");
              }}
            >
              Annuler
            </button>
          )}
        </form>
        <p className="muted settings-kinds-hint">
          {KIND_MODES.find((m) => m.id === kindMode)?.hint}
        </p>
        <ul className="settings-list">
          {kinds.map((k) => (
            <li key={k.id} className={!k.active ? "inactive" : ""}>
              <button
                type="button"
                className="linkish dir-name"
                onClick={() => startEditKind(k)}
              >
                {k.label}
              </button>
              <span className="muted">{kindModeLabel(k.targetMode)}</span>
              {k.active ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => removeOppKind(k.id)}
                >
                  Désactiver
                </button>
              ) : (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => updateOppKind(k.id, { active: true })}
                >
                  Réactiver
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      )}

      {show("statuses") && (
      <section className="settings-block">
        <h3>Statuts commerciaux</h3>
        <form className="settings-add" onSubmit={submitStatus}>
          <input
            value={statusLabel}
            onChange={(e) => setStatusLabel(e.target.value)}
            placeholder="Libellé (ex. Client)"
            required
          />
          <button type="submit">
            {editingStatus ? "Enregistrer" : "Ajouter"}
          </button>
          {editingStatus && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setEditingStatus(null);
                setStatusLabel("");
              }}
            >
              Annuler
            </button>
          )}
        </form>
        <ul className="settings-list">
          {statuses.map((s) => (
            <li key={s.id} className={!s.active ? "inactive" : ""}>
              <button
                type="button"
                className="linkish dir-name"
                onClick={() => startEditStatus(s)}
              >
                {s.label}
              </button>
              <span className="muted">{s.id}</span>
              {s.active ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => removeCommercialStatus(s.id)}
                >
                  Désactiver
                </button>
              ) : (
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    updateCommercialStatus(s.id, { active: true })
                  }
                >
                  Réactiver
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      )}

      {show("sizes") && (
      <section className="settings-block">
        <h3>Tranches d’effectif</h3>
        <form className="settings-add" onSubmit={submitSize}>
          <input
            value={sizeLabel}
            onChange={(e) => setSizeLabel(e.target.value)}
            placeholder="Libellé affiché"
            required
          />
          {!editingSize && (
            <input
              value={sizeId}
              onChange={(e) => setSizeId(e.target.value)}
              placeholder="Id (optionnel, ex. 10000+)"
            />
          )}
          <button type="submit">{editingSize ? "Enregistrer" : "Ajouter"}</button>
          {editingSize && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setEditingSize(null);
                setSizeLabel("");
                setSizeId("");
              }}
            >
              Annuler
            </button>
          )}
        </form>
        <ul className="settings-list">
          {sizes.map((s) => (
            <li key={s.id} className={!s.active ? "inactive" : ""}>
              <button
                type="button"
                className="linkish dir-name"
                onClick={() => startEditSize(s)}
              >
                {s.label}
              </button>
              <span className="muted">{s.id}</span>
              {s.active ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => removeAccountSize(s.id)}
                >
                  Désactiver
                </button>
              ) : (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => updateAccountSize(s.id, { active: true })}
                >
                  Réactiver
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      )}
    </div>
  );
}
