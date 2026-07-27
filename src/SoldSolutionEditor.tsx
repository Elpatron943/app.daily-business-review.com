import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  formatEur,
  isCompanyLevelSoldLine,
  soldLineDirectionIds,
  soldLineMatchesDirection,
  type SoldSolution,
} from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import { useSales } from "./sales/SalesContext";

/**
 * @param directionId — scope fixe (carte) ; ignoré si `allowDirectionPick`
 * @param allowDirectionPick — fiche entreprise : multi-directions + modules
 * @param readOnly — carto : affichage seul, aucune saisie
 */
export default function SoldSolutionEditor({
  accountId,
  directionId = null,
  allowDirectionPick = false,
  readOnly = false,
}: {
  accountId: string;
  directionId?: string | null;
  allowDirectionPick?: boolean;
  readOnly?: boolean;
}) {
  const { activeSolutions, activeDirections, solutionLabel, directionLabel, catalogFeatures } =
    useOrgConfig();
  const { soldSolutions, upsertSoldSolution, removeSoldSolution } = useSales();
  const { activeAccounts } = useDomain();

  const account = activeAccounts.find((a) => a.id === accountId);
  const scopeLabel = account?.name ?? accountId;

  const lines = soldSolutions.filter((s) => {
    if (allowDirectionPick) return s.accountId === accountId;
    if (directionId) return soldLineMatchesDirection(s, directionId);
    return s.accountId === accountId && isCompanyLevelSoldLine(s);
  });

  const [solutionId, setSolutionId] = useState(
    activeSolutions[0]?.id ?? "",
  );
  const [formDirectionIds, setFormDirectionIds] = useState<string[]>([]);
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [billed, setBilled] = useState("0");
  const [editingId, setEditingId] = useState<string | null>(null);

  const solutionModules = useMemo(() => {
    const sol = activeSolutions.find((s) => s.id === solutionId);
    return (sol?.modules ?? []).filter((m) => m.active !== false);
  }, [activeSolutions, solutionId]);

  useEffect(() => {
    if (!allowDirectionPick) {
      setFormDirectionIds(directionId ? [directionId] : []);
    }
  }, [allowDirectionPick, directionId]);

  // Drop modules that don't belong to the newly selected solution
  useEffect(() => {
    const allowed = new Set(solutionModules.map((m) => m.id));
    setModuleIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [solutionId, solutionModules]);

  const startEdit = (line: SoldSolution) => {
    if (readOnly) return;
    setEditingId(line.id);
    setSolutionId(line.solutionId);
    setFormDirectionIds(soldLineDirectionIds(line));
    setModuleIds(line.moduleIds ?? []);
    setBilled(String(line.billedAmount));
  };

  const resetForm = () => {
    setEditingId(null);
    setSolutionId(activeSolutions[0]?.id ?? "");
    setFormDirectionIds(
      allowDirectionPick ? [] : directionId ? [directionId] : [],
    );
    setModuleIds([]);
    setBilled("0");
  };

  const toggleDirection = (id: string) => {
    if (!allowDirectionPick) return;
    setFormDirectionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleModule = (id: string) => {
    setModuleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (readOnly || !solutionId) return;
    const directionIds = allowDirectionPick
      ? formDirectionIds
      : directionId
        ? [directionId]
        : [];
    upsertSoldSolution({
      id: editingId ?? undefined,
      solutionId,
      accountId,
      directionId: directionIds[0] ?? null,
      directionIds: catalogFeatures.directions ? directionIds : [],
      moduleIds: catalogFeatures.modules ? moduleIds : [],
      billedAmount: Number(billed) || 0,
    });
    resetForm();
  };

  const title = allowDirectionPick
    ? `Solutions vendues · ${scopeLabel}`
    : directionId
      ? `Solutions vendues · Direction ${directionLabel(directionId)}`
      : `Solutions vendues · ${scopeLabel}`;

  function formatDirs(line: SoldSolution) {
    const ids = soldLineDirectionIds(line);
    if (ids.length === 0) return "Entreprise";
    return ids.map((id) => directionLabel(id)).join(", ");
  }

  function formatModules(line: SoldSolution) {
    const sol = activeSolutions.find((s) => s.id === line.solutionId);
    const ids = line.moduleIds ?? [];
    if (ids.length === 0) return null;
    return ids
      .map((id) => sol?.modules?.find((m) => m.id === id)?.label ?? id)
      .join(", ");
  }

  return (
    <section className="sold-editor">
      <h2>{title}</h2>
      <p className="muted sold-editor-hint">
        CA facturé uniquement — cible et potentiel viennent des opportunités.
      </p>
      <ul className="detail-sales">
        {lines.length === 0 && <li>Aucune ligne.</li>}
        {lines.map((s) => {
          const mods = formatModules(s);
          return (
            <li key={s.id}>
              {readOnly ? (
                <span>{solutionLabel(s.solutionId)}</span>
              ) : (
                <button
                  type="button"
                  className="linkish"
                  onClick={() => startEdit(s)}
                >
                  {solutionLabel(s.solutionId)}
                </button>
              )}{" "}
              — CA {formatEur(s.billedAmount)}
              {(catalogFeatures.directions &&
                (allowDirectionPick || directionId)) && (
                <span className="sold-scope-tag">{formatDirs(s)}</span>
              )}
              {catalogFeatures.modules && mods ? (
                <span className="sold-scope-tag sold-modules-tag">{mods}</span>
              ) : null}
              {!readOnly && (
                <button
                  type="button"
                  className="ghost tiny"
                  onClick={() => removeSoldSolution(s.id)}
                >
                  Suppr.
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {!readOnly && (
        <form className="sold-form" onSubmit={submit}>
          <label>
            Solution
            <select
              value={solutionId}
              onChange={(e) => setSolutionId(e.target.value)}
              required
            >
              {activeSolutions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          {catalogFeatures.modules && solutionModules.length > 0 && (
            <fieldset className="sold-multi">
              <legend>Modules</legend>
              <div className="sold-check-grid">
                {solutionModules.map((m) => (
                  <label key={m.id} className="sold-check">
                    <input
                      type="checkbox"
                      checked={moduleIds.includes(m.id)}
                      onChange={() => toggleModule(m.id)}
                    />
                    <span>{m.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {catalogFeatures.directions && allowDirectionPick && (
            <fieldset className="sold-multi">
              <legend>Directions</legend>
              <p className="sold-multi-hint muted">
                Aucune case = rattachement entreprise. Plusieurs possibles.
              </p>
              <div className="sold-check-grid">
                {activeDirections.map((d) => (
                  <label key={d.id} className="sold-check">
                    <input
                      type="checkbox"
                      checked={formDirectionIds.includes(d.id)}
                      onChange={() => toggleDirection(d.id)}
                    />
                    <span>{d.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <label>
            CA (€)
            <input
              type="number"
              min={0}
              value={billed}
              onChange={(e) => setBilled(e.target.value)}
            />
          </label>
          <div className="sold-form-actions">
            <button type="submit">
              {editingId ? "Enregistrer" : "Ajouter"}
            </button>
            {editingId && (
              <button type="button" className="ghost" onClick={resetForm}>
                Annuler
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
