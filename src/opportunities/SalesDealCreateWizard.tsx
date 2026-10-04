import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { useOrgConfig } from "../config/ConfigContext";
import { useDomain } from "../domain/DomainContext";
import {
  defaultBusinessOutcomeValues,
  defaultOpportunityVariables,
  useOpportunities,
  type OpportunityKind,
} from "./OpportunityContext";
import { ensureRequiredMappingChecks } from "./mappingScore";

type Step = "account" | "contact" | "deal" | "qualify";

type Props = {
  onCancel: () => void;
  onCreated: (opportunityId: string) => void;
};

export default function SalesDealCreateWizard({
  onCancel,
  onCreated,
}: Props) {
  const { billing } = useAuth();
  const { activeAccounts, upsertAccount, upsertContact } = useDomain();
  const {
    activeOppKinds,
    activeOppPhases,
    activeSolutions,
    activePersonae,
    catalogFeatures,
    config,
    kindLabel,
  } = useOrgConfig();
  const { addOpportunity, quotaError, clearQuotaError } = useOpportunities();

  const [step, setStep] = useState<Step>("account");
  const [accountMode, setAccountMode] = useState<"existing" | "new">("existing");
  const [accountId, setAccountId] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [dealName, setDealName] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<OpportunityKind>("prospect");
  const [solutionId, setSolutionId] = useState("");
  const [problem, setProblem] = useState("");
  const [error, setError] = useState<string | null>(null);

  const entreprises = useMemo(
    () =>
      activeAccounts
        .filter((a) => a.type === "Entreprise")
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [activeAccounts],
  );

  function resolveAccountId(): string | null {
    if (accountMode === "existing") {
      return accountId || null;
    }
    const name = newAccountName.trim();
    if (!name) return null;
    return upsertAccount({
      name,
      type: "Entreprise",
      commercialStatus: "Prospect",
      holdingId: null,
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    clearQuotaError();

    if (step === "account") {
      if (accountMode === "existing" && !accountId) {
        setError("Choisis une entreprise.");
        return;
      }
      if (accountMode === "new" && !newAccountName.trim()) {
        setError("Indique le nom de l’entreprise.");
        return;
      }
      setStep("contact");
      return;
    }

    if (step === "contact") {
      if (!contactName.trim()) {
        setError("Indique au moins un contact clé.");
        return;
      }
      setStep("deal");
      return;
    }

    if (step === "deal") {
      if (!dealName.trim()) {
        setError("Donne un nom au deal.");
        return;
      }
      setStep("qualify");
      return;
    }

    // qualify → create
    if (!billing.canWrite || billing.opportunitiesFull) {
      setError("Création impossible (quota ou lecture seule).");
      return;
    }
    const primaryAccountId = resolveAccountId();
    if (!primaryAccountId) {
      setError("Entreprise manquante.");
      setStep("account");
      return;
    }

    const contactId = upsertContact({
      name: contactName.trim(),
      title: contactTitle.trim(),
      accountId: primaryAccountId,
      personaId: activePersonae[0]?.id ?? "",
    });

    const resolvedKind = activeOppKinds.some((k) => k.id === kind)
      ? kind
      : "prospect";

    const id = addOpportunity({
      name: dealName.trim(),
      amount: Number(amount) || 0,
      currency: "EUR",
      closeDate: "",
      primaryAccountId,
      phase: activeOppPhases[0]?.id ?? "",
      kind: resolvedKind,
      solutionId: solutionId || activeSolutions[0]?.id || "",
      moduleIds: catalogFeatures.modules ? [] : [],
      personaIds: catalogFeatures.personae ? [] : [],
      variables: defaultOpportunityVariables(config.oppVariables),
      businessOutcomes: defaultBusinessOutcomeValues(config.boFields),
      mappingChecks: ensureRequiredMappingChecks(
        {},
        config.oppMappingSubtypes ?? [],
      ),
      stakeholders: [
        {
          contactId,
          role: "Champion",
          status: "Identified",
        },
      ],
      projectWhy: {
        problem: problem.trim(),
        impacted: "",
        consequence: "",
      },
    });

    if (!id) {
      setError(quotaError || "Impossible de créer le deal.");
      return;
    }
    onCreated(id);
  }

  const stepLabel =
    step === "account"
      ? "1/4 — Compte"
      : step === "contact"
        ? "2/4 — Contact"
        : step === "deal"
          ? "3/4 — Deal"
          : "4/4 — Première qualif";

  return (
    <section className="sales-create-wizard entry-subsection" aria-label="Nouveau deal">
      <header className="opp-plan-section-head">
        <div>
          <h2>Nouveau deal guidé</h2>
          <p className="muted">{stepLabel}</p>
        </div>
        <button type="button" className="ghost" onClick={onCancel}>
          Annuler
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {quotaError ? <p className="form-error">{quotaError}</p> : null}

      <form className="data-form-grid" onSubmit={onSubmit}>
        {step === "account" ? (
          <>
            <div className="sales-create-mode" role="group">
              <button
                type="button"
                className={accountMode === "existing" ? "active" : ""}
                onClick={() => setAccountMode("existing")}
                disabled={entreprises.length === 0}
              >
                Entreprise existante
              </button>
              <button
                type="button"
                className={accountMode === "new" ? "active" : ""}
                onClick={() => setAccountMode("new")}
              >
                Nouvelle entreprise
              </button>
            </div>
            {accountMode === "existing" ? (
              <label>
                Entreprise
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">Choisir…</option>
                  {entreprises.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Nom de l’entreprise
                <input
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="Ex. Acme Industrie"
                  autoFocus
                />
              </label>
            )}
          </>
        ) : null}

        {step === "contact" ? (
          <>
            <label>
              Contact clé
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Ex. Marie Dupont"
                autoFocus
              />
            </label>
            <label>
              Titre (optionnel)
              <input
                value={contactTitle}
                onChange={(e) => setContactTitle(e.target.value)}
                placeholder="Ex. DSI"
              />
            </label>
          </>
        ) : null}

        {step === "deal" ? (
          <>
            <label>
              Nom du deal
              <input
                value={dealName}
                onChange={(e) => setDealName(e.target.value)}
                placeholder="Ex. Déploiement plateforme Q2"
                autoFocus
              />
            </label>
            <label>
              Montant (€)
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </label>
            <label>
              Type
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as OpportunityKind)}
              >
                {activeOppKinds.map((k) => (
                  <option key={k.id} value={k.id}>
                    {kindLabel(k.id)}
                  </option>
                ))}
              </select>
            </label>
            {activeSolutions.length > 0 ? (
              <label>
                Solution
                <select
                  value={solutionId}
                  onChange={(e) => setSolutionId(e.target.value)}
                >
                  <option value="">—</option>
                  {activeSolutions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : null}

        {step === "qualify" ? (
          <label className="full-width">
            Pourquoi y a-t-il un projet ? (1 phrase)
            <textarea
              rows={3}
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder="Ex. Pas de visibilité sur le pipeline terrain…"
              autoFocus
            />
          </label>
        ) : null}

        <div className="sales-create-actions">
          {step !== "account" ? (
            <button
              type="button"
              className="ghost"
              onClick={() =>
                setStep(
                  step === "qualify"
                    ? "deal"
                    : step === "deal"
                      ? "contact"
                      : "account",
                )
              }
            >
              Retour
            </button>
          ) : (
            <span />
          )}
          <button type="submit">
            {step === "qualify" ? "Créer le deal" : "Continuer"}
          </button>
        </div>
      </form>
    </section>
  );
}
