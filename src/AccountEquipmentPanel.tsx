import { useMemo, useState, type FormEvent } from "react";
import {
  formatEur,
  soldLinePersonaIds,
  type Account,
  type SoldSolution,
} from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { useSales } from "./sales/SalesContext";
import {
  useOpportunities,
  defaultBusinessOutcomeValues,
  defaultOpportunityVariables,
  type OpportunityKind,
} from "./opportunities/OpportunityContext";
import { openOpportunityDetail } from "./opportunities/oppNavigation";
import { ensureRequiredMappingChecks } from "./opportunities/mappingScore";

type GapKind = "solution" | "module" | "persona";

type EquipmentGap = {
  key: string;
  kind: GapKind;
  label: string;
  detail: string;
  solutionId: string;
  moduleIds: string[];
  personaId?: string;
  oppKind: OpportunityKind;
};

type CreateDraft = {
  gap: EquipmentGap;
  name: string;
  amount: string;
  closeDate: string;
};

type Props = {
  account: Account;
  onOpenOpportunities?: () => void;
};

function defaultCloseDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

function showsDealVariables(kind: OpportunityKind) {
  return kind === "up";
}

export default function AccountEquipmentPanel({
  account,
  onOpenOpportunities,
}: Props) {
  const {
    activeSolutions,
    activePersonae,
    solutionLabel,
    personaLabel,
    config,
    catalogFeatures,
    activeOppPhases,
    kindLabel,
    phaseLabel,
    kpiClassifier,
  } = useOrgConfig();
  const { soldSolutions } = useSales();
  const { activeOpportunities, addOpportunity } = useOpportunities();
  const [draft, setDraft] = useState<CreateDraft | null>(null);

  const lines = useMemo(
    () =>
      soldSolutions
        .filter((s) => s.accountId === account.id)
        .slice()
        .sort(
          (a, b) =>
            solutionLabel(a.solutionId).localeCompare(
              solutionLabel(b.solutionId),
              "fr",
            ) || b.billedAmount - a.billedAmount,
        ),
    [soldSolutions, account.id, solutionLabel],
  );

  const accountOpps = useMemo(
    () =>
      activeOpportunities.filter(
        (o) =>
          o.primaryAccountId === account.id &&
          !kpiClassifier.isLostPhase(o.phase) &&
          !kpiClassifier.isWonPhase(o.phase),
      ),
    [activeOpportunities, account.id, kpiClassifier],
  );

  const gaps = useMemo(() => {
    const soldSolutionIds = new Set(lines.map((l) => l.solutionId));
    const equippedPersonae = new Set(lines.flatMap(soldLinePersonaIds));
    const out: EquipmentGap[] = [];

    if (catalogFeatures.solutions) {
      for (const sol of activeSolutions) {
        if (!soldSolutionIds.has(sol.id)) {
          out.push({
            key: `sol:${sol.id}`,
            kind: "solution",
            label: sol.name,
            detail: sol.code ? `Solution · ${sol.code}` : "Solution absente",
            solutionId: sol.id,
            moduleIds: [],
            oppKind: lines.length > 0 ? "cross" : "prospect",
          });
        }
      }
    }

    if (catalogFeatures.modules && catalogFeatures.solutions) {
      for (const sol of activeSolutions) {
        if (!soldSolutionIds.has(sol.id)) continue;
        const equippedMods = new Set(
          lines
            .filter((l) => l.solutionId === sol.id)
            .flatMap((l) => l.moduleIds ?? []),
        );
        for (const mod of sol.modules.filter((m) => m.active !== false)) {
          if (equippedMods.has(mod.id)) continue;
          out.push({
            key: `mod:${sol.id}:${mod.id}`,
            kind: "module",
            label: mod.label,
            detail: `Module · ${sol.name}`,
            solutionId: sol.id,
            moduleIds: [mod.id],
            oppKind: "up",
          });
        }
      }
    }

    if (catalogFeatures.personae) {
      for (const persona of activePersonae) {
        if (equippedPersonae.has(persona.id)) continue;
        out.push({
          key: `persona:${persona.id}`,
          kind: "persona",
          label: persona.name,
          detail: "Persona non équipée",
          solutionId: lines[0]?.solutionId ?? activeSolutions[0]?.id ?? "",
          moduleIds: [],
          personaId: persona.id,
          oppKind: lines.length > 0 ? "up" : "prospect",
        });
      }
    }

    return out;
  }, [
    lines,
    activeSolutions,
    activePersonae,
    catalogFeatures.solutions,
    catalogFeatures.modules,
    catalogFeatures.personae,
  ]);

  function relatedOpps(gap: EquipmentGap) {
    return accountOpps.filter((o) => {
      if (gap.kind === "solution") {
        return o.solutionId === gap.solutionId && (o.moduleIds?.length ?? 0) === 0;
      }
      if (gap.kind === "module") {
        return (
          o.solutionId === gap.solutionId &&
          gap.moduleIds.every((id) => o.moduleIds?.includes(id))
        );
      }
      return o.name.toLowerCase().includes(gap.label.toLowerCase());
    });
  }

  function openCreate(gap: EquipmentGap) {
    const bits = [account.name, gap.label];
    if (gap.kind === "module") bits.unshift("Upsell");
    if (gap.kind === "solution") bits.unshift("Whitespace");
    if (gap.kind === "persona") bits.unshift(`Persona ${gap.label}`);
    setDraft({
      gap,
      name: bits.filter(Boolean).join(" · "),
      amount: "0",
      closeDate: defaultCloseDate(),
    });
  }

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return;
    const kind = draft.gap.oppKind;
    const fd = new FormData(e.currentTarget);
    const solutionId =
      draft.gap.kind === "persona"
        ? String(fd.get("solutionId") ?? draft.gap.solutionId)
        : draft.gap.solutionId;

    const id = addOpportunity({
      name,
      amount: Number(draft.amount) || 0,
      currency: "EUR",
      closeDate: draft.closeDate,
      primaryAccountId: account.id,
      phase: activeOppPhases[0]?.id ?? "",
      kind,
      solutionId,
      moduleIds: draft.gap.moduleIds,
      personaIds:
        draft.gap.kind === "persona" && draft.gap.personaId
          ? [draft.gap.personaId]
          : [],
      variables: showsDealVariables(kind)
        ? defaultOpportunityVariables(config.oppVariables)
        : {},
      businessOutcomes: defaultBusinessOutcomeValues(config.boFields),
      mappingChecks: ensureRequiredMappingChecks(
        {},
        config.oppMappingSubtypes ?? [],
      ),
    });
    if (!id) return;
    setDraft(null);
    openOpportunityDetail(id, { type: "account", accountId: account.id });
    onOpenOpportunities?.();
  }

  function lineModules(line: SoldSolution) {
    const sol = activeSolutions.find((s) => s.id === line.solutionId);
    const ids = line.moduleIds ?? [];
    if (ids.length === 0) return "—";
    return ids
      .map(
        (id) =>
          sol?.modules.find((m) => m.id === id)?.label ?? id,
      )
      .join(", ");
  }

  function linePersonae(line: SoldSolution) {
    const ids = soldLinePersonaIds(line);
    if (ids.length === 0) return "Niveau entreprise";
    return ids.map((id) => personaLabel(id)).join(", ");
  }

  const gapKindLabel: Record<GapKind, string> = {
    solution: "Solution",
    module: "Module",
    persona: "Persona",
  };

  return (
    <div className="account-equipment-panel">
      <section className="entry-subsection">
        <h2>Équipé</h2>
        {lines.length === 0 ? (
          <p className="muted">Aucune solution équipée sur ce compte.</p>
        ) : (
          <div className="ecosystem-table-wrap">
            <table className="ecosystem-table">
              <thead>
                <tr>
                  <th>Solution</th>
                  {catalogFeatures.modules && <th>Modules</th>}
                  {catalogFeatures.personae && <th>Personae</th>}
                  <th>CA facturé</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <strong>{solutionLabel(line.solutionId)}</strong>
                    </td>
                    {catalogFeatures.modules && <td>{lineModules(line)}</td>}
                    {catalogFeatures.personae && (
                      <td>{linePersonae(line)}</td>
                    )}
                    <td className="num">{formatEur(line.billedAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="entry-subsection">
        <h2>Non équipé</h2>
        <p className="muted">
          {[
            catalogFeatures.solutions && "solutions",
            catalogFeatures.modules && "modules",
            catalogFeatures.personae && "personae",
          ]
            .filter(Boolean)
            .join(", ") || "éléments"}{" "}
          absents — crée une opportunité depuis une ligne.
        </p>
        {gaps.length === 0 ? (
          <p className="muted">Couverture complète sur le catalogue actif.</p>
        ) : (
          <div className="ecosystem-table-wrap">
            <table className="ecosystem-table account-equipment-gaps">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Élément</th>
                  <th>Détail</th>
                  <th>Nature</th>
                  <th>Opp. ouvertes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {gaps.map((gap) => {
                  const linked = relatedOpps(gap);
                  return (
                    <tr key={gap.key}>
                      <td>
                        <span className={`equip-gap-type type-${gap.kind}`}>
                          {gapKindLabel[gap.kind]}
                        </span>
                      </td>
                      <td>
                        <strong>{gap.label}</strong>
                      </td>
                      <td>
                        <span className="meta">{gap.detail}</span>
                      </td>
                      <td>{kindLabel(gap.oppKind)}</td>
                      <td>
                        {linked.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          linked.map((o) => o.name).join(" · ")
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => openCreate(gap)}
                        >
                          Créer une opportunité
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {draft && (
        <div
          className="plan-create-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="equip-opp-create-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDraft(null);
          }}
        >
          <form className="plan-create-dialog" onSubmit={handleCreate}>
            <h2 id="equip-opp-create-title">Nouvelle opportunité</h2>
            <p className="muted">
              {gapKindLabel[draft.gap.kind]} · {draft.gap.label} ·{" "}
              {kindLabel(draft.gap.oppKind)} · phase{" "}
              {phaseLabel(activeOppPhases[0]?.id ?? "")}
            </p>
            <label>
              Nom
              <input
                required
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, name: e.target.value } : d))
                }
              />
            </label>
            {draft.gap.kind === "persona" && (
              <label>
                Solution cible
                <select
                  name="solutionId"
                  defaultValue={draft.gap.solutionId}
                  required
                >
                  {activeSolutions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Montant (€)
              <input
                type="number"
                min={0}
                step={1000}
                value={draft.amount}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, amount: e.target.value } : d))
                }
              />
            </label>
            <label>
              Close date
              <input
                type="date"
                value={draft.closeDate}
                onChange={(e) =>
                  setDraft((d) =>
                    d ? { ...d, closeDate: e.target.value } : d,
                  )
                }
              />
            </label>
            <div className="plan-create-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setDraft(null)}
              >
                Annuler
              </button>
              <button type="submit" className="primary-cta">
                Créer et ouvrir
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
