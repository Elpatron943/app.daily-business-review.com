import { useMemo, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import { formatEur } from "./data";
import type { Opportunity } from "./opportunities/OpportunityContext";
import {
  activeQuestions,
  computeDomainProgress,
  computeProcessProgress,
  getAnswer,
  PROCESS_ANSWER_STATUSES,
  type ProcessAnswerStatus,
  type ProcessDomainDef,
} from "./opportunities/salesProcess";

export default function OpportunityProcessPanel({
  opportunity,
  onAnswer,
}: {
  opportunity: Opportunity;
  onAnswer: (
    questionId: string,
    patch: { status?: ProcessAnswerStatus; note?: string },
  ) => void;
}) {
  const { activeProcessDomains } = useOrgConfig();
  const domains = activeProcessDomains;
  const progress = useMemo(
    () => computeProcessProgress(domains, opportunity.processAnswers),
    [domains, opportunity.processAnswers],
  );

  /** undefined = auto (1er domaine incomplet) · null = tout fermé · id = ouvert */
  const [openId, setOpenId] = useState<string | null | undefined>(undefined);
  const effectiveOpenId =
    openId === undefined
      ? (progress.domains.find((d) => !d.complete)?.domainId ??
        domains[0]?.id ??
        null)
      : openId;

  const startDate = opportunity.closeDate
    ? shiftMonths(opportunity.closeDate, -4)
    : "";
  const closeDate = opportunity.closeDate || "";
  const today = new Date().toISOString().slice(0, 10);
  const timeline = timelinePct(startDate, closeDate, today);

  return (
    <section className="opp-process" aria-label="Sales Process">
      <div className="opp-process-summary">
        <div className="opp-process-timeline">
          <div className="opp-process-timeline-meta">
            <span>
              Start {startDate || "—"} · Close projetée {closeDate || "—"}
            </span>
            {timeline.overdueDays > 0 && (
              <span className="tag-late">
                +{timeline.overdueDays} j. vs close
              </span>
            )}
          </div>
          <div className="opp-process-timeline-bar" aria-hidden>
            <i
              className="elapsed"
              style={{ width: `${timeline.elapsedPct}%` }}
            />
            <i
              className="today"
              style={{ left: `${timeline.todayPct}%` }}
              title="Aujourd’hui"
            />
          </div>
        </div>
        <dl className="opp-process-meta">
          <div>
            <dt>Sales Process</dt>
            <dd>Personnalisé</dd>
          </div>
          <div>
            <dt>Close CRM</dt>
            <dd>{closeDate || "—"}</dd>
          </div>
          <div>
            <dt>Valeur</dt>
            <dd>{formatEur(opportunity.amount)}</dd>
          </div>
          <div>
            <dt>Process</dt>
            <dd>
              <strong>{progress.overallPct}%</strong>
            </dd>
          </div>
        </dl>
      </div>

      {domains.length === 0 ? (
        <p className="muted">Aucun domaine Process actif.</p>
      ) : (
        <ul className="opp-process-domains">
          {domains.map((domain) => {
            const dp = computeDomainProgress(
              domain,
              opportunity.processAnswers,
            );
            const open = effectiveOpenId === domain.id;
            return (
              <li
                key={domain.id}
                className={`opp-process-domain${dp.complete ? " complete" : ""}${
                  open ? " open" : ""
                }${dp.pct >= 70 ? " ok" : dp.pct >= 35 ? " warn" : " risk"}`}
              >
                <button
                  type="button"
                  className="opp-process-domain-head"
                  onClick={() => setOpenId(open ? null : domain.id)}
                  aria-expanded={open}
                >
                  <span className="chev" aria-hidden>
                    {open ? "▾" : "▸"}
                  </span>
                  <strong>{domain.label}</strong>
                  <span className="opp-process-dots" aria-hidden>
                    {dp.statuses.map((s, i) => (
                      <i key={`${domain.id}-${i}`} className={`dot-${s}`} />
                    ))}
                  </span>
                  <span className="opp-process-domain-bar" aria-hidden>
                    <i style={{ width: `${dp.pct}%` }} />
                  </span>
                  <em>{dp.pct}%</em>
                  {dp.complete && (
                    <span className="opp-process-check" aria-label="Complet">
                      ✓
                    </span>
                  )}
                </button>
                {open && (
                  <DomainQuestions
                    domain={domain}
                    opportunity={opportunity}
                    onAnswer={onAnswer}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function DomainQuestions({
  domain,
  opportunity,
  onAnswer,
}: {
  domain: ProcessDomainDef;
  opportunity: Opportunity;
  onAnswer: (
    questionId: string,
    patch: { status?: ProcessAnswerStatus; note?: string },
  ) => void;
}) {
  const questions = activeQuestions(domain);
  return (
    <ul className="opp-process-questions">
      {questions.map((q) => {
        const answer = getAnswer(opportunity.processAnswers, q.id);
        return (
          <li key={q.id} className={`q-status-${answer.status}`}>
            <div className="opp-process-q-main">
              <strong>{q.label}</strong>
              {answer.note ? (
                <p className="opp-process-note">{answer.note}</p>
              ) : null}
              <label className="opp-process-note-edit">
                Note
                <textarea
                  rows={2}
                  value={answer.note ?? ""}
                  placeholder="Preuve / commentaire…"
                  onChange={(e) =>
                    onAnswer(q.id, {
                      note: e.target.value || undefined,
                      status: answer.status,
                    })
                  }
                />
              </label>
            </div>
            <div className="opp-process-q-side">
              <select
                value={answer.status}
                onChange={(e) =>
                  onAnswer(q.id, {
                    status: e.target.value as ProcessAnswerStatus,
                  })
                }
                aria-label={`Statut · ${q.label}`}
              >
                {PROCESS_ANSWER_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span className="muted">
                {answer.updatedAt
                  ? `Modifié ${answer.updatedAt}`
                  : "Non renseigné"}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function shiftMonths(iso: string, months: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function timelinePct(start: string, end: string, today: string) {
  const a = start ? new Date(start).getTime() : NaN;
  const b = end ? new Date(end).getTime() : NaN;
  const t = new Date(today).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) {
    return { elapsedPct: 0, todayPct: 0, overdueDays: 0 };
  }
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const elapsedPct = clamp(((Math.min(t, b) - a) / (b - a)) * 100);
  const todayPct = clamp(((t - a) / (b - a)) * 100);
  const overdueDays =
    t > b ? Math.round((t - b) / (1000 * 60 * 60 * 24)) : 0;
  return { elapsedPct, todayPct, overdueDays };
}
