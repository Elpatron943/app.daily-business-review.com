import { useEffect, useMemo, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import {
  useAccountPlans,
  type AccountPlan,
} from "./accountPlans/AccountPlanContext";
import {
  useOpportunities,
  type Opportunity,
} from "./opportunities/OpportunityContext";
import {
  checkOpenAiStatus,
  runActionPlanGeneration,
  type GeneratedPlanActionDraft,
  type OpenAiStatus,
} from "./research/openaiClient";

type DraftRow = GeneratedPlanActionDraft & { selected: boolean };

type Props = {
  plan: AccountPlan;
  /** Opportunité prioritaire pour le contexte IA (sinon 1re liée). */
  focusOpportunityId?: string | null;
};

export default function GenerateActionPlanPanel({
  plan,
  focusOpportunityId = null,
}: Props) {
  const { config, activeContactTypes, activeDirections } = useOrgConfig();
  const { activeContacts, activeAccounts } = useDomain();
  const { activeOpportunities } = useOpportunities();
  const { addAction, removeAction } = useAccountPlans();

  const [status, setStatus] = useState<OpenAiStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  const [replaceTodo, setReplaceTodo] = useState(false);
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkOpenAiStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const opportunity = useMemo(() => {
    const linked = plan.opportunityIds
      .map((id) => activeOpportunities.find((o) => o.id === id))
      .filter((o): o is Opportunity => Boolean(o));
    if (focusOpportunityId) {
      const focus = linked.find((o) => o.id === focusOpportunityId);
      if (focus) return focus;
    }
    return linked[0] ?? null;
  }, [plan.opportunityIds, activeOpportunities, focusOpportunityId]);

  const account = opportunity
    ? (activeAccounts.find((a) => a.id === opportunity.primaryAccountId) ??
      activeAccounts.find((a) => a.id === plan.accountId) ??
      null)
    : (activeAccounts.find((a) => a.id === plan.accountId) ?? null);

  const holdingName = account?.holdingId
    ? (activeAccounts.find((a) => a.id === account.holdingId)?.name ?? null)
    : null;

  const canRun =
    Boolean(status?.available && status.configured) &&
    Boolean(opportunity) &&
    !loading;

  async function handleGenerate() {
    if (!opportunity) {
      setError("Lie une opportunité au plan pour générer des actions.");
      return;
    }
    setError(null);
    setAppliedMsg(null);
    setLoading(true);
    setDrafts(null);
    try {
      const result = await runActionPlanGeneration({
        config,
        opportunity,
        account,
        holdingName,
        contacts: activeContacts,
        contactTypes: activeContactTypes,
        directions: activeDirections,
        planDueDate: plan.dueDate,
        existingActions: plan.actions.map((a) => ({
          title: a.title,
          dueDate: a.dueDate,
          status: a.status,
        })),
      });
      setDrafts(
        result.actions.map((a) => ({
          ...a,
          selected: true,
        })),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Échec de la génération IA",
      );
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

  function handleApply() {
    if (!drafts) return;
    const selected = drafts.filter((d) => d.selected && d.title.trim());
    if (selected.length === 0) {
      setError("Sélectionne au moins une action.");
      return;
    }

    if (replaceTodo) {
      for (const a of plan.actions) {
        if (a.status === "Todo") removeAction(plan.id, a.id);
      }
    }

    setError(null);
    for (const row of selected) {
      addAction(plan.id, {
        title: row.title.trim(),
        dueDate: row.dueDate,
        owner: row.owner,
        status: "Todo",
      });
    }
    setAppliedMsg(
      `${selected.length} action${selected.length > 1 ? "s" : ""} ajoutée${selected.length > 1 ? "s" : ""} — tu peux les modifier ci-dessous.`,
    );
    setDrafts(null);
  }

  return (
    <div className="gen-action-plan">
      <div className="gen-action-plan-head">
        <div>
          <h4>Générer avec IA</h4>
          <p className="muted">
            À partir du process, du mapping et des contacts de l’opportunité —
            tu pourras modifier avant et après ajout.
          </p>
        </div>
        <button
          type="button"
          className="primary-cta"
          disabled={!canRun}
          onClick={handleGenerate}
          title={
            !status?.configured
              ? "Configure OPENAI_API_KEY dans .env.local"
              : !opportunity
                ? "Lie une opportunité au plan"
                : undefined
          }
        >
          {loading ? "Génération…" : "Générer un plan d’actions"}
        </button>
      </div>

      {!opportunity && (
        <p className="muted">
          Aucune opportunité liée à ce plan — rattache-en une pour activer
          l’IA.
        </p>
      )}
      {status && !status.configured && (
        <p className="entry-error">
          OpenAI non configuré (OPENAI_API_KEY manquante).
        </p>
      )}
      {error && <p className="entry-error">{error}</p>}
      {appliedMsg && <p className="muted gen-action-ok">{appliedMsg}</p>}

      {drafts && (
        <div className="gen-action-preview">
          <div className="gen-action-preview-head">
            <strong>Prévisualisation</strong>
            <label className="gen-action-replace">
              <input
                type="checkbox"
                checked={replaceTodo}
                onChange={(e) => setReplaceTodo(e.target.checked)}
              />
              Retirer les Todo existantes avant ajout
            </label>
          </div>
          <ul className="gen-action-list">
            {drafts.map((row, index) => (
              <li key={`${row.title}-${index}`}>
                <label className="gen-action-select">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={(e) =>
                      patchDraft(index, { selected: e.target.checked })
                    }
                  />
                </label>
                <div className="gen-action-fields">
                  <input
                    value={row.title}
                    onChange={(e) =>
                      patchDraft(index, { title: e.target.value })
                    }
                    aria-label="Titre de l’action"
                  />
                  <div className="gen-action-meta">
                    <input
                      type="date"
                      value={row.dueDate ?? ""}
                      onChange={(e) =>
                        patchDraft(index, {
                          dueDate: e.target.value || undefined,
                        })
                      }
                    />
                    <input
                      className="code"
                      placeholder="Owner"
                      value={row.owner ?? ""}
                      onChange={(e) =>
                        patchDraft(index, {
                          owner: e.target.value || undefined,
                        })
                      }
                    />
                  </div>
                  {row.rationale ? (
                    <span className="muted gen-action-why">{row.rationale}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <div className="gen-action-actions">
            <button type="button" className="ghost" onClick={() => setDrafts(null)}>
              Annuler
            </button>
            <button type="button" className="primary-cta" onClick={handleApply}>
              Ajouter au plan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
