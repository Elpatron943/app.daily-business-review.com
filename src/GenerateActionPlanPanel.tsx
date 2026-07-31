import { useEffect, useState, type FormEvent } from "react";
import {
  useOpportunities,
  type Opportunity,
  type OpportunityActionStatus,
} from "./opportunities/OpportunityContext";
import {
  checkOpenAiStatus,
  runActionPlanGeneration,
  type GeneratedPlanActionDraft,
  type OpenAiStatus,
} from "./research/openaiClient";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import { isActionOverdue } from "./accountPlans/AccountPlanContext";

type DraftRow = GeneratedPlanActionDraft & { selected: boolean };

const ACTION_STATUSES: OpportunityActionStatus[] = ["Todo", "Doing", "Done"];

type Props = {
  opportunity: Opportunity;
};

export default function GenerateActionPlanPanel({ opportunity }: Props) {
  const { config, activeContactTypes, activePersonae } = useOrgConfig();
  const { activeContacts, activeAccounts } = useDomain();
  const { addAction, updateAction, removeAction } =
    useOpportunities();

  const [status, setStatus] = useState<OpenAiStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  const [replaceTodo, setReplaceTodo] = useState(false);
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newOwner, setNewOwner] = useState("");

  useEffect(() => {
    let cancelled = false;
    checkOpenAiStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const account =
    activeAccounts.find((a) => a.id === opportunity.primaryAccountId) ?? null;
  const holdingName = account?.holdingId
    ? (activeAccounts.find((a) => a.id === account.holdingId)?.name ?? null)
    : null;

  const actions = opportunity.actions ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const canRun =
    Boolean(status?.available && status.configured) && !loading;

  async function handleGenerate() {
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
        personae: activePersonae,
        planDueDate: opportunity.closeDate || undefined,
        existingActions: actions.map((a) => ({
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
      for (const a of actions) {
        if (a.status === "Todo") removeAction(opportunity.id, a.id);
      }
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
    setDrafts(null);
  }

  function handleAddManual(e: FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    addAction(opportunity.id, {
      title: newTitle.trim(),
      dueDate: newDue || undefined,
      owner: newOwner.trim() || undefined,
      status: "Todo",
    });
    setNewTitle("");
    setNewDue("");
    setNewOwner("");
  }

  return (
    <div className="gen-action-plan">
      <div className="gen-action-plan-head">
        <div>
          <h4>Générer avec IA</h4>
          <p className="muted">
            À partir du process, du mapping et des contacts — tu pourras
            modifier avant et après ajout.
          </p>
        </div>
        <button
          type="button"
          className="primary-cta"
          disabled={!canRun}
          onClick={handleGenerate}
          title={
            !status?.configured
              ? "L’IA n’est pas encore configurée"
              : undefined
          }
        >
          {loading ? "Génération…" : "Générer un plan d’actions"}
        </button>
      </div>

      {status && !status.configured && (
        <p className="entry-error">
          L’IA n’est pas encore configurée. Contacte ton administrateur.
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
              Ajouter à l’opportunité
            </button>
          </div>
        </div>
      )}

      <section className="entry-subsection" aria-label="Actions de l’opportunité">
        <h4>Actions</h4>
        <form className="entry-form" onSubmit={handleAddManual}>
          <div className="data-form-grid">
            <label>
              Titre
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                placeholder="Prochaine étape…"
              />
            </label>
            <label>
              Échéance
              <input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
              />
            </label>
            <label>
              Owner
              <input
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                placeholder="AE, SE…"
              />
            </label>
          </div>
          <button type="submit" className="primary-cta" disabled={!newTitle.trim()}>
            Ajouter une action
          </button>
        </form>

        {actions.length === 0 ? (
          <p className="muted">Aucune action sur cette opportunité.</p>
        ) : (
          <ul className="entry-list">
            {actions.map((a) => {
              const overdue = isActionOverdue(a, today);
              return (
                <li key={a.id}>
                  <div className="entry-list-main">
                    <strong>
                      {a.title}
                      {overdue ? " · en retard" : ""}
                    </strong>
                    <span className="meta">
                      {a.dueDate ? `Échéance ${a.dueDate}` : "Sans échéance"}
                      {a.owner ? ` · ${a.owner}` : ""}
                    </span>
                  </div>
                  <div className="plan-create-actions">
                    <select
                      value={a.status}
                      onChange={(e) =>
                        updateAction(opportunity.id, a.id, {
                          status: e.target.value as OpportunityActionStatus,
                        })
                      }
                      aria-label={`Statut · ${a.title}`}
                    >
                      {ACTION_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ghost danger-text"
                      onClick={() => removeAction(opportunity.id, a.id)}
                    >
                      Retirer
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
