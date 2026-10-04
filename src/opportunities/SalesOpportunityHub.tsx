import { useMemo, useState } from "react";
import { formatEur } from "../data";
import { useAuth } from "../auth/AuthContext";
import { useOrgConfig } from "../config/ConfigContext";
import { useDomain } from "../domain/DomainContext";
import OpportunityProjectPanel from "../OpportunityProjectPanel";
import OpportunityWhyNowPanel from "../OpportunityWhyNowPanel";
import OpportunityCompellingEventsPanel from "../OpportunityCompellingEventsPanel";
import OpportunityCompetitivePanel from "../OpportunityCompetitivePanel";
import OpportunityStakeholdersPanel from "../OpportunityStakeholdersPanel";
import DealBlockersPanel from "../DealBlockersPanel";
import DealReviewPanel from "../DealReviewPanel";
import GenerateActionPlanPanel from "../GenerateActionPlanPanel";
import {
  useOpportunities,
  type Opportunity,
} from "./OpportunityContext";
import { useConfirm } from "../ui/ConfirmDialog";
import SalesDealCoach from "./SalesDealCoach";

type HubZone = "situation" | "qualification" | "next";

type QualSub =
  | "projet"
  | "urgency"
  | "concurrence"
  | "valeur";

type Props = {
  opportunity: Opportunity;
  onBack: () => void;
  backLabel?: string;
};

export default function SalesOpportunityHub({
  opportunity,
  onBack,
  backLabel = "← Mes deals",
}: Props) {
  const { billing } = useAuth();
  const { activeAccounts } = useDomain();
  const { kindLabel, phaseLabel, activeOppPhases, activeOppKinds } =
    useOrgConfig();
  const { updateOpportunity, removeOpportunity } = useOpportunities();
  const askConfirm = useConfirm();
  const [zone, setZone] = useState<HubZone>("situation");
  const [qualSub, setQualSub] = useState<QualSub>("projet");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const account = useMemo(
    () =>
      activeAccounts.find((a) => a.id === opportunity.primaryAccountId) ?? null,
    [activeAccounts, opportunity.primaryAccountId],
  );

  function onUpdate(patch: Partial<Opportunity>) {
    updateOpportunity(opportunity.id, patch);
  }

  return (
    <div className="data-page opportunity-detail-page sales-opp-hub">
      <header className="data-page-head opp-detail-head">
        <div>
          <button type="button" className="ghost back-link" onClick={onBack}>
            {backLabel}
          </button>
          <h1>{opportunity.name}</h1>
          <div className="opp-detail-meta">
            <span className="opp-chip">{kindLabel(opportunity.kind)}</span>
            <span className="opp-chip accent">
              {formatEur(opportunity.amount)}
            </span>
            <span className="opp-chip">{phaseLabel(opportunity.phase)}</span>
            {account ? (
              <span className="opp-chip muted-chip">{account.name}</span>
            ) : null}
          </div>
        </div>
      </header>

      <nav className="sales-hub-nav" aria-label="Hub deal">
        {(
          [
            { id: "situation" as const, label: "Situation" },
            { id: "qualification" as const, label: "Qualification" },
            { id: "next" as const, label: "Next step" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            className={zone === item.id ? "active" : ""}
            onClick={() => setZone(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {zone === "situation" ? (
        <div className="sales-hub-zone">
          <section className="entry-subsection account-detail-fiche">
            <h2>Fiche courte</h2>
            <div className="data-form-grid">
              <label>
                Nom du deal
                <input
                  value={opportunity.name}
                  onChange={(e) => onUpdate({ name: e.target.value })}
                  disabled={!billing.canWrite}
                />
              </label>
              <label>
                Montant (€)
                <input
                  type="number"
                  value={opportunity.amount || ""}
                  onChange={(e) =>
                    onUpdate({ amount: Number(e.target.value) || 0 })
                  }
                  disabled={!billing.canWrite}
                />
              </label>
              <label>
                Phase
                <select
                  value={opportunity.phase}
                  onChange={(e) => onUpdate({ phase: e.target.value })}
                  disabled={!billing.canWrite}
                >
                  {activeOppPhases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {phaseLabel(p.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select
                  value={opportunity.kind}
                  onChange={(e) =>
                    onUpdate({
                      kind: e.target.value as Opportunity["kind"],
                    })
                  }
                  disabled={!billing.canWrite}
                >
                  {activeOppKinds.map((k) => (
                    <option key={k.id} value={k.id}>
                      {kindLabel(k.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date de closing
                <input
                  type="date"
                  value={opportunity.closeDate || ""}
                  onChange={(e) => onUpdate({ closeDate: e.target.value })}
                  disabled={!billing.canWrite}
                />
              </label>
              <label>
                Compte
                <input value={account?.name ?? "—"} disabled />
              </label>
            </div>
          </section>
          <OpportunityStakeholdersPanel
            opportunity={opportunity}
            onUpdate={onUpdate}
          />
        </div>
      ) : null}

      {zone === "qualification" ? (
        <div className="sales-hub-zone">
          <p className="muted sales-hub-hint">
            Remplis ce fil (ou laisse le Coach deal te guider). Les détails
            avancés restent optionnels.
          </p>
          <div className="sales-hub-subnav" role="tablist">
            {(
              [
                { id: "projet" as const, label: "Problème" },
                { id: "urgency" as const, label: "Urgence" },
                { id: "concurrence" as const, label: "Concurrent" },
                { id: "valeur" as const, label: "Valeur" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                className={qualSub === item.id ? "active" : ""}
                onClick={() => setQualSub(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {qualSub === "projet" ? (
            <OpportunityProjectPanel
              opportunity={opportunity}
              onUpdate={onUpdate}
            />
          ) : null}
          {qualSub === "urgency" ? (
            <OpportunityCompellingEventsPanel
              opportunity={opportunity}
              onUpdate={onUpdate}
            />
          ) : null}
          {qualSub === "concurrence" ? (
            <OpportunityCompetitivePanel
              opportunity={opportunity}
              onUpdate={onUpdate}
            />
          ) : null}
          {qualSub === "valeur" ? (
            <OpportunityWhyNowPanel
              opportunity={opportunity}
              onUpdate={onUpdate}
            />
          ) : null}

          <button
            type="button"
            className="ghost tiny"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Masquer le plan d’actions" : "Plan d’actions (avancé)"}
          </button>
          {showAdvanced ? (
            <GenerateActionPlanPanel opportunity={opportunity} />
          ) : null}
        </div>
      ) : null}

      {zone === "next" ? (
        <div className="sales-hub-zone">
          <DealBlockersPanel opportunity={opportunity} />
          <DealReviewPanel opportunity={opportunity} embedded />
          <button
            type="button"
            className="ghost danger-text"
            onClick={() => {
              void (async () => {
                const ok = await askConfirm({
                  title: "Désactiver le deal",
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
            Désactiver le deal
          </button>
        </div>
      ) : null}

      <SalesDealCoach
        opportunity={opportunity}
        onOpenReview={() => setZone("next")}
      />
    </div>
  );
}
