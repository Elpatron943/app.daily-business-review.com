import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { useOrgConfig } from "../config/ConfigContext";
import { useDomain } from "../domain/DomainContext";
import {
  computeProcessProgress,
  funnelMidPhases,
} from "./salesProcess";
import {
  computeMappingScorecard,
  mappingWeightsFromSubtypes,
} from "./mappingScore";
import { diagnoseOpportunity } from "./dealDiagnosis";
import {
  useOpportunities,
  type Opportunity,
} from "./OpportunityContext";
import {
  buildSalesCoachQueue,
  type SalesCoachStep,
} from "./salesDealCoachSteps";

type ChatMsg = { role: "bot" | "user"; text: string };

type Props = {
  opportunity: Opportunity;
  defaultOpen?: boolean;
  /** Passe au hub « Next step » / revue IA. */
  onOpenReview?: () => void;
};

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>,
  );
}

export default function SalesDealCoach({
  opportunity,
  defaultOpen = false,
  onOpenReview,
}: Props) {
  const { billing } = useAuth();
  const { activeContacts, activeAccounts, upsertContact } = useDomain();
  const { activeProcessDomains, activeOppPhases, config, activePersonae } =
    useOrgConfig();
  const { updateOpportunity, addAction } = useOpportunities();

  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [doneGuide, setDoneGuide] = useState(false);
  const startedRef = useRef(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const queueSnapshot = useRef<SalesCoachStep[]>([]);

  const findings = useMemo(() => {
    const proc = computeProcessProgress(
      activeProcessDomains,
      opportunity.processAnswers,
    );
    const weights = mappingWeightsFromSubtypes(config.oppMappingSubtypes ?? []);
    const mapping = computeMappingScorecard(opportunity.mappingChecks, weights);
    const mappingPct =
      mapping.masteryPct !== null
        ? mapping.masteryPct
        : mapping.total > 0
          ? Math.round((mapping.covered / mapping.total) * 100)
          : null;
    const mid = funnelMidPhases(activeOppPhases).map((p) => p.id);
    return diagnoseOpportunity({
      opportunity,
      contacts: activeContacts.map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title,
        accountId: c.accountId,
      })),
      accounts: activeAccounts.map((a) => ({
        id: a.id,
        type: a.type,
        holdingId: a.holdingId,
      })),
      processDomains: activeProcessDomains,
      phaseOrder: ["Whitespace", ...mid, "Closed Won", "Closed Lost"],
      processPct: proc.overallPct,
      mappingPct,
    });
  }, [
    opportunity,
    activeContacts,
    activeAccounts,
    activeProcessDomains,
    activeOppPhases,
    config.oppMappingSubtypes,
  ]);

  useEffect(() => {
    if (!open) return;
    if (startedRef.current) return;
    startedRef.current = true;
    const queue = buildSalesCoachQueue({ opportunity, findings });
    queueSnapshot.current = queue;
    setStepIndex(0);
    if (queue.length === 0) {
      setDoneGuide(true);
      setMessages([
        {
          role: "bot",
          text: "La qualification de base est en place. Passe à **Next step** pour la revue IA.",
        },
      ]);
      return;
    }
    setDoneGuide(false);
    setMessages([
      {
        role: "bot",
        text: "On avance deal par deal. Je te pose les questions qui manquent — tu réponds, j’écris dans la fiche.",
      },
      { role: "bot", text: queue[0]!.botMessage },
    ]);
  }, [open, opportunity, findings]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const step = queueSnapshot.current[stepIndex];

  function applyAnswer(stepDef: SalesCoachStep, value: string) {
    const v = value.trim();
    if (stepDef.id === "stakeholder") {
      const parts = v.split("—").map((s) => s.trim());
      const name = parts[0] || v;
      const title = parts[1] || "";
      const contactId = upsertContact({
        name,
        title,
        accountId: opportunity.primaryAccountId,
        personaId: activePersonae[0]?.id ?? "",
      });
      updateOpportunity(opportunity.id, {
        stakeholders: [
          ...(opportunity.stakeholders ?? []),
          {
            contactId,
            role: "Champion",
            status: "Identified",
          },
        ],
      });
      return;
    }
    if (stepDef.id === "problem") {
      updateOpportunity(opportunity.id, {
        projectWhy: {
          ...opportunity.projectWhy,
          problem: v,
        },
      });
      return;
    }
    if (stepDef.id === "urgency") {
      updateOpportunity(opportunity.id, {
        whyNow: {
          ...opportunity.whyNow,
          decisionDeadline:
            opportunity.whyNow?.decisionDeadline ||
            opportunity.closeDate ||
            "",
          inactionNote: [
            opportunity.whyNow?.inactionNote?.trim(),
            `Urgence : ${v}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      });
      return;
    }
    if (stepDef.id === "competitor") {
      updateOpportunity(opportunity.id, {
        whyNow: {
          ...opportunity.whyNow,
          inactionNote: [
            opportunity.whyNow?.inactionNote?.trim(),
            `Concurrent / statut quo : ${v}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      });
      return;
    }
    if (stepDef.id === "value") {
      updateOpportunity(opportunity.id, {
        whyNow: {
          ...opportunity.whyNow,
          inactionNote: [opportunity.whyNow?.inactionNote?.trim(), v]
            .filter(Boolean)
            .join("\n"),
        },
      });
      return;
    }
    if (stepDef.id === "challenge") {
      addAction(opportunity.id, {
        title: v.slice(0, 120) || `Suite ${stepDef.findingCode ?? "deal"}`,
        status: "Todo",
      });
      updateOpportunity(opportunity.id, {
        whyNow: {
          ...opportunity.whyNow,
          inactionNote: [
            opportunity.whyNow?.inactionNote?.trim(),
            `Réponse ${stepDef.findingCode ?? ""} : ${v}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!step || !input.trim() || billing.subscriptionBlocked) return;
    const value = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: value }]);
    applyAnswer(step, value);

    const queue = queueSnapshot.current;
    const next = stepIndex + 1;
    if (next >= queue.length) {
      setDoneGuide(true);
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: "Bien. Socle noté. Passe à **Next step** pour challenger avec la revue IA.",
        },
      ]);
      return;
    }
    setStepIndex(next);
    setMessages((prev) => [
      ...prev,
      { role: "bot", text: queue[next]!.botMessage },
    ]);
  }

  function openGuide() {
    startedRef.current = false;
    setMessages([]);
    setOpen(true);
  }

  if (billing.productLine !== "sales") return null;

  return (
    <div className="sales-coach-root">
      {open ? (
        <section
          className="sales-coach-panel"
          role="dialog"
          aria-label="Coach deal"
        >
          <header className="sales-coach-head">
            <div>
              <p className="sales-coach-kicker">Coach deal</p>
              <h3>
                {doneGuide ? "Prêt pour la revue" : step?.title || "Qualification"}
              </h3>
            </div>
            <button
              type="button"
              className="sales-coach-close"
              aria-label="Fermer"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>

          <div className="sales-coach-messages" ref={scrollerRef}>
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={
                  m.role === "bot"
                    ? "sales-coach-bubble bot"
                    : "sales-coach-bubble user"
                }
              >
                {m.role === "bot" ? renderBold(m.text) : m.text}
              </div>
            ))}
          </div>

          {!doneGuide && step ? (
            <form className="sales-coach-composer" onSubmit={onSubmit}>
              <textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={step.placeholder}
                disabled={billing.subscriptionBlocked}
              />
              <button type="submit" disabled={!input.trim()}>
                Envoyer
              </button>
            </form>
          ) : (
            <div className="sales-coach-footer">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenReview?.();
                }}
              >
                Aller à Next step
              </button>
            </div>
          )}
        </section>
      ) : null}

      <button
        type="button"
        className={`sales-coach-fab${open ? " is-open" : ""}`}
        onClick={() => (open ? setOpen(false) : openGuide())}
      >
        {open ? "Fermer" : "Coach deal"}
      </button>
    </div>
  );
}
