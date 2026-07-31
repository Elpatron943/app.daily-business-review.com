import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  formatEur,
  isCompanyLevelSoldLine,
  soldLinePersonaIds,
  soldLineMatchesPersona,
  type SoldSolution,
} from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import { useSales } from "./sales/SalesContext";

/**
 * @param personaId — scope fixe (carte) ; ignoré si `allowPersonaPick`
 * @param allowPersonaPick — fiche entreprise : multi-personae + modules
 * @param readOnly — carto : affichage seul, aucune saisie
 */
export default function SoldSolutionEditor({
  accountId,
  personaId = null,
  allowPersonaPick = false,
  readOnly = false,
}: {
  accountId: string;
  personaId?: string | null;
  allowPersonaPick?: boolean;
  readOnly?: boolean;
}) {
  const { activeSolutions, activePersonae, solutionLabel, personaLabel, catalogFeatures } =
    useOrgConfig();
  const { soldSolutions, upsertSoldSolution, removeSoldSolution } = useSales();
  const { activeAccounts } = useDomain();

  const account = activeAccounts.find((a) => a.id === accountId);
  const scopeLabel = account?.name ?? accountId;

  const lines = soldSolutions.filter((s) => {
    if (allowPersonaPick) return s.accountId === accountId;
    if (personaId) return soldLineMatchesPersona(s, personaId);
    return s.accountId === accountId && isCompanyLevelSoldLine(s);
  });

  const [solutionId, setSolutionId] = useState(
    activeSolutions[0]?.id ?? "",
  );
  const [formPersonaIds, setFormPersonaIds] = useState<string[]>([]);
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [billed, setBilled] = useState("0");
  const [editingId, setEditingId] = useState<string | null>(null);

  const solutionModules = useMemo(() => {
    const sol = activeSolutions.find((s) => s.id === solutionId);
    return (sol?.modules ?? []).filter((m) => m.active !== false);
  }, [activeSolutions, solutionId]);

  useEffect(() => {
    if (!allowPersonaPick) {
      setFormPersonaIds(personaId ? [personaId] : []);
    }
  }, [allowPersonaPick, personaId]);

  // Drop modules that don't belong to the newly selected solution
  useEffect(() => {
    const allowed = new Set(solutionModules.map((m) => m.id));
    setModuleIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [solutionId, solutionModules]);

  const startEdit = (line: SoldSolution) => {
    if (readOnly) return;
    setEditingId(line.id);
    setSolutionId(line.solutionId);
    setFormPersonaIds(soldLinePersonaIds(line));
    setModuleIds(line.moduleIds ?? []);
    setBilled(String(line.billedAmount));
  };

  const resetForm = () => {
    setEditingId(null);
    setSolutionId(activeSolutions[0]?.id ?? "");
    setFormPersonaIds(
      allowPersonaPick ? [] : personaId ? [personaId] : [],
    );
    setModuleIds([]);
    setBilled("0");
  };

  const togglePersona = (id: string) => {
    if (!allowPersonaPick) return;
    setFormPersonaIds((prev) =>
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
    const personaIds = allowPersonaPick
      ? formPersonaIds
      : personaId
        ? [personaId]
        : [];
    upsertSoldSolution({
      id: editingId ?? undefined,
      solutionId,
      accountId,
      personaId: personaIds[0] ?? null,
      personaIds: catalogFeatures.personae ? personaIds : [],
      moduleIds: catalogFeatures.modules ? moduleIds : [],
      billedAmount: Number(billed) || 0,
    });
    resetForm();
  };

  const title = allowPersonaPick
    ? `Solutions vendues · ${scopeLabel}`
    : personaId
      ? `Solutions vendues · Persona ${personaLabel(personaId)}`
      : `Solutions vendues · ${scopeLabel}`;

  function formatPersonae(line: SoldSolution) {
    const ids = soldLinePersonaIds(line);
    if (ids.length === 0) return "Entreprise";
    return ids.map((id) => personaLabel(id)).join(", ");
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
              {(catalogFeatures.personae &&
                (allowPersonaPick || personaId)) && (
                <span className="sold-scope-tag">{formatPersonae(s)}</span>
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

          {catalogFeatures.personae && allowPersonaPick && (
            <fieldset className="sold-multi">
              <legend>Personae</legend>
              <p className="sold-multi-hint muted">
                Aucune case = rattachement entreprise. Plusieurs possibles.
              </p>
              <div className="sold-check-grid">
                {activePersonae.map((p) => (
                  <label key={p.id} className="sold-check">
                    <input
                      type="checkbox"
                      checked={formPersonaIds.includes(p.id)}
                      onChange={() => togglePersona(p.id)}
                    />
                    <span>{p.name}</span>
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
