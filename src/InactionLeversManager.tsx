import { useMemo, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import type { InactionLeverDef, InactionValueKind } from "./config/types";
import InactionFormulaModal from "./inaction/InactionFormulaModal";
import { INACTION_KIND_GROUPS } from "./inaction/kinds";
import {
  emptyInactionFormula,
  formatInactionFormulaPreview,
  type InactionFormula,
} from "./inaction/formula";

/**
 * Settings : lignes CoI regroupées en 3 accordéons
 * (productivité / CA / coût évité) — activables sur le deal.
 */
export default function InactionLeversManager({
  showInactive,
}: {
  showInactive: boolean;
}) {
  const {
    config,
    addInactionLever,
    updateInactionLever,
    removeInactionLever,
    updateInactionLeverFamily,
  } = useOrgConfig();

  const [newLeverByKind, setNewLeverByKind] = useState<
    Partial<Record<InactionValueKind, string>>
  >({});
  const [openKinds, setOpenKinds] = useState<Record<InactionValueKind, boolean>>(
    {
      productivity: true,
      revenue: false,
      avoided: false,
    },
  );
  const [formulaModalLeverId, setFormulaModalLeverId] = useState<string | null>(
    null,
  );

  const levers = useMemo(
    () =>
      [...(config.inactionLevers ?? [])]
        .filter((l) => showInactive || l.active)
        .sort((a, b) => a.order - b.order),
    [config.inactionLevers, showInactive],
  );

  const formulaModalLever = levers.find((l) => l.id === formulaModalLeverId);

  function toggleKind(kind: InactionValueKind) {
    setOpenKinds((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }

  return (
    <div className="project-levers-manager">
      <header className="catalogue-head">
        <div>
          <h3>Coût d’inaction</h3>
          <p className="muted">
            Cochez <strong>Actif</strong> pour afficher le regroupement sur le
            deal :
            <strong> gain productivité</strong>,
            <strong> gain CA</strong>,
            <strong> coût évité</strong>.
            Chaque ligne peut utiliser une <strong>formule</strong> (× + − ÷ %).
          </p>
        </div>
      </header>

      <div className="inaction-kind-accordions">
        {INACTION_KIND_GROUPS.map((group) => {
          const groupLevers = levers.filter((l) => l.valueKind === group.kind);
          const family = (config.inactionLeverFamilies ?? []).find(
            (f) => f.id === group.familyId,
          );
          const groupActive = family?.active === true;
          const open = openKinds[group.kind];
          return (
            <section
              key={group.kind}
              className={`inaction-kind-accordion${open ? " is-open" : ""}${!groupActive ? " is-inactive" : ""}`}
            >
              <div className="inaction-kind-accordion-head">
                <label
                  className="inaction-active-check inaction-kind-active"
                  title="Afficher ce regroupement sur les deals"
                >
                  <input
                    type="checkbox"
                    checked={groupActive}
                    onChange={(e) => {
                      updateInactionLeverFamily(group.familyId, {
                        active: e.target.checked,
                        label: group.label,
                        description: family?.description ?? group.blurb,
                      });
                    }}
                  />
                  <span>Actif</span>
                </label>
                <button
                  type="button"
                  className="inaction-kind-accordion-trigger"
                  aria-expanded={open}
                  onClick={() => toggleKind(group.kind)}
                >
                  <span className="inaction-kind-accordion-title">
                    <strong>{group.label}</strong>
                    <em className="muted">
                      {groupLevers.length} ligne
                      {groupLevers.length === 1 ? "" : "s"}
                      {!groupActive ? " · masqué sur le deal" : ""}
                    </em>
                  </span>
                  <span className="inaction-kind-accordion-arrow" aria-hidden>
                    {open ? "▲" : "▼"}
                  </span>
                </button>
              </div>

              {open && (
                <div className="inaction-kind-accordion-body">
                  <p className="muted inaction-kind-blurb">{group.blurb}</p>
                  <label className="intel-textarea-label">
                    Description (affichée sur le deal)
                    <textarea
                      rows={2}
                      value={family?.description ?? ""}
                      onChange={(e) =>
                        updateInactionLeverFamily(group.familyId, {
                          description: e.target.value,
                          label: group.label,
                          active: groupActive,
                        })
                      }
                      placeholder={group.blurb}
                    />
                  </label>

                  <h4 className="nested-hint">
                    Lignes (cases à cocher sur le deal)
                  </h4>
                  <ul className="settings-list intel-feature-list">
                    {groupLevers.length === 0 ? (
                      <li className="muted">
                        Aucune ligne dans ce regroupement.
                      </li>
                    ) : (
                      groupLevers.map((l) => (
                        <KindLeverRow
                          key={l.id}
                          lever={l}
                          onChange={(patch) =>
                            updateInactionLever(l.id, patch)
                          }
                          onRemove={() => removeInactionLever(l.id)}
                          onRestore={() =>
                            updateInactionLever(l.id, { active: true })
                          }
                          onOpenFormula={() => setFormulaModalLeverId(l.id)}
                        />
                      ))
                    )}
                  </ul>

                  <form
                    className="settings-add nested"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const label = newLeverByKind[group.kind] ?? "";
                      addInactionLever(
                        group.familyId,
                        label,
                        undefined,
                        group.kind,
                      );
                      setNewLeverByKind((prev) => ({
                        ...prev,
                        [group.kind]: "",
                      }));
                    }}
                  >
                    <input
                      value={newLeverByKind[group.kind] ?? ""}
                      onChange={(e) =>
                        setNewLeverByKind((prev) => ({
                          ...prev,
                          [group.kind]: e.target.value,
                        }))
                      }
                      placeholder="Nouvelle ligne…"
                      required
                    />
                    <button type="submit">Ajouter</button>
                  </form>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <InactionFormulaModal
        open={Boolean(formulaModalLever)}
        title={
          formulaModalLever
            ? `Calcul — ${formulaModalLever.label}`
            : "Calcul"
        }
        subtitle="Définissez la formule catalogue pour cette ligne (réutilisable sur les deals)."
        formula={
          (formulaModalLever?.formula as InactionFormula | null) ??
          emptyInactionFormula()
        }
        onClose={() => setFormulaModalLeverId(null)}
        onSave={(formula) => {
          if (!formulaModalLeverId) return;
          updateInactionLever(formulaModalLeverId, { formula });
        }}
      />
    </div>
  );
}

function KindLeverRow({
  lever,
  onChange,
  onRemove,
  onRestore,
  onOpenFormula,
}: {
  lever: InactionLeverDef;
  onChange: (patch: Partial<InactionLeverDef>) => void;
  onRemove: () => void;
  onRestore: () => void;
  onOpenFormula: () => void;
}) {
  const formula =
    (lever.formula as InactionFormula | null | undefined) ?? null;
  const formulaOn = Boolean(formula?.enabled);

  return (
    <li className={!lever.active ? "inactive" : ""}>
      <div className="inaction-lever-row inaction-lever-row-kind">
        <label
          className="inaction-active-check"
          title="Ligne visible sur le deal"
        >
          <input
            type="checkbox"
            checked={lever.active}
            onChange={(e) => onChange({ active: e.target.checked })}
          />
        </label>
        <input
          value={lever.label}
          onChange={(e) => onChange({ label: e.target.value })}
          disabled={!lever.active}
          placeholder="Libellé ligne"
        />
        {lever.active ? (
          <button type="button" className="ghost" onClick={onRemove}>
            Retirer
          </button>
        ) : (
          <button type="button" className="ghost" onClick={onRestore}>
            Réactiver
          </button>
        )}
      </div>
      {lever.active && (
        <>
          <textarea
            rows={2}
            value={lever.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Aide à la quantification (opt.)"
          />
          <div className="inaction-formula-summary">
            <p className="muted inaction-formula-preview">
              {formulaOn
                ? formatInactionFormulaPreview(formula!)
                : "Pas de calcul — saisie € seule"}
            </p>
            <button
              type="button"
              className="ghost inaction-formula-toggle"
              onClick={onOpenFormula}
            >
              {formulaOn ? "Modifier le calcul" : "Créer un calcul"}
            </button>
          </div>
        </>
      )}
    </li>
  );
}
