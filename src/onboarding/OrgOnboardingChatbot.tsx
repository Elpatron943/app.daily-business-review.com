import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { useOrgConfig } from "../config/ConfigContext";
import {
  checkOpenAiStatus,
  runOnboardingEnrichment,
} from "../research/openaiClient";
import { supabase } from "../supabase/client";
import { mergeOnboardingDraft } from "./applyOnboardingDraft";
import { buildHeuristicDraft } from "./buildOnboardingEnrichmentPrompt";
import {
  savedAnswerSections,
  savedConfigSections,
} from "./savedSetup";
import {
  EMPTY_ANSWERS,
  ONBOARDING_FUNNEL,
  type OnboardingAnswers,
  type OnboardingDraft,
  type OnboardingDraftItem,
} from "./types";

type Phase = "chat" | "enriching" | "review" | "done" | "recap";

type ChatMsg = {
  id: string;
  role: "bot" | "user";
  text: string;
};

function renderBotText(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>,
  );
}

function DraftSection({
  title,
  hint,
  items,
  onToggle,
  labelOf = (i) => i.label,
}: {
  title: string;
  hint?: string;
  items: OnboardingDraftItem[];
  onToggle: (index: number) => void;
  labelOf?: (item: OnboardingDraftItem, index: number) => string;
}) {
  if (!items.length) return null;
  return (
    <section className="onboard-review-section">
      <h3>{title}</h3>
      {hint ? <p className="muted onboard-review-hint">{hint}</p> : null}
      <ul className="onboard-review-list">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>
            <label className="check-inline">
              <input
                type="checkbox"
                checked={item.selected}
                onChange={() => onToggle(index)}
              />
              <span>
                <strong>{labelOf(item, index)}</strong>
                {item.description ? (
                  <span className="muted"> — {item.description}</span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function OrgOnboardingChatbot() {
  const formId = useId();
  const {
    profile,
    organization,
    billing,
    needsOrgOnboarding,
    completeOrgOnboarding,
  } = useAuth();
  const { config, replaceConfig } = useOrgConfig();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("chat");
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>(EMPTY_ANSWERS);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const isSalesAdmin =
    billing.productLine === "sales" && profile?.role === "admin";
  /** Sales : pas de Settings — le chatbot est le parcours de config. */
  const canUseSalesAssistant = isSalesAdmin;
  const forceModal = needsOrgOnboarding;

  useEffect(() => {
    if (forceModal) setOpen(true);
  }, [forceModal]);

  function resetConversation() {
    startedRef.current = false;
    setPhase("chat");
    setStepIndex(0);
    setAnswers(EMPTY_ANSWERS);
    setInput("");
    setMessages([]);
    setDraft(null);
    setError(null);
    setAiHint(null);
    setBusy(false);
  }

  function openingMessages(): ChatMsg[] {
    const first = ONBOARDING_FUNNEL[0];
    const firstName = profile?.full_name?.split(/\s+/)[0];
    return [
      {
        id: "welcome",
        role: "bot",
        text: `Bienvenue${firstName ? ` ${firstName}` : ""} ! On configure DBR en mode questions/réponses — offre, Pourquoi, Pourquoi maintenant, Pourquoi nous. Réponds librement ; tu valideras tout avant application.`,
      },
      {
        id: `q-${first.id}`,
        role: "bot",
        text: first.botMessage,
      },
    ];
  }

  function startChat() {
    startedRef.current = true;
    setPhase("chat");
    setStepIndex(0);
    setAnswers(EMPTY_ANSWERS);
    setInput("");
    setMessages(openingMessages());
    setDraft(null);
    setError(null);
    void checkOpenAiStatus().then((s) => {
      if (!s.configured) {
        setAiHint(
          "IA non configurée : une proposition sera construite à partir de tes réponses seules.",
        );
      }
    });
  }

  function openAssistant() {
    resetConversation();
    if (organization?.onboarding_completed_at) {
      startedRef.current = true;
      setPhase("recap");
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open || startedRef.current) return;
    startChat();
  }, [open, profile?.full_name]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, phase, draft, open]);

  const progress = useMemo(() => {
    const total = ONBOARDING_FUNNEL.length;
    if (
      phase === "review" ||
      phase === "done" ||
      phase === "enriching" ||
      phase === "recap"
    ) {
      return 100;
    }
    return Math.round(((stepIndex + 1) / total) * 100);
  }, [phase, stepIndex]);

  const progressLabel = useMemo(() => {
    const total = ONBOARDING_FUNNEL.length;
    if (phase === "recap") return "Paramétrage enregistré";
    if (phase === "done") return "Terminé";
    if (phase === "review") return "Validation";
    if (phase === "enriching") return "Préparation de la proposition";
    const current = Math.min(stepIndex + 1, total);
    return `Question ${current} sur ${total}`;
  }, [phase, stepIndex]);

  const savedSections = useMemo(() => {
    const fromAnswers = savedAnswerSections(config.onboardingAnswers);
    if (fromAnswers.length) {
      return { source: "answers" as const, sections: fromAnswers };
    }
    return {
      source: "config" as const,
      sections: savedConfigSections(config, organization?.name ?? ""),
    };
  }, [config, organization?.name]);

  if (!forceModal && !canUseSalesAssistant) return null;

  async function runEnrichment(nextAnswers: OnboardingAnswers) {
    setPhase("enriching");
    setBusy(true);
    setError(null);
    setMessages((prev) => [
      ...prev,
      {
        id: `enrich-${Date.now()}`,
        role: "bot",
        text: "Nice. Je prépare une proposition (catalogue + Pourquoi / Pourquoi maintenant / Pourquoi nous)…",
      },
    ]);
    try {
      const status = await checkOpenAiStatus();
      const result = status.configured
        ? await runOnboardingEnrichment(nextAnswers)
        : {
            draft: buildHeuristicDraft(nextAnswers),
            model: "heuristic",
          };
      setDraft(result.draft);
      setPhase("review");
      setMessages((prev) => [
        ...prev,
        {
          id: `review-${Date.now()}`,
          role: "bot",
          text: "Voici la proposition. Coche / décoche ce que tu veux garder, puis valide pour l’écrire dans DBR.",
        },
      ]);
    } catch (err) {
      const fallback = buildHeuristicDraft(nextAnswers);
      setDraft(fallback);
      setPhase("review");
      setAiHint(
        err instanceof Error
          ? `${err.message} — proposition locale utilisée.`
          : "IA indisponible — proposition locale utilisée.",
      );
    } finally {
      setBusy(false);
    }
  }

  function submitAnswer(e: FormEvent) {
    e.preventDefault();
    if (busy || phase !== "chat") return;
    const step = ONBOARDING_FUNNEL[stepIndex];
    if (!step) return;
    const value = input.trim();
    if (!value && !step.optional) return;

    const nextAnswers = { ...answers, [step.id]: value };
    setAnswers(nextAnswers);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: `a-${step.id}-${Date.now()}`, role: "user", text: value || "—" },
    ]);

    const nextIndex = stepIndex + 1;
    if (nextIndex >= ONBOARDING_FUNNEL.length) {
      void runEnrichment(nextAnswers);
      return;
    }
    setStepIndex(nextIndex);
    const nextStep = ONBOARDING_FUNNEL[nextIndex];
    setMessages((prev) => [
      ...prev,
      {
        id: `q-${nextStep.id}`,
        role: "bot",
        text: nextStep.botMessage,
      },
    ]);
  }

  function toggleDraftItem<K extends keyof OnboardingDraft>(
    key: K,
    index: number,
  ) {
    setDraft((prev) => {
      if (!prev) return prev;
      const list = prev[key];
      if (!Array.isArray(list)) return prev;
      const nextList = list.map((item, i) =>
        i === index && item && typeof item === "object" && "selected" in item
          ? { ...item, selected: !item.selected }
          : item,
      );
      return { ...prev, [key]: nextList };
    });
  }

  async function applyDraft() {
    if (!draft || !organization?.id) return;
    setBusy(true);
    setError(null);
    try {
      const next = {
        ...mergeOnboardingDraft(config, draft),
        onboardingAnswers: { ...answers },
      };
      replaceConfig(next);
      if (supabase && draft.orgName.trim()) {
        await supabase
          .from("organizations")
          .update({ name: draft.orgName.trim() })
          .eq("id", organization.id);
      }
      if (needsOrgOnboarding) {
        const err = await completeOrgOnboarding();
        if (err) throw new Error(err);
      }
      setPhase("done");
      setMessages((prev) => [
        ...prev,
        {
          id: `done-${Date.now()}`,
          role: "bot",
          text: canUseSalesAssistant
            ? "C’est appliqué. Rouvre l’assistant pour revoir ces réponses."
            : "Paramètres appliqués. Tu peux maintenant continuer dans DBR.",
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible d’appliquer le paramétrage.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function skipOnboarding() {
    if (!forceModal) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const err = await completeOrgOnboarding();
      if (err) throw new Error(err);
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de passer l’étape.",
      );
    } finally {
      setBusy(false);
    }
  }

  const step = ONBOARDING_FUNNEL[stepIndex];

  return (
    <>
      {canUseSalesAssistant && !forceModal && !open ? (
        <div className="onboard-fab-root">
          <button
            type="button"
            className="onboard-fab"
            onClick={openAssistant}
          >
            Assistant config
          </button>
        </div>
      ) : null}

      {open ? (
        <div
          className={
            forceModal ? "onboard-overlay" : "onboard-overlay onboard-overlay-soft"
          }
          role="dialog"
          aria-modal={forceModal}
        >
          <div className="onboard-dialog">
            <header className="onboard-header">
              <div>
                <p className="onboard-kicker">
                  {forceModal ? "Démarrage" : "DBR Sales"}
                </p>
                <h2>Assistant de paramétrage</h2>
                <p className="muted onboard-sub">
                  {phase === "recap"
                    ? "Données validées pour ton organisation."
                    : "Questions / réponses — tu valides avant que quoi que ce soit soit écrit."}
                </p>
              </div>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => void skipOnboarding()}
              >
                {forceModal ? "Passer" : "Fermer"}
              </button>
            </header>

            <div className="onboard-gauge">
              <div className="onboard-gauge-meta">
                <span>{progressLabel}</span>
                <span>{progress}%</span>
              </div>
              <div
                className="onboard-progress"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={progressLabel}
              >
                <div style={{ width: `${progress}%` }} />
              </div>
            </div>

            {aiHint ? <p className="muted onboard-ai-hint">{aiHint}</p> : null}
            {error ? <p className="auth-error">{error}</p> : null}

            {phase === "recap" ? (
              <div className="onboard-recap">
                <p className="onboard-summary">
                  {savedSections.sections.length
                    ? savedSections.source === "answers"
                      ? "Voici les réponses enregistrées lors de la dernière validation."
                      : "Voici le paramétrage écrit dans DBR à partir de tes réponses."
                    : "Aucune donnée enregistrée. Le questionnaire a été passé sans validation."}
                </p>
                {savedSections.sections.map((section) => (
                  <section
                    key={section.title}
                    className="onboard-review-section"
                  >
                    <h3>{section.title}</h3>
                    <ul className="onboard-review-list">
                      {section.lines.map((line, index) => (
                        <li
                          key={`${section.title}-${index}`}
                          className="onboard-recap-line"
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                <div className="onboard-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setOpen(false)}
                  >
                    Fermer
                  </button>
                  <button type="button" onClick={startChat}>
                    Reprendre le questionnaire
                  </button>
                </div>
              </div>
            ) : null}

            {phase !== "recap" ? (
            <div className="onboard-chat" ref={scrollerRef}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === "bot"
                      ? "onboard-bubble bot"
                      : "onboard-bubble user"
                  }
                >
                  {m.role === "bot" ? renderBotText(m.text) : m.text}
                </div>
              ))}
              {phase === "enriching" ? (
                <div className="onboard-bubble bot muted">Analyse en cours…</div>
              ) : null}
            </div>
            ) : null}

            {phase === "chat" && step ? (
              <form
                id={formId}
                className="onboard-composer"
                onSubmit={submitAnswer}
              >
                {step.multiline ? (
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={step.placeholder}
                    rows={3}
                    autoFocus
                  />
                ) : (
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={step.placeholder}
                    autoFocus
                  />
                )}
                <button
                  type="submit"
                  disabled={busy || (!input.trim() && !step.optional)}
                >
                  Envoyer
                </button>
              </form>
            ) : null}

            {phase === "review" && draft ? (
              <div className="onboard-review">
                <p className="onboard-summary">{draft.summary}</p>
                <label className="onboard-field">
                  Nom entreprise
                  <input
                    type="text"
                    value={draft.orgName}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, orgName: e.target.value } : d,
                      )
                    }
                  />
                </label>
                <label className="onboard-field">
                  Description / activité
                  <textarea
                    rows={3}
                    value={draft.orgDescription}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, orgDescription: e.target.value } : d,
                      )
                    }
                  />
                </label>

                <DraftSection
                  title="USP / Pourquoi nous"
                  items={draft.usps}
                  onToggle={(i) => toggleDraftItem("usps", i)}
                />
                <DraftSection
                  title="Produits / prestations"
                  items={draft.solutions}
                  labelOf={(item) =>
                    "name" in item &&
                    typeof (item as { name?: string }).name === "string"
                      ? (item as { name: string }).name
                      : item.label
                  }
                  onToggle={(i) => toggleDraftItem("solutions", i)}
                />
                <DraftSection
                  title="Secteurs"
                  items={draft.sectors}
                  onToggle={(i) => toggleDraftItem("sectors", i)}
                />
                <DraftSection
                  title="Personae"
                  items={draft.personae}
                  onToggle={(i) => toggleDraftItem("personae", i)}
                />
                <DraftSection
                  title="Concurrents"
                  items={draft.competitors}
                  onToggle={(i) => toggleDraftItem("competitors", i)}
                />
                <DraftSection
                  title="Pourquoi maintenant — événements"
                  hint="Compelling events"
                  items={draft.compellingEvents}
                  onToggle={(i) => toggleDraftItem("compellingEvents", i)}
                />
                <DraftSection
                  title="Pourquoi — problèmes projet"
                  items={draft.projectProblems}
                  labelOf={(item) => {
                    const p = item as OnboardingDraft["projectProblems"][number];
                    return `${p.familyLabel} · ${p.label}`;
                  }}
                  onToggle={(i) => toggleDraftItem("projectProblems", i)}
                />
                <DraftSection
                  title="Pourquoi — leviers projet"
                  items={draft.projectLevers}
                  labelOf={(item) => {
                    const p = item as OnboardingDraft["projectLevers"][number];
                    return `${p.familyLabel} · ${p.label}`;
                  }}
                  onToggle={(i) => toggleDraftItem("projectLevers", i)}
                />
                <DraftSection
                  title="Motivations personnelles"
                  items={draft.personalMotivations}
                  labelOf={(item) => {
                    const p =
                      item as OnboardingDraft["personalMotivations"][number];
                    return `${p.label} (${p.polarity === "advance" ? "avancer" : "freiner"})`;
                  }}
                  onToggle={(i) => toggleDraftItem("personalMotivations", i)}
                />
                <DraftSection
                  title="Coût d’inaction"
                  items={draft.inactionLevers}
                  labelOf={(item) => {
                    const p = item as OnboardingDraft["inactionLevers"][number];
                    return `${p.label} [${p.valueKind}]`;
                  }}
                  onToggle={(i) => toggleDraftItem("inactionLevers", i)}
                />

                <div className="onboard-actions">
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => void skipOnboarding()}
                  >
                    {forceModal ? "Ne rien appliquer" : "Annuler"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void applyDraft()}
                  >
                    Valider et appliquer
                  </button>
                </div>
              </div>
            ) : null}

            {phase === "done" ? (
              <div className="onboard-actions">
                <button type="button" onClick={() => setOpen(false)}>
                  Continuer dans DBR
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
