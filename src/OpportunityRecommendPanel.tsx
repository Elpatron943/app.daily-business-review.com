import { useEffect, useId, useMemo, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import { useAccountPlans } from "./accountPlans/AccountPlanContext";
import {
  useOpportunities,
  type Opportunity,
} from "./opportunities/OpportunityContext";
import { computeProcessProgress } from "./opportunities/salesProcess";
import {
  computeMappingScorecard,
  mappingWeightsFromSubtypes,
} from "./opportunities/mappingScore";
import { BriefMarkdown } from "./research/BriefMarkdown";
import {
  ANALYSIS_SECTION_OPTIONS,
  defaultAnalysisIncludes,
  type OpportunityAnalysisIncludes,
  type OpportunityAnalysisSectionId,
} from "./research/buildOpportunityAnalysisPrompt";
import {
  checkOpenAiStatus,
  runOpportunityAnalysis,
  type GeneratedPlanActionDraft,
  type OpenAiStatus,
} from "./research/openaiClient";

type DraftRow = GeneratedPlanActionDraft & { selected: boolean };
type ResultPane = "diagnostic" | "actions";

type Props = {
  opportunity: Opportunity;
};

function includesStorageKey(opportunityId: string) {
  return `powermap.aiAnalysisIncludes.${opportunityId}`;
}

function loadIncludes(opportunityId: string): OpportunityAnalysisIncludes {
  const base = defaultAnalysisIncludes();
  try {
    const raw = localStorage.getItem(includesStorageKey(opportunityId));
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<OpportunityAnalysisIncludes>;
    return { ...base, ...parsed };
  } catch {
    return base;
  }
}

function saveIncludes(
  opportunityId: string,
  includes: OpportunityAnalysisIncludes,
) {
  try {
    localStorage.setItem(
      includesStorageKey(opportunityId),
      JSON.stringify(includes),
    );
  } catch {
    /* ignore */
  }
}

export default function OpportunityRecommendPanel({ opportunity }: Props) {
  const { config, activeContactTypes, activePersonae, activeProcessDomains } =
    useOrgConfig();
  const { activeContacts, activeAccounts } = useDomain();
  const { updateOpportunity, addAction } = useOpportunities();
  const { getPlanForOpportunity } = useAccountPlans();

  const [status, setStatus] = useState<OpenAiStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null);
  const [pane, setPane] = useState<ResultPane>("diagnostic");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [includes, setIncludes] = useState<OpportunityAnalysisIncludes>(() =>
    loadIncludes(opportunity.id),
  );

  const linkedPlan = getPlanForOpportunity(opportunity.id);

  useEffect(() => {
    let cancelled = false;
    checkOpenAiStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const proposed = opportunity.aiRecommendations?.proposedActions;
    if (proposed?.length) {
      setDrafts(proposed.map((a) => ({ ...a, selected: true })));
      setPane("actions");
    } else {
      setDrafts(null);
      setPane("diagnostic");
    }
  }, [opportunity.id, opportunity.aiRecommendations?.updatedAt]);

  useEffect(() => {
    setIncludes(loadIncludes(opportunity.id));
    setPickerOpen(false);
  }, [opportunity.id]);

  const account =
    activeAccounts.find((a) => a.id === opportunity.primaryAccountId) ?? null;
  const holdingName = account?.holdingId
    ? (activeAccounts.find((a) => a.id === account.holdingId)?.name ?? null)
    : null;

  const proc = useMemo(
    () =>
      computeProcessProgress(
        activeProcessDomains,
        opportunity.processAnswers,
      ),
    [activeProcessDomains, opportunity.processAnswers],
  );
  const mappingScore = useMemo(() => {
    const weights = mappingWeightsFromSubtypes(config.oppMappingSubtypes ?? []);
    return computeMappingScorecard(opportunity.mappingChecks, weights);
  }, [opportunity.mappingChecks, config.oppMappingSubtypes]);

  const inputs = useMemo(() => {
    const stake = opportunity.stakeholders?.length ?? 0;
    const ce = opportunity.compellingEventIds?.length ?? 0;
    const planN = opportunity.actions?.length ?? 0;
    return [
      {
        label: "Process",
        detail: `${proc.overallPct}% renseigné`,
        ok: proc.overallPct >= 35,
      },
      {
        label: "Mapping / SWOT",
        detail:
          mappingScore.total === 0
            ? "Aucune carte"
            : `${mappingScore.covered}/${mappingScore.total} maîtrisées`,
        ok: mappingScore.total > 0,
      },
      {
        label: "Stakeholders",
        detail: stake ? `${stake} contact${stake > 1 ? "s" : ""}` : "Aucun",
        ok: stake > 0,
      },
      {
        label: "Compelling Event",
        detail: ce ? `${ce} sélectionné${ce > 1 ? "s" : ""}` : "Manquant",
        ok: ce > 0,
      },
      {
        label: "Plan d’actions",
        detail: planN
          ? `${planN} action${planN > 1 ? "s" : ""}`
          : "Aucun (créé à l’ajout)",
        ok: true,
      },
    ];
  }, [
    proc.overallPct,
    mappingScore,
    opportunity.stakeholders,
    opportunity.compellingEventIds,
    opportunity.actions?.length,
  ]);

  const inputReady = inputs.filter((i) => i.ok).length;
  const canRun = Boolean(status?.available && status.configured) && !loading;
  const includedCount = ANALYSIS_SECTION_OPTIONS.filter(
    (o) => includes[o.id],
  ).length;
  const recos = opportunity.aiRecommendations ?? null;
  const verdict = recos?.verdict;
  const confidence = recos?.confidence;
  const selectedCount = drafts?.filter((d) => d.selected).length ?? 0;

  function toggleInclude(id: OpportunityAnalysisSectionId) {
    setIncludes((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function setAllIncludes(value: boolean) {
    setIncludes((prev) => {
      const next = { ...prev };
      for (const opt of ANALYSIS_SECTION_OPTIONS) next[opt.id] = value;
      return next;
    });
  }

  async function handleRun(selected: OpportunityAnalysisIncludes) {
    setPickerOpen(false);
    saveIncludes(opportunity.id, selected);
    setIncludes(selected);
    setError(null);
    setAppliedMsg(null);
    setLoading(true);
    try {
      const result = await runOpportunityAnalysis({
        config,
        opportunity,
        account,
        holdingName,
        contacts: activeContacts,
        contactTypes: activeContactTypes,
        personae: activePersonae,
        planDueDate: linkedPlan?.dueDate || opportunity.closeDate,
        existingPlanActions: (opportunity.actions ?? []).map((a) => ({
          title: a.title,
          dueDate: a.dueDate,
          status: a.status,
          owner: a.owner,
        })),
        includes: selected,
      });
      updateOpportunity(opportunity.id, {
        aiRecommendations: {
          updatedAt: result.updatedAt,
          content: result.content,
          model: result.model,
          verdict: result.verdict,
          confidence: result.confidence,
          proposedActions: result.proposedActions,
        },
      });
      setDrafts(result.proposedActions.map((a) => ({ ...a, selected: true })));
      setPane(
        result.proposedActions.length > 0 ? "actions" : "diagnostic",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echec de l'analyse IA");
    } finally {
      setLoading(false);
    }
  }

  function patchDraft(index: number, patch: Partial<DraftRow>) {
    setDrafts((prev) =>
      prev
        ? prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
        : prev,
    );
  }

  function toggleAll(selected: boolean) {
    setDrafts((prev) =>
      prev ? prev.map((row) => ({ ...row, selected })) : prev,
    );
  }

  function handleApplyActions() {
    if (!drafts) return;
    const selected = drafts.filter((d) => d.selected && d.title.trim());
    if (selected.length === 0) {
      setError("Sélectionne au moins une action.");
      return;
    }
    setError(null);

    for (const row of selected) {
      addAction(opportunity.id, {
        title: row.title.trim(),
        dueDate: row.dueDate,
        owner: row.owner,
        status: "Todo",
      });
    }
    setAppliedMsg(
      `${selected.length} action${selected.length > 1 ? "s" : ""} ajoutée${selected.length > 1 ? "s" : ""} à l’opportunité.`,
    );
    const remaining = drafts.filter((d) => !d.selected);
    setDrafts(remaining.length ? remaining : null);
    updateOpportunity(opportunity.id, {
      aiRecommendations: {
        ...(opportunity.aiRecommendations ?? {
          updatedAt: new Date().toISOString(),
          content: "",
        }),
        proposedActions: remaining.map(({ selected: _s, ...rest }) => rest),
      },
    });
    if (!remaining.length) setPane("diagnostic");
  }

  const confidenceLabel =
    confidence === "high"
      ? "Confiance haute"
      : confidence === "medium"
        ? "Confiance moyenne"
        : confidence === "low"
          ? "Confiance basse"
          : null;

  return (
    <section className="opp-coach">
      <header className="opp-coach-hero">
        <div>
          <p className="opp-coach-kicker">Pilotage dirco</p>
          <h2>Analyse d’ensemble</h2>
          <p className="muted">
            Choisis les blocs à injecter (SWOT, USP, process…) puis lance
            l’analyse pour un verdict et des actions à valider.
          </p>
        </div>
        <button
          type="button"
          className="primary-cta"
          disabled={!canRun}
          onClick={() => setPickerOpen(true)}
        >
          {loading
            ? "Analyse en cours…"
            : recos
              ? "Relancer l’analyse"
              : "Lancer l’analyse"}
        </button>
      </header>

      {pickerOpen ? (
        <AnalysisIncludesModal
          includes={includes}
          onToggle={toggleInclude}
          onSetAll={setAllIncludes}
          onCancel={() => setPickerOpen(false)}
          onConfirm={() => void handleRun(includes)}
          includedCount={includedCount}
        />
      ) : null}

      <div className="opp-coach-inputs" aria-label="Données exploitées">
        <div className="opp-coach-inputs-head">
          <h3>Données prises en compte</h3>
          <span className="muted">
            {inputReady}/{inputs.length} prêts
          </span>
        </div>
        <ul>
          {inputs.map((item) => (
            <li key={item.label} className={item.ok ? "ok" : "gap"}>
              <span className="dot" aria-hidden />
              <div>
                <strong>{item.label}</strong>
                <em>{item.detail}</em>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {status && !status.configured && (
        <p className="entry-error">
          L’IA n’est pas configurée. Contacte ton administrateur.
        </p>
      )}
      {status?.available === false && (
        <p className="muted warn-hint">
          Service IA temporairement indisponible.
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
      {appliedMsg && <p className="muted gen-action-ok">{appliedMsg}</p>}

      {!recos && !loading ? (
        <div className="opp-coach-empty">
          <p>
            Remplis les socles de qualification, puis lance l’analyse pour
            obtenir un verdict et des actions concrètes.
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="opp-coach-loading" role="status">
          <div className="opp-coach-loading-bar" aria-hidden />
          <p>Lecture du process, du mapping et du plan…</p>
        </div>
      ) : null}

      {recos && !loading ? (
        <div className="opp-coach-results">
          {verdict ? (
            <div
              className={`opp-coach-verdict is-${verdict.toLowerCase().replace("-", "")}`}
            >
              <div>
                <span className="opp-coach-verdict-label">Verdict</span>
                <strong>{verdict}</strong>
              </div>
              <div className="opp-coach-verdict-meta">
                {confidenceLabel ? <span>{confidenceLabel}</span> : null}
                <span>
                  {new Date(recos.updatedAt).toLocaleString("fr-FR")}
                </span>
              </div>
            </div>
          ) : null}

          <nav className="opp-coach-panes" aria-label="Résultat analyse">
            <button
              type="button"
              className={pane === "diagnostic" ? "active" : ""}
              onClick={() => setPane("diagnostic")}
            >
              Diagnostic
            </button>
            <button
              type="button"
              className={pane === "actions" ? "active" : ""}
              onClick={() => setPane("actions")}
              disabled={!drafts?.length}
            >
              Actions proposées
              {drafts?.length ? ` (${drafts.length})` : ""}
            </button>
          </nav>

          {pane === "diagnostic" ? (
            <article className="opp-coach-diagnostic">
              <BriefMarkdown text={recos.content} />
            </article>
          ) : null}

          {pane === "actions" && drafts && drafts.length > 0 ? (
            <div className="opp-coach-actions">
              <div className="opp-coach-actions-toolbar">
                <p className="muted">
                  {selectedCount} sélectionnée
                  {selectedCount > 1 ? "s" : ""} — ajout au plan
                  {linkedPlan ? ` (échéance ${linkedPlan.dueDate || "—"})` : ""}
                </p>
                <div className="opp-coach-actions-tools">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => toggleAll(true)}
                  >
                    Tout cocher
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => toggleAll(false)}
                  >
                    Tout décocher
                  </button>
                </div>
              </div>
              <ul className="opp-coach-action-list">
                {drafts.map((row, index) => (
                  <li
                    key={`${row.title}-${index}`}
                    className={row.selected ? "is-selected" : ""}
                  >
                    <label className="opp-coach-action-check">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(e) =>
                          patchDraft(index, { selected: e.target.checked })
                        }
                      />
                    </label>
                    <div className="opp-coach-action-body">
                      <input
                        className="opp-coach-action-title"
                        value={row.title}
                        onChange={(e) =>
                          patchDraft(index, { title: e.target.value })
                        }
                        aria-label="Titre de l’action"
                      />
                      {row.rationale ? (
                        <p className="opp-coach-action-why">{row.rationale}</p>
                      ) : null}
                      <div className="opp-coach-action-meta">
                        <label>
                          Échéance
                          <input
                            type="date"
                            value={row.dueDate ?? ""}
                            onChange={(e) =>
                              patchDraft(index, {
                                dueDate: e.target.value || undefined,
                              })
                            }
                          />
                        </label>
                        <label>
                          Owner
                          <input
                            value={row.owner ?? ""}
                            placeholder="AE / SE / Champion"
                            onChange={(e) =>
                              patchDraft(index, {
                                owner: e.target.value || undefined,
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="opp-coach-actions-footer">
                <button
                  type="button"
                  className="primary-cta"
                  disabled={selectedCount === 0}
                  onClick={handleApplyActions}
                >
                  Ajouter {selectedCount || ""} action
                  {selectedCount > 1 ? "s" : ""} au plan
                </button>
              </div>
            </div>
          ) : null}

          {pane === "actions" && (!drafts || drafts.length === 0) ? (
            <p className="muted opp-coach-empty-actions">
              Aucune action en attente — relance l’analyse ou consulte le plan.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function AnalysisIncludesModal({
  includes,
  onToggle,
  onSetAll,
  onCancel,
  onConfirm,
  includedCount,
}: {
  includes: OpportunityAnalysisIncludes;
  onToggle: (id: OpportunityAnalysisSectionId) => void;
  onSetAll: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  includedCount: number;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="opp-analysis-picker-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="opp-analysis-picker">
        <header className="opp-analysis-picker-head">
          <div>
            <p className="opp-analysis-picker-kicker">Analyse IA</p>
            <h3 id={titleId}>Éléments à intégrer</h3>
          </div>
          <button type="button" className="ghost" onClick={onCancel}>
            Fermer
          </button>
        </header>
        <p className="muted opp-analysis-picker-intro">
          Coche les blocs à envoyer à l’IA. Le contexte deal (nom, phase,
          montant, compte) est toujours inclus.
        </p>
        <div className="opp-analysis-picker-tools">
          <button type="button" className="ghost" onClick={() => onSetAll(true)}>
            Tout cocher
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => onSetAll(false)}
          >
            Tout décocher
          </button>
          <span className="muted">
            {includedCount}/{ANALYSIS_SECTION_OPTIONS.length}
          </span>
        </div>
        <ul className="opp-analysis-picker-list">
          {ANALYSIS_SECTION_OPTIONS.map((opt) => (
            <li key={opt.id}>
              <label>
                <input
                  type="checkbox"
                  checked={includes[opt.id]}
                  onChange={() => onToggle(opt.id)}
                />
                <span>
                  <strong>{opt.label}</strong>
                  <em>{opt.hint}</em>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <footer className="opp-analysis-picker-footer">
          <button type="button" className="ghost" onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className="primary-cta" onClick={onConfirm}>
            Lancer l’analyse
          </button>
        </footer>
      </div>
    </div>
  );
}
