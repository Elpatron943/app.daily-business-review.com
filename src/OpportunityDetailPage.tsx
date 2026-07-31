import { useEffect, useMemo, useState } from "react";
import { formatEur } from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import OpportunityProcessPanel from "./OpportunityProcessPanel";
import OpportunityMappingPanel from "./OpportunityMappingPanel";
import OpportunityStakeholdersPanel from "./OpportunityStakeholdersPanel";
import OpportunityRecommendPanel from "./OpportunityRecommendPanel";
import GenerateActionPlanPanel from "./GenerateActionPlanPanel";
import OpportunityAiScriptPanel from "./research/OpportunityAiScriptPanel";
import { useAuth } from "./auth/AuthContext";
import { isModuleEnabled } from "./billing/optionalModules";
import {
  computeBusinessOutcomes,
  defaultOpportunityVariables,
  useOpportunities,
  type Opportunity,
  type OpportunityKind,
} from "./opportunities/OpportunityContext";
import { computeProcessProgress } from "./opportunities/salesProcess";
import { computeMappingScorecard, mappingWeightsFromSubtypes } from "./opportunities/mappingScore";
import { computeDealScore } from "./opportunities/dealScore";
import OpportunityCatalogueFields from "./catalogue/OpportunityCatalogueFields";
import { summarizeCatalogue } from "./catalogue/formatCatalogue";
import {
  useAccountPlans,
  type AccountPlan,
} from "./accountPlans/AccountPlanContext";
import { useConfirm } from "./ui/ConfirmDialog";
import type { AiScriptKind } from "./research/buildAiScriptContext";

function showsDealVariables(kind: OpportunityKind) {
  return kind === "up";
}

type Tab =
  | "fiche"
  | "mapping"
  | "process"
  | "outcomes"
  | "contacts"
  | "recos"
  | "plans"
  | "scripts";

type Props = {
  opportunityId: string;
  onBack: () => void;
  /** Libellé du lien retour (ex. entreprise d’origine). */
  backLabel?: string;
};

export default function OpportunityDetailPage({
  opportunityId,
  onBack,
  backLabel = "← Retour aux opportunités",
}: Props) {
  const {
    opportunities,
    updateOpportunity,
    removeOpportunity,
    setBusinessOutcomeValue,
    setProcessAnswer,
  } = useOpportunities();
  const askConfirm = useConfirm();
  const { organization } = useAuth();
  const { activeAccounts } = useDomain();
  const showPhoneScript = isModuleEnabled(
    organization?.optional_modules,
    "ai_phone_script",
  );
  const showEmailScript = isModuleEnabled(
    organization?.optional_modules,
    "ai_email_script",
  );
  const {
    activeBoFields,
    activeBoCategories,
    activeSolutions,
    activeOppVariables,
    activeProcessDomains,
    config,
    kindLabel,
    phaseLabel,
    kpiClassifier,
  } = useOrgConfig();

  const opportunity =
    opportunities.find((o) => o.id === opportunityId) ?? null;
  const [tab, setTab] = useState<Tab>(() => {
    const pending = sessionStorage.getItem("powermap.openOppTab");
    if (
      pending === "fiche" ||
      pending === "mapping" ||
      pending === "process" ||
      pending === "outcomes" ||
      pending === "contacts" ||
      pending === "recos" ||
      pending === "plans" ||
      pending === "scripts"
    ) {
      sessionStorage.removeItem("powermap.openOppTab");
      return pending;
    }
    return "fiche";
  });
  const [scriptTab, setScriptTab] = useState<AiScriptKind>(
    showPhoneScript ? "phone" : "email",
  );

  useEffect(() => {
    if (tab === "scripts" && !showPhoneScript && !showEmailScript) {
      setTab("fiche");
    }
  }, [tab, showPhoneScript, showEmailScript]);

  useEffect(() => {
    if (scriptTab === "phone" && !showPhoneScript && showEmailScript) {
      setScriptTab("email");
    }
    if (scriptTab === "email" && !showEmailScript && showPhoneScript) {
      setScriptTab("phone");
    }
  }, [scriptTab, showPhoneScript, showEmailScript]);

  const entreprises = activeAccounts.filter((a) => a.type === "Entreprise");
  const holdings = activeAccounts.filter((a) => a.type === "Holding");
  const account = opportunity
    ? (activeAccounts.find((a) => a.id === opportunity.primaryAccountId) ??
      null)
    : null;

  const results = useMemo(() => {
    if (!opportunity) return null;
    return computeBusinessOutcomes(
      opportunity.businessOutcomes,
      config.boFields,
    );
  }, [opportunity, config.boFields]);

  const proc = useMemo(() => {
    if (!opportunity) return null;
    return computeProcessProgress(
      activeProcessDomains,
      opportunity.processAnswers,
    );
  }, [opportunity, activeProcessDomains]);

  const mappingScore = useMemo(() => {
    const weights = mappingWeightsFromSubtypes(config.oppMappingSubtypes ?? []);
    return computeMappingScorecard(opportunity?.mappingChecks, weights);
  }, [opportunity?.mappingChecks, config.oppMappingSubtypes]);

  const mappingAxisPct =
    mappingScore.masteryPct !== null
      ? mappingScore.masteryPct
      : mappingScore.total > 0
        ? Math.round((mappingScore.covered / mappingScore.total) * 100)
        : 0;
  const dealScore = computeDealScore(proc?.overallPct ?? 0, mappingAxisPct);

  const stakeCount = opportunity?.stakeholders?.length ?? 0;
  const ceCount = opportunity?.compellingEventIds?.length ?? 0;
  const hasAiReview = Boolean(opportunity?.aiRecommendations?.content);

  const catalogueSummary = useMemo(
    () =>
      opportunity
        ? summarizeCatalogue(opportunity, activeSolutions)
        : null,
    [opportunity, activeSolutions],
  );

  const readiness = useMemo(() => {
    const items = [
      {
        id: "deal" as const,
        label: "Score deal",
        ok: dealScore >= 35,
        value: `${dealScore}%`,
        tab: "fiche" as Tab,
      },
      {
        id: "process" as const,
        label: "Process",
        ok: (proc?.overallPct ?? 0) >= 35,
        value: `${proc?.overallPct ?? 0}%`,
        tab: "process" as Tab,
      },
      {
        id: "mapping" as const,
        label: "Mapping",
        ok:
          mappingScore.total > 0 &&
          (mappingScore.masteryPct === null
            ? false
            : mappingScore.masteryPct >= 30),
        value:
          mappingScore.masteryPct === null
            ? "—"
            : `${mappingScore.masteryPct}%`,
        tab: "mapping" as Tab,
      },
      {
        id: "contacts" as const,
        label: "Contacts",
        ok: stakeCount > 0,
        value: String(stakeCount),
        tab: "contacts" as Tab,
      },
      {
        id: "ce" as const,
        label: "Compelling Event",
        ok: ceCount > 0,
        value: ceCount > 0 ? String(ceCount) : "—",
        tab: "fiche" as Tab,
      },
    ];
    return {
      items,
      readyCount: items.filter((i) => i.ok).length,
      total: items.length,
    };
  }, [proc?.overallPct, mappingScore, stakeCount, ceCount, dealScore]);

  if (!opportunity) {
    return (
      <div className="data-page opportunity-detail-page">
        <header className="data-page-head">
          <div>
            <button type="button" className="ghost back-link" onClick={onBack}>
              {backLabel}
            </button>
            <h1>Opportunité introuvable</h1>
          </div>
        </header>
      </div>
    );
  }

  function onUpdate(patch: Partial<Opportunity>) {
    updateOpportunity(opportunity!.id, patch);
  }

  return (
    <div className="data-page opportunity-detail-page">
      <header className="data-page-head opp-detail-head">
        <div>
          <button type="button" className="ghost back-link" onClick={onBack}>
            {backLabel}
          </button>
          <h1>{opportunity.name}</h1>
          <div className="opp-detail-meta" aria-label="Métadonnées">
            <span
              className="opp-chip accent"
              title="Score deal (√ Process × Mapping)"
            >
              Score {dealScore}%
            </span>
            <span className="opp-chip">{kindLabel(opportunity.kind)}</span>
            <span className="opp-chip accent">
              {formatEur(opportunity.amount)}
            </span>
            <span className="opp-chip">{phaseLabel(opportunity.phase)}</span>
            {kpiClassifier.isWhitespacePhase(opportunity.phase) ? (
              <span className="opp-chip warn">À qualifier</span>
            ) : null}
            {account ? (
              <span className="opp-chip muted-chip">{account.name}</span>
            ) : null}
            {!opportunity.active ? (
              <span className="opp-chip warn">Désactivée</span>
            ) : null}
          </div>
        </div>
        <div className="account-detail-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => setTab("recos")}
          >
            {hasAiReview ? "Voir l’analyse IA" : "Analyser avec l’IA"}
          </button>
          <button
            type="button"
            className="ghost danger-text"
            onClick={() => {
              void (async () => {
                const ok = await askConfirm({
                  title: "Désactiver l’opportunité",
                  message: `Désactiver « ${opportunity.name} » ?`,
                  confirmLabel: "Désactiver",
                  cancelLabel: "Annuler",
                  danger: true,
                });
                if (!ok) return;
                removeOpportunity(opportunity.id);
                onBack();
              })();
            }}
          >
            Désactiver
          </button>
        </div>
      </header>

      <section className="opp-readiness" aria-label="Préparation du deal">
        <div className="opp-readiness-main">
          <div className="opp-readiness-title">
            <h2>Préparation du deal</h2>
            <p className="muted">
              {readiness.readyCount}/{readiness.total} socles prêts — renseigne
              process, mapping, contacts et compelling event avant l’avis IA.
            </p>
          </div>
          <ul className="opp-readiness-items">
            {readiness.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={item.ok ? "is-ready" : "is-gap"}
                  onClick={() => setTab(item.tab)}
                >
                  <span className="opp-readiness-dot" aria-hidden />
                  <span className="opp-readiness-label">{item.label}</span>
                  <strong>{item.value}</strong>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="opp-readiness-aside">
          <article>
            <span>Valeur nette BO</span>
            <strong>{formatEur(results?.netValue ?? 0)}</strong>
          </article>
          <article>
            <span>Catalogue</span>
            <strong title={catalogueSummary?.short}>
              {catalogueSummary?.solutionName || "—"}
            </strong>
          </article>
          <button
            type="button"
            className="primary-cta opp-readiness-cta"
            onClick={() => setTab("recos")}
          >
            {hasAiReview ? "Relancer l’analyse" : "Analyse d’ensemble IA"}
          </button>
        </div>
      </section>

      <section className="opp-global-scores" aria-label="Scores détaillés">
        <button
          type="button"
          className={`opp-global-card deal tone-${
            dealScore >= 70 ? "ok" : dealScore >= 35 ? "warn" : "risk"
          }`}
          onClick={() => setTab("fiche")}
          title="√ Process × Mapping"
        >
          <header>
            <span>Score deal</span>
            <strong>{dealScore}%</strong>
          </header>
          <div
            className="opp-global-bar"
            role="img"
            aria-label={`Score deal ${dealScore}%`}
          >
            <i style={{ width: `${dealScore}%` }} />
          </div>
          <p className="muted opp-global-deal-hint">
            Croisement Process ({proc?.overallPct ?? 0}%) × Mapping (
            {mappingScore.masteryPct === null
              ? "—"
              : `${mappingScore.masteryPct}%`}
            )
          </p>
        </button>
        <button
          type="button"
          className={`opp-global-card process tone-${
            (proc?.overallPct ?? 0) >= 70
              ? "ok"
              : (proc?.overallPct ?? 0) >= 35
                ? "warn"
                : "risk"
          }`}
          onClick={() => setTab("process")}
        >
          <header>
            <span>Score Process</span>
            <strong>{proc?.overallPct ?? 0}%</strong>
          </header>
          <div
            className="opp-global-bar"
            role="img"
            aria-label={`Process ${proc?.overallPct ?? 0}%`}
          >
            <i style={{ width: `${proc?.overallPct ?? 0}%` }} />
          </div>
          {proc && proc.domains.length > 0 ? (
            <ul className="opp-global-domains">
              {proc.domains.map((d) => {
                const domain = activeProcessDomains.find(
                  (x) => x.id === d.domainId,
                );
                return (
                  <li key={d.domainId}>
                    <span>{domain?.label ?? d.domainId}</span>
                    <em
                      className={
                        d.pct >= 70 ? "ok" : d.pct >= 35 ? "warn" : "risk"
                      }
                    >
                      {d.pct}%
                    </em>
                    <div className="opp-global-mini-bar" aria-hidden>
                      <i
                        className={
                          d.pct >= 70 ? "ok" : d.pct >= 35 ? "warn" : "risk"
                        }
                        style={{ width: `${d.pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">Aucun domaine process actif</p>
          )}
          <span className="opp-global-cta">Ouvrir le Process →</span>
        </button>

        <button
          type="button"
          className={`opp-global-card mapping tone-${
            mappingScore.masteryPct === null
              ? "neutral"
              : mappingScore.masteryPct >= 60
                ? "ok"
                : "risk"
          }`}
          onClick={() => setTab("mapping")}
        >
          <header>
            <span>Opportunity Mapping</span>
            <strong>
              {mappingScore.masteryPct === null
                ? "—"
                : `${mappingScore.masteryPct}%`}
            </strong>
          </header>
          <p className="opp-global-mapping-meta">
            {mappingScore.total} carte
            {mappingScore.total !== 1 ? "s" : ""}
            <span className="ok"> · {mappingScore.covered} ✓</span>
            <span className="ko"> · {mappingScore.notMastered} ✗</span>
            <span className="open"> · {mappingScore.open} ○</span>
          </p>
          <ul className="opp-global-swot" aria-label="Carto SWOT">
            {mappingScore.quads.map((q) => {
              const coveredW =
                q.total > 0 ? (q.covered / q.total) * 100 : 0;
              const gapW =
                q.total > 0 ? (q.notMastered / q.total) * 100 : 0;
              const openW = q.total > 0 ? (q.open / q.total) * 100 : 0;
              return (
                <li
                  key={q.catId}
                  className={`swot-${q.swot.toLowerCase()}`}
                >
                  <div className="opp-global-swot-head">
                    <span className="letter" aria-hidden>
                      {q.swot}
                    </span>
                    <strong>{q.label}</strong>
                    <em>
                      {q.masteryPct === null ? "—" : `${q.masteryPct}%`}
                    </em>
                  </div>
                  <div className="opp-global-swot-bar" aria-hidden>
                    {q.total === 0 ? (
                      <span className="empty" />
                    ) : (
                      <>
                        <span
                          className="ok"
                          style={{ width: `${coveredW}%` }}
                        />
                        <span
                          className="ko"
                          style={{ width: `${gapW}%` }}
                        />
                        <span
                          className="open"
                          style={{ width: `${openW}%` }}
                        />
                      </>
                    )}
                  </div>
                  <span className="opp-global-swot-count">
                    {q.total} · {q.covered}✓ {q.notMastered}✗ {q.open}○
                  </span>
                </li>
              );
            })}
          </ul>
          <span className="opp-global-cta">Ouvrir le Mapping →</span>
        </button>
      </section>

      <nav className="opp-nav" aria-label="Sections opportunité">
        <div className="opp-nav-group" role="group" aria-label="Contexte">
          <span className="opp-nav-label">Contexte</span>
          <div className="opp-nav-tabs">
            <button
              type="button"
              className={tab === "fiche" ? "active" : ""}
              onClick={() => setTab("fiche")}
            >
              Fiche
            </button>
          </div>
        </div>
        <div className="opp-nav-group" role="group" aria-label="Qualification">
          <span className="opp-nav-label">Qualification</span>
          <div className="opp-nav-tabs">
            <button
              type="button"
              className={tab === "process" ? "active" : ""}
              onClick={() => setTab("process")}
            >
              Process
            </button>
            <button
              type="button"
              className={tab === "mapping" ? "active" : ""}
              onClick={() => setTab("mapping")}
            >
              Mapping
              {mappingScore.total > 0 ? ` · ${mappingScore.total}` : ""}
            </button>
            <button
              type="button"
              className={tab === "contacts" ? "active" : ""}
              onClick={() => setTab("contacts")}
            >
              Contacts
              {stakeCount > 0 ? ` · ${stakeCount}` : ""}
            </button>
            <button
              type="button"
              className={tab === "outcomes" ? "active" : ""}
              onClick={() => setTab("outcomes")}
            >
              Outcomes
            </button>
          </div>
        </div>
        <div className="opp-nav-group" role="group" aria-label="Pilotage">
          <span className="opp-nav-label">Pilotage</span>
          <div className="opp-nav-tabs">
            <button
              type="button"
              className={tab === "recos" ? "active" : ""}
              onClick={() => setTab("recos")}
            >
              Analyse IA
              {hasAiReview ? " · ✓" : ""}
            </button>
            <button
              type="button"
              className={tab === "plans" ? "active" : ""}
              onClick={() => setTab("plans")}
            >
              Plan d’actions
            </button>
            {(showPhoneScript || showEmailScript) && (
              <button
                type="button"
                className={tab === "scripts" ? "active" : ""}
                onClick={() => setTab("scripts")}
              >
                Scripts
              </button>
            )}
          </div>
        </div>
      </nav>

      {tab === "fiche" && (
        <OpportunityFicheTab
          opportunity={opportunity}
          entreprises={entreprises}
          holdings={holdings}
          solutions={activeSolutions}
          variables={activeOppVariables}
          onUpdate={onUpdate}
        />
      )}

      {tab === "contacts" && (
        <OpportunityStakeholdersPanel
          opportunity={opportunity}
          onUpdate={onUpdate}
        />
      )}

      {tab === "mapping" && (
        <OpportunityMappingPanel
          opportunity={opportunity}
          onUpdate={onUpdate}
        />
      )}

      {tab === "process" && (
        <OpportunityProcessPanel
          opportunity={opportunity}
          onAnswer={(questionId, patch) =>
            setProcessAnswer(opportunity.id, questionId, patch)
          }
          onUpdate={onUpdate}
        />
      )}

      {tab === "outcomes" && (
        <OpportunityOutcomesTab
          opportunity={opportunity}
          fields={activeBoFields}
          categories={activeBoCategories}
          allFields={config.boFields}
          onFieldValue={(fieldId, value) =>
            setBusinessOutcomeValue(opportunity.id, fieldId, value)
          }
        />
      )}

      {tab === "recos" && <OpportunityRecommendPanel opportunity={opportunity} />}

      {tab === "plans" && <OpportunityActionPlanGen opportunity={opportunity} />}

      {tab === "scripts" && (showPhoneScript || showEmailScript) && (
        <section className="entry-subsection">
          <h2>Scripts IA</h2>
          <nav className="plan-tabs" aria-label="Type de script">
            {showPhoneScript && (
              <button
                type="button"
                className={scriptTab === "phone" ? "active" : ""}
                onClick={() => setScriptTab("phone")}
              >
                Téléphone
              </button>
            )}
            {showEmailScript && (
              <button
                type="button"
                className={scriptTab === "email" ? "active" : ""}
                onClick={() => setScriptTab("email")}
              >
                E-mail
              </button>
            )}
          </nav>
          <OpportunityAiScriptPanel opportunity={opportunity} kind={scriptTab} />
        </section>
      )}
    </div>
  );
}

function OpportunityActionPlanGen({
  opportunity,
}: {
  opportunity: Opportunity;
}) {
  return (
    <section className="entry-subsection">
      <header className="opp-plan-section-head">
        <div>
          <h2>Plan d’actions</h2>
          <p className="muted">
            Actions rattachées à cette opportunité — manuelles ou générées par
            l’IA.
          </p>
        </div>
      </header>
      <GenerateActionPlanPanel opportunity={opportunity} />
    </section>
  );
}

function OpportunityFicheTab({
  opportunity,
  entreprises,
  holdings,
  solutions,
  variables,
  onUpdate,
}: {
  opportunity: Opportunity;
  entreprises: { id: string; name: string; holdingId?: string | null }[];
  holdings: { id: string; name: string }[];
  solutions: import("./config/types").SolutionDef[];
  variables: import("./config/types").OppVariableDef[];
  onUpdate: (patch: Partial<Opportunity>) => void;
}) {
  const {
    activePlans,
    getPlanForOpportunity,
    assignOpportunityToPlan,
  } = useAccountPlans();
  const { activeOpportunities: allOpps, setProcessAnswer } = useOpportunities();
  const { activeCompellingEvents, activeOppKinds, activeOppPhases, kindLabel, phaseLabel } =
    useOrgConfig();
  const { team, canAssignOwner } = useAuth();

  const holdingName = (id: string | null | undefined) =>
    holdings.find((h) => h.id === id)?.name ?? "";

  const linkedPlan = getPlanForOpportunity(opportunity.id);

  const plansForEntreprise = useMemo(() => {
    const accountId = opportunity.primaryAccountId;
    if (!accountId) return [];
    return activePlans
      .filter((p) => p.accountId === accountId)
      .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  }, [activePlans, opportunity.primaryAccountId]);

  function planLabel(plan: AccountPlan): string {
    const names = plan.opportunityIds
      .map((id) => allOpps.find((o) => o.id === id)?.name)
      .filter(Boolean) as string[];
    const head =
      names.length === 0
        ? "Plan"
        : names.length === 1
          ? names[0]
          : `${names[0]} +${names.length - 1}`;
    return `${head} · échéance ${plan.dueDate || "—"}`;
  }

  function assignAccountPlan(value: string) {
    if (value === "") {
      assignOpportunityToPlan(opportunity.id, null);
      return;
    }
    if (value === "__new__") {
      if (!opportunity.primaryAccountId) return;
      assignOpportunityToPlan(opportunity.id, "new", {
        accountId: opportunity.primaryAccountId,
        dueDate: opportunity.closeDate || undefined,
      });
      return;
    }
    assignOpportunityToPlan(opportunity.id, value, {
      accountId: opportunity.primaryAccountId,
    });
  }

  return (
    <>
      <section className="entry-subsection account-detail-fiche">
        <h2>Fiche</h2>
        <div className="data-form-grid">
          <label>
            Nom
            <input
              value={opportunity.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
            />
          </label>
          <label>
            Montant deal (€)
            <input
              type="number"
              min={0}
              step={1000}
              value={opportunity.amount}
              onChange={(e) =>
                onUpdate({ amount: Number(e.target.value) || 0 })
              }
            />
          </label>
          <label>
            Date de close
            <input
              type="date"
              value={opportunity.closeDate}
              onChange={(e) => onUpdate({ closeDate: e.target.value })}
            />
          </label>
          <label>
            Type
            <select
              value={opportunity.kind}
              onChange={(e) => {
                const kind = e.target.value as OpportunityKind;
                const patch: Partial<Opportunity> = { kind };
                if (
                  showsDealVariables(kind) &&
                  !Object.keys(opportunity.variables ?? {}).length
                ) {
                  patch.variables = defaultOpportunityVariables(variables);
                }
                onUpdate(patch);
              }}
            >
              {activeOppKinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {kindLabel(k.id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Phase
            <select
              value={opportunity.phase}
              onChange={(e) => onUpdate({ phase: e.target.value })}
            >
              {activeOppPhases.map((p) => (
                <option key={p.id} value={p.id}>
                  {phaseLabel(p.id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Owner
            <select
              value={opportunity.ownerProfileId ?? ""}
              disabled={!canAssignOwner}
              onChange={(e) =>
                onUpdate({ ownerProfileId: e.target.value || null })
              }
            >
              <option value="">— Non rattaché —</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name ? `${m.full_name} (${m.email})` : m.email}
                </option>
              ))}
              {opportunity.ownerProfileId &&
                !team.some((m) => m.id === opportunity.ownerProfileId) && (
                  <option value={opportunity.ownerProfileId}>
                    User inconnu / hors équipe
                  </option>
                )}
            </select>
          </label>
          <label>
            Entreprise
            <select
              value={opportunity.primaryAccountId}
              onChange={(e) => {
                const nextAccountId = e.target.value;
                if (
                  linkedPlan &&
                  linkedPlan.accountId &&
                  linkedPlan.accountId !== nextAccountId
                ) {
                  assignOpportunityToPlan(opportunity.id, null);
                }
                onUpdate({ primaryAccountId: nextAccountId });
              }}
            >
              {entreprises.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.holdingId ? ` · ${holdingName(a.holdingId)}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Account plan
            <select
              value={linkedPlan?.id ?? ""}
              disabled={!opportunity.primaryAccountId}
              onChange={(e) => assignAccountPlan(e.target.value)}
            >
              <option value="">— Aucun —</option>
              {plansForEntreprise.map((p) => (
                <option key={p.id} value={p.id}>
                  {planLabel(p)}
                </option>
              ))}
              <option value="__new__">＋ Créer un nouveau plan…</option>
            </select>
          </label>
        </div>
      </section>

      <OpportunityCatalogueFields
        opportunity={opportunity}
        solutions={solutions}
        compellingEvents={activeCompellingEvents}
        onUpdate={onUpdate}
        onCompellingEventsChange={(ids) => {
          if (ids.length === 0) return;
          const current =
            opportunity.processAnswers?.["q-tq-ce"]?.status;
          if (current === "Yes") return;
          setProcessAnswer(opportunity.id, "q-tq-ce", {
            status: "Yes",
            note:
              opportunity.processAnswers?.["q-tq-ce"]?.note ||
              `${ids.length} Compelling Event${ids.length > 1 ? "s" : ""} sélectionné${ids.length > 1 ? "s" : ""} sur la fiche.`,
          });
        }}
      />

      {showsDealVariables(opportunity.kind) && variables.length > 0 && (
        <section className="opp-variables" aria-label="Variables upsell">
          <h3>Variables upsell</h3>
          <div className="data-form-grid">
            {variables.map((v) => {
              const raw = opportunity.variables?.[v.id];
              if (v.kind === "boolean") {
                return (
                  <label key={v.id} className="opp-var-check">
                    <span>{v.label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(raw)}
                      onChange={(e) =>
                        onUpdate({
                          variables: {
                            ...opportunity.variables,
                            [v.id]: e.target.checked,
                          },
                        })
                      }
                    />
                  </label>
                );
              }
              if (v.kind === "number") {
                return (
                  <label key={v.id}>
                    {v.label}
                    <input
                      type="number"
                      value={typeof raw === "number" ? raw : Number(raw) || 0}
                      onChange={(e) =>
                        onUpdate({
                          variables: {
                            ...opportunity.variables,
                            [v.id]: Number(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  </label>
                );
              }
              return (
                <label key={v.id}>
                  {v.label}
                  <input
                    type="text"
                    value={raw == null ? "" : String(raw)}
                    onChange={(e) =>
                      onUpdate({
                        variables: {
                          ...opportunity.variables,
                          [v.id]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

function OpportunityOutcomesTab({
  opportunity,
  fields,
  categories,
  allFields,
  onFieldValue,
}: {
  opportunity: Opportunity;
  fields: import("./config/types").BoFieldDef[];
  categories: import("./config/types").BoCategoryDef[];
  allFields: import("./config/types").BoFieldDef[];
  onFieldValue: (fieldId: string, value: number) => void;
}) {
  const results = useMemo(
    () => computeBusinessOutcomes(opportunity.businessOutcomes, allFields),
    [opportunity.businessOutcomes, allFields],
  );

  const grouped = useMemo(() => {
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const groups: {
      id: string;
      label: string;
      fields: typeof fields;
    }[] = [];
    const byCat = new Map<string, typeof fields>();
    const orphan: typeof fields = [];
    for (const f of fields) {
      if (f.categoryId && catMap.has(f.categoryId)) {
        const list = byCat.get(f.categoryId) ?? [];
        list.push(f);
        byCat.set(f.categoryId, list);
      } else {
        orphan.push(f);
      }
    }
    for (const c of categories) {
      const list = byCat.get(c.id);
      if (list?.length) {
        groups.push({ id: c.id, label: c.label, fields: list });
      }
    }
    if (orphan.length) {
      groups.push({ id: "_other", label: "Autres", fields: orphan });
    }
    return groups;
  }, [fields, categories]);

  return (
    <section className="bo-calculator" aria-label="Business outcomes">
      <h3>Calculateur Business Outcomes</h3>

      {fields.length === 0 ? (
        <p className="muted">Aucun champ actif.</p>
      ) : (
        grouped.map((g) => (
          <div key={g.id} className="bo-category-block">
            <h4>{g.label}</h4>
            <div className="data-form-grid">
              {g.fields.map((f) => (
                <label key={f.id}>
                  {f.label}
                  <input
                    type="number"
                    min={f.kind === "horizon" ? 1 : 0}
                    max={f.kind === "horizon" ? 20 : undefined}
                    value={
                      opportunity.businessOutcomes[f.id] ??
                      f.defaultValue ??
                      0
                    }
                    onChange={(e) =>
                      onFieldValue(
                        f.id,
                        f.kind === "horizon"
                          ? Math.max(1, Number(e.target.value) || 1)
                          : Number(e.target.value) || 0,
                      )
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        ))
      )}

      <div className="bo-results">
        <article>
          <span>Économies / an</span>
          <strong>{formatEur(results.annualSavings)}</strong>
        </article>
        <article>
          <span>Bénéfice annuel</span>
          <strong>{formatEur(results.annualBenefit)}</strong>
        </article>
        <article>
          <span>Bénéfice × {results.horizonYears} ans</span>
          <strong>{formatEur(results.totalBenefit)}</strong>
        </article>
        <article className={results.netValue >= 0 ? "positive" : "negative"}>
          <span>Valeur nette</span>
          <strong>{formatEur(results.netValue)}</strong>
        </article>
        <article>
          <span>ROI</span>
          <strong>
            {results.roiPct == null ? "—" : `${results.roiPct} %`}
          </strong>
        </article>
        <article>
          <span>Payback</span>
          <strong>
            {results.paybackMonths == null
              ? "—"
              : `${results.paybackMonths} mois`}
          </strong>
        </article>
      </div>
    </section>
  );
}
