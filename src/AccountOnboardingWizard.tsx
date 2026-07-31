import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  accountTypeLabel,
  type Account,
  type AccountSize,
  type AccountType,
  type CommercialStatus,
} from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import {
  defaultBusinessOutcomeValues,
  defaultOpportunityVariables,
  useOpportunities,
  type OpportunityKind,
} from "./opportunities/OpportunityContext";
import { useAccountPlans } from "./accountPlans/AccountPlanContext";
import { ensureRequiredMappingChecks } from "./opportunities/mappingScore";

type WizardStep =
  | "account"
  | "ask-contact"
  | "contact"
  | "ask-opp"
  | "opp"
  | "ask-plan"
  | "plan";

type Props = {
  mode: "create" | "edit";
  accountId?: string | null;
  onClose: () => void;
  /** Après création / édition d’un compte (pour sélectionner la fiche). */
  onAccountSaved?: (accountId: string) => void;
  /** Après création d’un account plan → ouvrir la fiche plan. */
  onPlanCreated?: (planId: string) => void;
};

export default function AccountOnboardingWizard({
  mode,
  accountId: initialAccountId = null,
  onClose,
  onAccountSaved,
  onPlanCreated,
}: Props) {
  const {
    accounts,
    activeAccounts,
    activeContacts,
    upsertAccount,
    upsertContact,
    setContactParent,
  } = useDomain();
  const {
    activePersonae,
    activeSectors,
    activeSolutions,
    activeOppVariables,
    config,
    activeCommercialStatuses,
    activeAccountSizes,
    activeOppPhases,
    activeOppKinds,
    statusLabel,
    sizeLabel,
    kindLabel,
    phaseLabel,
  } = useOrgConfig();
  const { addOpportunity } = useOpportunities();
  const { upsertPlan } = useAccountPlans();

  const existing = initialAccountId
    ? (accounts.find((a) => a.id === initialAccountId) ?? null)
    : null;

  const [step, setStep] = useState<WizardStep>("account");
  const [accountId, setAccountId] = useState<string | null>(
    initialAccountId,
  );
  const [opportunityId, setOpportunityId] = useState<string | null>(null);

  const [accName, setAccName] = useState(existing?.name ?? "");
  const [accType, setAccType] = useState<AccountType>(
    existing?.type ?? "Entreprise",
  );
  const [accStatus, setAccStatus] = useState<CommercialStatus>(
    existing?.commercialStatus ?? "Prospect",
  );
  const [accSector, setAccSector] = useState(existing?.sector ?? "");
  const [accSize, setAccSize] = useState<AccountSize | "">(existing?.size ?? "");

  const [cName, setCName] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cPersona, setCPersona] = useState(activePersonae[0]?.id ?? "");
  const [cParent, setCParent] = useState("");

  const [oppName, setOppName] = useState("");
  const [oppAmount, setOppAmount] = useState("");
  const [oppClose, setOppClose] = useState("");
  const [oppPhase, setOppPhase] = useState("");
  const [oppKind, setOppKind] = useState<OpportunityKind>("prospect");
  const [oppSolution, setOppSolution] = useState(activeSolutions[0]?.id ?? "");

  const [planDue, setPlanDue] = useState(
    () => new Date().toISOString().slice(0, 10),
  );

  const account: Account | null = useMemo(
    () =>
      accountId
        ? (activeAccounts.find((a) => a.id === accountId) ??
          accounts.find((a) => a.id === accountId) ??
          null)
        : null,
    [accountId, activeAccounts, accounts],
  );

  const contactsOnAccount = useMemo(
    () => activeContacts.filter((c) => c.accountId === accountId),
    [activeContacts, accountId],
  );

  useEffect(() => {
    if (!cPersona && activePersonae[0]) setCPersona(activePersonae[0].id);
  }, [activePersonae, cPersona]);

  useEffect(() => {
    if (!oppPhase && activeOppPhases[0]) setOppPhase(activeOppPhases[0].id);
  }, [activeOppPhases, oppPhase]);

  function submitAccount(e: FormEvent) {
    e.preventDefault();
    if (!accName.trim()) return;
    const id = upsertAccount({
      id: mode === "edit" ? (initialAccountId ?? undefined) : undefined,
      name: accName,
      type: accType,
      commercialStatus: accStatus,
      holdingId:
        accType === "Holding"
          ? null
          : mode === "edit"
            ? (existing?.holdingId ?? null)
            : null,
      sector: accSector || undefined,
      size: accSize || undefined,
    });
    if (!id) return;
    setAccountId(id);
    onAccountSaved?.(id);
    if (mode === "edit") {
      onClose();
      return;
    }
    if (accType === "Entreprise") {
      setOppName(`Deal ${accName.trim()}`);
      setStep("ask-contact");
      return;
    }
    onClose();
  }

  function submitContact(e: FormEvent) {
    e.preventDefault();
    if (!accountId || !cName.trim() || !cPersona) return;
    const id = upsertContact({
      name: cName,
      title: cTitle,
      personaId: cPersona,
      accountId,
    });
    if (id) setContactParent(id, cParent || null);
    setStep("ask-opp");
  }

  function submitOpp(e: FormEvent) {
    e.preventDefault();
    if (!accountId || !oppName.trim()) return;
    const id = addOpportunity({
      name: oppName.trim(),
      amount: Number(oppAmount) || 0,
      currency: "EUR",
      closeDate: oppClose,
      primaryAccountId: accountId,
      phase: oppPhase,
      kind: oppKind,
      solutionId:
        oppKind === "cross" ||
        oppKind === "new_in_group" ||
        oppKind === "prospect"
          ? oppSolution
          : "",
      moduleIds: [],
      personaIds: [],
      variables:
        oppKind === "up"
          ? defaultOpportunityVariables(activeOppVariables)
          : {},
      businessOutcomes: defaultBusinessOutcomeValues(config.boFields),
      mappingChecks: ensureRequiredMappingChecks(
        {},
        config.oppMappingSubtypes ?? [],
      ),
    });
    if (!id) return;
    setOpportunityId(id);
    setStep("ask-plan");
  }

  function submitPlan(e: FormEvent) {
    e.preventDefault();
    if (!opportunityId || !accountId || !planDue) return;
    const acc = activeAccounts.find((a) => a.id === accountId);
    if (!acc || acc.type !== "Entreprise") return;
    const id = upsertPlan({
      opportunityIds: [opportunityId],
      accountId,
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: planDue,
      status: "Todo",
      vision: "",
      objectives: [],
    });
    onPlanCreated?.(id);
    onClose();
  }

  const title =
    step === "account"
      ? mode === "edit"
        ? "Modifier l’entreprise"
        : "Nouvelle entreprise"
      : step === "ask-contact" || step === "contact"
        ? "Contact"
        : step === "ask-opp" || step === "opp"
          ? "Opportunité"
          : "Account plan";

  return (
    <div
      className="plan-create-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-wizard-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="plan-create-dialog wizard-dialog">
        <h2 id="account-wizard-title">{title}</h2>

        {step === "account" && (
          <form className="entry-form wizard-form" onSubmit={submitAccount}>
            <div className="entry-grid">
              <label>
                Nom
                <input
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label>
                Type
                <select
                  value={accType}
                  onChange={(e) => setAccType(e.target.value as AccountType)}
                  disabled={mode === "edit"}
                >
                  <option value="Holding">{accountTypeLabel.Holding}</option>
                  <option value="Entreprise">
                    {accountTypeLabel.Entreprise}
                  </option>
                </select>
              </label>
              <label>
                Statut
                <select
                  value={accStatus}
                  onChange={(e) =>
                    setAccStatus(e.target.value as CommercialStatus)
                  }
                >
                  {activeCommercialStatuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {statusLabel(s.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Secteur
                <select
                  value={accSector}
                  onChange={(e) => setAccSector(e.target.value)}
                >
                  <option value="">—</option>
                  {activeSectors.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                  {accSector &&
                    !activeSectors.some((s) => s.name === accSector) && (
                      <option value={accSector}>
                        {accSector} (hors catalogue)
                      </option>
                    )}
                </select>
              </label>
              <label>
                Effectif (tranche)
                <select
                  value={accSize}
                  onChange={(e) =>
                    setAccSize((e.target.value || "") as AccountSize | "")
                  }
                >
                  <option value="">—</option>
                  {activeAccountSizes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {sizeLabel(s.id)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="plan-create-actions">
              <button type="button" className="ghost" onClick={onClose}>
                Annuler
              </button>
              <button type="submit">
                {mode === "edit" ? "Enregistrer" : "Enregistrer"}
              </button>
            </div>
          </form>
        )}

        {step === "ask-contact" && (
          <div className="wizard-ask">
            <p>
              <strong>{account?.name ?? "L’entreprise"}</strong> est créée.
              Voulez-vous ajouter un contact maintenant ?
            </p>
            <div className="plan-create-actions">
              <button type="button" className="ghost" onClick={onClose}>
                Plus tard
              </button>
              <button type="button" onClick={() => setStep("contact")}>
                Créer un contact
              </button>
            </div>
          </div>
        )}

        {step === "contact" && (
          <form className="entry-form wizard-form" onSubmit={submitContact}>
            <div className="entry-grid">
              <label>
                Nom
                <input
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label>
                Titre
                <input
                  value={cTitle}
                  onChange={(e) => setCTitle(e.target.value)}
                />
              </label>
              <label>
                Persona
                <select
                  value={cPersona}
                  onChange={(e) => setCPersona(e.target.value)}
                  required
                >
                  {activePersonae.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                N+1 (optionnel)
                <select
                  value={cParent}
                  onChange={(e) => setCParent(e.target.value)}
                >
                  <option value="">—</option>
                  {contactsOnAccount.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="plan-create-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setStep("ask-opp")}
              >
                Passer
              </button>
              <button type="submit">Enregistrer le contact</button>
            </div>
          </form>
        )}

        {step === "ask-opp" && (
          <div className="wizard-ask">
            <p>
              Voulez-vous créer une opportunité sur{" "}
              <strong>{account?.name}</strong> ?
            </p>
            <div className="plan-create-actions">
              <button type="button" className="ghost" onClick={onClose}>
                Plus tard
              </button>
              <button type="button" onClick={() => setStep("opp")}>
                Créer une opportunité
              </button>
            </div>
          </div>
        )}

        {step === "opp" && (
          <form className="entry-form wizard-form" onSubmit={submitOpp}>
            <div className="entry-grid">
              <label>
                Nom
                <input
                  value={oppName}
                  onChange={(e) => setOppName(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label>
                Montant (€)
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={oppAmount}
                  onChange={(e) => setOppAmount(e.target.value)}
                />
              </label>
              <label>
                Close date
                <input
                  type="date"
                  value={oppClose}
                  onChange={(e) => setOppClose(e.target.value)}
                />
              </label>
              <label>
                Type
                <select
                  value={oppKind}
                  onChange={(e) =>
                    setOppKind(e.target.value as OpportunityKind)
                  }
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
                  value={oppPhase}
                  onChange={(e) => setOppPhase(e.target.value)}
                >
                  {activeOppPhases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {phaseLabel(p.id)}
                    </option>
                  ))}
                </select>
              </label>
              {(oppKind === "cross" ||
                oppKind === "new_in_group" ||
                oppKind === "prospect") && (
                <label>
                  Solution
                  <select
                    value={oppSolution}
                    onChange={(e) => setOppSolution(e.target.value)}
                    required
                  >
                    <option value="">—</option>
                    {activeSolutions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="plan-create-actions">
              <button type="button" className="ghost" onClick={onClose}>
                Passer
              </button>
              <button type="submit">Enregistrer l’opportunité</button>
            </div>
          </form>
        )}

        {step === "ask-plan" && (
          <div className="wizard-ask">
            <p>
              Voulez-vous créer un account plan pour cette opportunité ?
            </p>
            <div className="plan-create-actions">
              <button type="button" className="ghost" onClick={onClose}>
                Terminer
              </button>
              <button
                type="button"
                onClick={() => setStep("plan")}
                disabled={!opportunityId}
              >
                Créer un account plan
              </button>
            </div>
          </div>
        )}

        {step === "plan" && (
          <form className="entry-form wizard-form" onSubmit={submitPlan}>
            <label>
              Échéance du plan
              <input
                type="date"
                value={planDue}
                onChange={(e) => setPlanDue(e.target.value)}
                required
              />
            </label>
            <div className="plan-create-actions">
              <button type="button" className="ghost" onClick={onClose}>
                Annuler
              </button>
              <button type="submit">Créer et ouvrir la fiche</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
