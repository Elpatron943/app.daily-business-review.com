import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useOrgConfig } from "../config/ConfigContext";
import { useDomain } from "../domain/DomainContext";
import { hubspotFetch, type HubspotStatus } from "../integrations/HubspotConnectorPanel";
import {
  DEPLOY_PHASE_LABEL,
  DEPLOY_STEPS,
  evaluateDeployment,
  loadReviewedSteps,
  saveReviewedSteps,
  type DeployPhaseId,
  type DeployTargetTab,
} from "./deploymentGuide";
import type { SettingsAreaId } from "./settingsNav";

type Props = {
  onGoToTab: (tab: SettingsAreaId) => void;
  onOpenTeam?: () => void;
};

const PHASE_ORDER: DeployPhaseId[] = ["identite", "vente", "lancer"];

export default function DeploymentGuidePanel({ onGoToTab, onOpenTeam }: Props) {
  const { config } = useOrgConfig();
  const { accounts } = useDomain();
  const { team } = useAuth();
  const [reviewed, setReviewed] = useState(() => loadReviewedSteps());
  const [hubspotConnected, setHubspotConnected] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await hubspotFetch<HubspotStatus>("/status");
      if (cancelled) return;
      if (!data) {
        setHubspotConnected(null);
        return;
      }
      setHubspotConnected(data.status === "connected");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const progress = useMemo(
    () =>
      evaluateDeployment(
        {
          config,
          accountCount: accounts.length,
          teamCount: team.length,
          hubspotConnected,
        },
        reviewed,
      ),
    [config, accounts.length, team.length, hubspotConnected, reviewed],
  );

  const toggleReviewed = (id: string) => {
    setReviewed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveReviewedSteps(next);
      return next;
    });
  };

  const go = (tab: DeployTargetTab) => {
    if (tab === "team" || tab === "org-team") {
      onOpenTeam?.();
      return;
    }
    onGoToTab(tab);
  };

  const pct = Math.round(
    (progress.requiredDone / Math.max(1, progress.requiredTotal)) * 100,
  );

  return (
    <div className="deploy-guide">
      <section className="deploy-guide-hero">
        <div>
          <p className="deploy-guide-kicker">Parcours de déploiement</p>
          <h2>
            {progress.complete
              ? "Fondations prêtes"
              : "Mettez DBR en production, étape par étape"}
          </h2>
          <p className="muted">
            Ordre logique : identité → façon de vendre → données & équipe.
            Le statut se met à jour selon votre config réelle.
          </p>
        </div>
        <div className="deploy-guide-score" aria-label="Progression">
          <strong>{pct}%</strong>
          <span>
            {progress.requiredDone}/{progress.requiredTotal} requis
          </span>
          <span className="muted">
            + {progress.optionalDone}/{progress.optionalTotal} optionnels
          </span>
        </div>
      </section>

      <div
        className="deploy-guide-bar"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: `${pct}%` }} />
      </div>

      {progress.next && (
        <div className="deploy-guide-next">
          <div>
            <span className="deploy-guide-next-label">Prochaine étape</span>
            <strong>{progress.next.step.title}</strong>
            <p className="muted">{progress.next.summary}</p>
          </div>
          <button
            type="button"
            className="primary"
            onClick={() => go(progress.next!.step.tab)}
          >
            Continuer
          </button>
        </div>
      )}

      {PHASE_ORDER.map((phase) => {
        const items = progress.statuses.filter((s) => s.step.phase === phase);
        if (!items.length) return null;
        const phaseDone = items.filter((s) => s.effectivelyDone).length;
        return (
          <section key={phase} className="deploy-guide-phase">
            <header className="deploy-guide-phase-head">
              <h3>{DEPLOY_PHASE_LABEL[phase]}</h3>
              <span className="muted">
                {phaseDone}/{items.length}
              </span>
            </header>
            <ol className="deploy-guide-list">
              {items.map(({ step, done, effectivelyDone, summary, reviewed: isReviewed }) => {
                const stepIndex = DEPLOY_STEPS.findIndex((s) => s.id === step.id) + 1;
                return (
                  <li
                    key={step.id}
                    className={[
                      "deploy-guide-item",
                      effectivelyDone ? "is-done" : "is-todo",
                      !step.required ? "is-optional" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div className="deploy-guide-item-status" aria-hidden>
                      {effectivelyDone ? "✓" : stepIndex}
                    </div>
                    <div className="deploy-guide-item-body">
                      <div className="deploy-guide-item-title">
                        <strong>{step.title}</strong>
                        {!step.required && (
                          <span className="deploy-guide-badge">Optionnel</span>
                        )}
                        {done && (
                          <span className="deploy-guide-badge is-ok">Fait</span>
                        )}
                        {!done && isReviewed && (
                          <span className="deploy-guide-badge">Reporté</span>
                        )}
                        {!effectivelyDone && (
                          <span className="deploy-guide-badge is-todo">
                            À faire
                          </span>
                        )}
                      </div>
                      <p className="muted">{step.why}</p>
                      <p className="deploy-guide-summary">{summary}</p>
                      <div className="deploy-guide-item-actions">
                        <button type="button" onClick={() => go(step.tab)}>
                          {effectivelyDone ? "Revoir" : "Configurer"}
                        </button>
                        {!step.required && !done && (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => toggleReviewed(step.id)}
                          >
                            {isReviewed
                              ? "Annuler le report"
                              : "Reporter pour plus tard"}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
