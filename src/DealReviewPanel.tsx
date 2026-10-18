import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "./auth/AuthContext";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import {
  computeProcessProgress,
  funnelMidPhases,
} from "./opportunities/salesProcess";
import {
  computeMappingScorecard,
  mappingWeightsFromSubtypes,
} from "./opportunities/mappingScore";
import { buildDealReviewDiagnostic } from "./opportunities/buildDealReviewDiagnostic";
import {
  DEAL_REVIEW_SECTORS,
  avatarStyle,
  getDealReviewSector,
  getDealReviewSubSector,
  matchDealReviewSectorId,
  matchDealReviewSubSectorId,
  type DealReviewAgentAvatar,
} from "./opportunities/dealReviewSectors";
import {
  useOpportunities,
  type Opportunity,
} from "./opportunities/OpportunityContext";
import MeetingSimulator from "./opportunities/MeetingSimulator";
import { getBlockerFactor } from "./opportunities/blockerFactors";
import {
  SELLER_PROFILES,
  clientModelIdFromDealReviewSector,
  clientSizeFromAccountSize,
} from "./opportunities/sectorModels";
import { supabase } from "./supabase/client";
import DealBlockersPanel from "./DealBlockersPanel";
import { resolveAccountSector } from "./SameSectorPanel";

type ChatMsg = {
  role: "assistant" | "user";
  text: string;
  topic?: string;
  facteurs?: string[];
};

type ChatMode = "review" | "simulation";

const SELLER_PROFILE_KEY = "dbr.sellerProfileId";

function readSellerProfile(): string {
  try {
    return window.localStorage.getItem(SELLER_PROFILE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeSellerProfile(id: string) {
  try {
    if (id) window.localStorage.setItem(SELLER_PROFILE_KEY, id);
    else window.localStorage.removeItem(SELLER_PROFILE_KEY);
  } catch {
    /* stockage indisponible : le choix vaut pour la session */
  }
}

type ProposedUpdate = {
  type: string;
  target: string;
  value: string;
};

type Props = {
  opportunity: Opportunity;
  /** Sans blockers ni FAB fixe (hub Sales / panneau parent). */
  embedded?: boolean;
};

async function postDealReview(body: unknown): Promise<{
  message: string;
  topic?: string;
  proposed_updates?: ProposedUpdate[];
  done?: boolean;
  facteurs?: string[];
  diagnosticFindingsCount?: number;
}> {
  const session = supabase
    ? (await supabase.auth.getSession()).data.session
    : null;
  const token = session?.access_token;
  if (!token) throw new Error("Session expirée — reconnecte-toi.");

  const res = await fetch("/api/deal-review", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    topic?: string;
    proposed_updates?: ProposedUpdate[];
    done?: boolean;
    facteurs?: string[];
    diagnosticFindingsCount?: number;
  };
  if (!res.ok) {
    throw new Error(data.error || `Revue indisponible (${res.status})`);
  }
  if (!data.message?.trim()) throw new Error("Réponse IA vide");
  return {
    message: data.message.trim(),
    topic: data.topic,
    proposed_updates: data.proposed_updates,
    done: data.done,
    facteurs: data.facteurs,
    diagnosticFindingsCount: data.diagnosticFindingsCount,
  };
}

export default function DealReviewPanel({
  opportunity,
  embedded = false,
}: Props) {
  const { profile, organization, billing } = useAuth();
  const { activeContacts, activeAccounts } = useDomain();
  const {
    activeProcessDomains,
    activeOppPhases,
    config,
  } = useOrgConfig();
  const { updateOpportunity, addAction } = useOpportunities();

  const [open, setOpen] = useState(embedded);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ProposedUpdate[]>([]);
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<ChatMode>("review");
  const [sellerProfileId, setSellerProfileId] = useState(readSellerProfile);
  const primaryAccount = useMemo(
    () => activeAccounts.find((a) => a.id === opportunity.primaryAccountId),
    [activeAccounts, opportunity.primaryAccountId],
  );
  const multiEntity = Boolean(
    primaryAccount?.holdingId || primaryAccount?.type === "Holding",
  );
  const accountSector = useMemo(() => {
    const acc = activeAccounts.find(
      (a) => a.id === opportunity.primaryAccountId,
    );
    return acc ? resolveAccountSector(acc, activeAccounts) : null;
  }, [activeAccounts, opportunity.primaryAccountId]);
  const [sectorId, setSectorId] = useState(
    () => matchDealReviewSectorId(accountSector) ?? "",
  );
  const [subSectorId, setSubSectorId] = useState(() => {
    const sid = matchDealReviewSectorId(accountSector);
    return matchDealReviewSubSectorId(sid, accountSector) ?? "";
  });
  const selectedSector = useMemo(
    () => getDealReviewSector(sectorId),
    [sectorId],
  );
  const selectedAgent = useMemo(
    () => getDealReviewSubSector(sectorId, subSectorId),
    [sectorId, subSectorId],
  );
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (started) return;
    const matched = matchDealReviewSectorId(accountSector);
    if (matched) {
      setSectorId(matched);
      setSubSectorId(matchDealReviewSubSectorId(matched, accountSector) ?? "");
    }
  }, [accountSector, started]);

  function onSellerProfileChange(next: string) {
    setSellerProfileId(next);
    writeSellerProfile(next);
  }

  function onSectorChange(next: string) {
    setSectorId(next);
    setSubSectorId("");
  }

  const firstName =
    profile?.full_name?.trim().split(/\s+/)[0] ||
    profile?.email?.split("@")[0] ||
    "toi";

  const diagnosticBundle = useMemo(() => {
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
    return buildDealReviewDiagnostic({
      opportunity,
      contacts: activeContacts.map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title,
        accountId: c.accountId,
      })),
      accounts: activeAccounts.map((a) => ({
        id: a.id,
        name: a.name,
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
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, proposals, open, busy]);

  async function startOrContinue(userText?: string) {
    if (busy) return;
    if (billing.subscriptionBlocked) {
      setError("Compte en lecture seule — revue IA indisponible.");
      setOpen(true);
      return;
    }
    if (sectorId && !subSectorId) {
      setError("Choisis un agent (sous-secteur) ou repasse en Générique.");
      setOpen(true);
      return;
    }
    setOpen(true);
    setBusy(true);
    setError(null);
    const history = [...messages];
    if (userText?.trim()) {
      history.push({ role: "user", text: userText.trim() });
      setMessages(history);
      setInput("");
    }
    try {
      const reply = await postDealReview({
        opportunityId: opportunity.id,
        orgName: organization?.name || "votre organisation",
        sellerFirstName: firstName,
        sectorId: sectorId || null,
        subSectorId: subSectorId || null,
        sellerProfileId: sellerProfileId || null,
        clientSectorId: clientModelIdFromDealReviewSector(sectorId, subSectorId),
        metierId: (() => {
          try {
            return window.localStorage.getItem("dbr.metierId") || null;
          } catch {
            return null;
          }
        })(),
        multiEntity,
        clientSize: clientSizeFromAccountSize(primaryAccount?.size),
        messages: history.map((m) => ({ role: m.role, content: m.text })),
        clientDiagnostic: diagnosticBundle.diagnostic,
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: reply.message,
          topic: reply.topic,
          facteurs: reply.facteurs,
        },
      ]);
      setProposals(reply.proposed_updates ?? []);
      setStarted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur revue");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    void startOrContinue(input);
  }

  function applyUpdate(u: ProposedUpdate) {
    if (u.type === "action") {
      addAction(opportunity.id, {
        title: u.value || u.target || "Action revue",
        status: "Todo",
      });
      setProposals((prev) => prev.filter((p) => p !== u));
      return;
    }
    if (u.type === "stakeholder_status") {
      const next = (opportunity.stakeholders ?? []).map((s) =>
        s.contactId === u.target || s.role === u.target
          ? {
              ...s,
              status:
                u.value === "Unknown" ||
                u.value === "Identified" ||
                u.value === "Engaged" ||
                u.value === "Aligned" ||
                u.value === "Opposed"
                  ? u.value
                  : s.status,
            }
          : s,
      );
      updateOpportunity(opportunity.id, { stakeholders: next });
      setProposals((prev) => prev.filter((p) => p !== u));
      return;
    }
    if (u.type === "note") {
      updateOpportunity(opportunity.id, {
        whyNow: {
          ...opportunity.whyNow,
          inactionNote: [
            opportunity.whyNow?.inactionNote?.trim(),
            u.value,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      });
      setProposals((prev) => prev.filter((p) => p !== u));
    }
  }

  function openLauncher() {
    setOpen(true);
    setError(null);
  }

  const panel =
    open || embedded ? (
      <section
        id="deal-review-chatbot"
        className={`deal-review-chatbot${embedded ? " is-embedded" : ""}`}
        role={embedded ? "region" : "dialog"}
        aria-label="Revue — directeur commercial digital"
      >
        <header className="deal-review-chatbot-head">
          <div className="deal-review-chatbot-identity">
            <AgentAvatarFace
              firstName={selectedAgent?.firstName}
              avatar={selectedAgent?.avatar}
              size="md"
            />
            <div>
              <p className="deal-review-chatbot-kicker">
                {mode === "simulation" ? "Rendez-vous simulé" : "Revue deal"}
              </p>
              <h3>{selectedAgent?.firstName ?? "Directeur commercial"}</h3>
              {selectedAgent ? (
                <p className="muted deal-review-chatbot-agent">
                  {selectedAgent.label}
                </p>
              ) : (
                <p className="muted deal-review-chatbot-agent">
                  {sectorId ? "Choisis un agent…" : "Mode générique"}
                </p>
              )}
            </div>
          </div>
          {!embedded ? (
            <button
              type="button"
              className="deal-review-chatbot-close"
              aria-label="Fermer le chat"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          ) : null}
        </header>

        <div
          className="deal-review-mode"
          role="tablist"
          aria-label="Mode du chatbot"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "review"}
            className={mode === "review" ? "is-active" : ""}
            disabled={busy}
            onClick={() => setMode("review")}
          >
            Revue du deal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "simulation"}
            className={mode === "simulation" ? "is-active" : ""}
            disabled={busy}
            onClick={() => setMode("simulation")}
          >
            S’entraîner
          </button>
        </div>

        {mode === "simulation" ? (
          <MeetingSimulator
            defaultClientSectorId={clientModelIdFromDealReviewSector(
              sectorId,
              subSectorId,
            )}
            defaultMultiEntity={multiEntity}
            defaultClientSize={clientSizeFromAccountSize(primaryAccount?.size)}
            sellerProfileId={sellerProfileId}
            onSellerProfileChange={onSellerProfileChange}
            disabled={billing.subscriptionBlocked}
          />
        ) : (
        <>
        <div className="deal-review-sector-row">
          <label className="deal-review-sector">
            <span>Ce que tu vends</span>
            <select
              value={sellerProfileId}
              disabled={busy}
              onChange={(e) => onSellerProfileChange(e.target.value)}
            >
              <option value="">Non précisé</option>
              {SELLER_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="deal-review-sector">
            <span>Secteur du client</span>
            <select
              value={sectorId}
              disabled={busy}
              onChange={(e) => onSectorChange(e.target.value)}
            >
              <option value="">Générique</option>
              {DEAL_REVIEW_SECTORS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {selectedSector ? (
            <label className="deal-review-sector">
              <span>Agent</span>
              <select
                value={subSectorId}
                disabled={busy}
                onChange={(e) => setSubSectorId(e.target.value)}
              >
                <option value="">Choisir…</option>
                {selectedSector.subSectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} — {s.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="deal-review-messages" ref={scrollerRef}>
          {messages.length === 0 && !busy ? (
            <p className="muted">
              Lance la revue pour challenger les constats du diagnostic. Rien
              n’est écrit sans ton « Appliquer ».
            </p>
          ) : null}
          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={
                m.role === "assistant"
                  ? "deal-review-msg bot"
                  : "deal-review-msg user"
              }
            >
              {m.role === "assistant" ? (
                <AgentAvatarFace
                  firstName={selectedAgent?.firstName}
                  avatar={selectedAgent?.avatar}
                  size="sm"
                />
              ) : null}
              <div
                className={
                  m.role === "assistant"
                    ? "deal-review-bubble bot"
                    : "deal-review-bubble user"
                }
              >
                {m.topic ? (
                  <span className="deal-review-topic">{m.topic}</span>
                ) : null}
                {m.text}
                {m.facteurs && m.facteurs.length > 0 ? (
                  <span className="deal-blockers-factors">
                    {m.facteurs.map((id) => (
                      <span key={id} className="deal-blockers-factor">
                        {getBlockerFactor(id)?.label ?? id}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          {busy ? (
            <div className="deal-review-msg bot">
              <AgentAvatarFace
                firstName={selectedAgent?.firstName}
                avatar={selectedAgent?.avatar}
                size="sm"
              />
              <div className="deal-review-bubble bot muted">Réflexion…</div>
            </div>
          ) : null}
        </div>

        {proposals.length > 0 ? (
          <div className="deal-review-proposals">
            <h4>Mises à jour proposées</h4>
            <ul>
              {proposals.map((u, i) => (
                <li key={`${u.type}-${i}`}>
                  <span>
                    <strong>{u.type}</strong> · {u.target} → {u.value}
                  </span>
                  <button type="button" onClick={() => applyUpdate(u)}>
                    Appliquer
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!started ? (
          <button
            type="button"
            className="deal-review-chatbot-start"
            disabled={busy || Boolean(sectorId && !subSectorId)}
            onClick={() => void startOrContinue()}
          >
            Lancer la revue
          </button>
        ) : (
          <form className="deal-review-composer" onSubmit={onSubmit}>
            <textarea
              rows={2}
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ta réponse…"
            />
            <button type="submit" disabled={busy || !input.trim()}>
              Envoyer
            </button>
          </form>
        )}
        </>
        )}
      </section>
    ) : null;

  if (embedded) {
    return <div className="deal-review-layout is-embedded">{panel}</div>;
  }

  return (
    <div className="deal-review-layout">
      <DealBlockersPanel
        opportunity={opportunity}
        onStartReview={
          started || busy
            ? () => setOpen(true)
            : () => void startOrContinue()
        }
      />

      <div className="deal-review-fab-root">
        {panel}
        <button
          type="button"
          className={`deal-review-fab${open ? " is-open" : ""}${started ? " has-chat" : ""}`}
          aria-expanded={open}
          aria-controls="deal-review-chatbot"
          onClick={() => (open ? setOpen(false) : openLauncher())}
        >
          {!open ? (
            <AgentAvatarFace
              firstName={selectedAgent?.firstName}
              avatar={selectedAgent?.avatar}
              size="sm"
            />
          ) : null}
          <span className="deal-review-fab-label">
            {open
              ? "Fermer"
              : selectedAgent
                ? selectedAgent.firstName
                : "Directeur commercial"}
          </span>
        </button>
      </div>
    </div>
  );
}

function AgentAvatarFace({
  firstName,
  avatar,
  size = "md",
}: {
  firstName?: string;
  avatar?: DealReviewAgentAvatar;
  size?: "sm" | "md";
}) {
  const style = avatar
    ? avatarStyle(avatar)
    : { background: "hsl(174 35% 32%)", color: "#fff" };
  const initials = avatar?.initials ?? (firstName ? firstName.slice(0, 1) : "DC");
  return (
    <span
      className={`deal-review-avatar size-${size}`}
      style={style}
      aria-hidden
      title={firstName || "Directeur commercial"}
    >
      {initials}
    </span>
  );
}
