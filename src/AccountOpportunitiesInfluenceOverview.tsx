import { useMemo, useState, type FormEvent } from "react";
import { engagementLabel, formatEur } from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import { useAuth } from "./auth/AuthContext";
import {
  defaultBusinessOutcomeValues,
  defaultOpportunityVariables,
  opportunityKindLabel,
  useOpportunities,
  type Opportunity,
  type OpportunityKind,
} from "./opportunities/OpportunityContext";
import { ensureRequiredMappingChecks } from "./opportunities/mappingScore";
import OppScorePills from "./OppScorePills";
import { openOpportunityDetail } from "./opportunities/oppNavigation";

function showsDealVariables(kind: OpportunityKind) {
  return kind === "up" || kind === "upsell";
}

type Props = {
  accountId: string;
  /** Variante compacte pour le rail cartographie. */
  compact?: boolean;
  onOpenOpportunity?: (opportunityId: string) => void;
  onOpenContact?: (contactId: string) => void;
};

/**
 * Vision globale du compte : opportunités associées
 * et niveau d’influence (rôle deal) de chaque contact par opportunité.
 */
export default function AccountOpportunitiesInfluenceOverview({
  accountId,
  compact = false,
  onOpenOpportunity,
  onOpenContact,
}: Props) {
  const { billing } = useAuth();
  const { activeAccounts, activeContacts } = useDomain();
  const {
    activeContactTypes,
    contactTypeColor,
    contactTypeLabel,
    solutionLabel,
    activeSolutions,
    activePersonae,
    catalogFeatures,
    config,
    activeOppKinds,
    activeOppPhases,
    kindLabel,
    phaseLabel,
  } = useOrgConfig();
  const {
    activeOpportunities,
    setActiveOpportunityId,
    addOpportunity,
    quotaError,
    clearQuotaError,
  } = useOpportunities();

  const account = activeAccounts.find((a) => a.id === accountId) ?? null;
  const isHolding = account?.type === "Holding";

  const childEntreprises = useMemo(() => {
    if (!account || !isHolding) return [];
    return activeAccounts
      .filter((a) => a.type === "Entreprise" && a.holdingId === account.id)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [account, isHolding, activeAccounts]);

  const scopedAccountIds = useMemo(() => {
    if (!account) return new Set<string>();
    if (isHolding) {
      return new Set(childEntreprises.map((a) => a.id));
    }
    return new Set([account.id]);
  }, [account, isHolding, childEntreprises]);

  const opportunities = useMemo(() => {
    return activeOpportunities
      .filter((o) => scopedAccountIds.has(o.primaryAccountId))
      .sort((a, b) => {
        const dateCmp = (b.closeDate || "").localeCompare(a.closeDate || "");
        if (dateCmp !== 0) return dateCmp;
        return a.name.localeCompare(b.name, "fr");
      });
  }, [activeOpportunities, scopedAccountIds]);

  const contactById = useMemo(() => {
    const map = new Map(activeContacts.map((c) => [c.id, c]));
    return map;
  }, [activeContacts]);

  const accountNameById = useMemo(() => {
    const map = new Map(activeAccounts.map((a) => [a.id, a.name]));
    return map;
  }, [activeAccounts]);

  const [creating, setCreating] = useState(false);
  const [createKind, setCreateKind] = useState<OpportunityKind>(
    () => activeOppKinds[0]?.id ?? "prospect",
  );
  const [createAccountId, setCreateAccountId] = useState("");
  const [createSolutionId, setCreateSolutionId] = useState("");
  const [createModuleIds, setCreateModuleIds] = useState<string[]>([]);
  const [createPersonaIds, setCreatePersonaIds] = useState<string[]>([]);

  const canCreate =
    Boolean(account) &&
    !compact &&
    billing.canWrite &&
    !billing.opportunitiesFull &&
    (!isHolding || childEntreprises.length > 0);

  function openCreate() {
    clearQuotaError();
    setCreateKind(activeOppKinds[0]?.id ?? "prospect");
    setCreateAccountId(
      isHolding ? (childEntreprises[0]?.id ?? "") : (account?.id ?? ""),
    );
    setCreateSolutionId("");
    setCreateModuleIds([]);
    setCreatePersonaIds([]);
    setCreating(true);
  }

  function handleOpenOpp(opp: Opportunity) {
    if (!account) return;
    setActiveOpportunityId(opp.id);
    openOpportunityDetail(opp.id, {
      type: "account",
      accountId: account.id,
    });
    onOpenOpportunity?.(opp.id);
  }

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!account) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    if (!name) return;
    const kind = (String(fd.get("kind") ?? createKind) ||
      "prospect") as OpportunityKind;
    const resolvedKind = activeOppKinds.some((k) => k.id === kind)
      ? kind
      : "prospect";
    const primaryAccountId = isHolding
      ? String(fd.get("primaryAccountId") ?? createAccountId)
      : account.id;
    const entreprise = activeAccounts.find((a) => a.id === primaryAccountId);
    if (!entreprise || entreprise.type !== "Entreprise") return;
    const solutionId = String(fd.get("solutionId") ?? createSolutionId ?? "");
    const id = addOpportunity({
      name,
      amount: Number(fd.get("amount")) || 0,
      currency: "EUR",
      closeDate: String(fd.get("closeDate") ?? ""),
      primaryAccountId,
      phase: String(fd.get("phase") ?? activeOppPhases[0]?.id ?? "Whitespace"),
      kind: resolvedKind,
      solutionId,
      moduleIds: catalogFeatures.modules ? createModuleIds : [],
      personaIds: catalogFeatures.personae ? createPersonaIds : [],
      variables: showsDealVariables(resolvedKind)
        ? defaultOpportunityVariables(config.oppVariables)
        : {},
      businessOutcomes: defaultBusinessOutcomeValues(config.boFields),
      mappingChecks: ensureRequiredMappingChecks(
        {},
        config.oppMappingSubtypes ?? [],
      ),
    });
    if (!id) return;
    setCreating(false);
    setActiveOpportunityId(id);
    openOpportunityDetail(id, {
      type: "account",
      accountId: account.id,
    });
    onOpenOpportunity?.(id);
  }

  if (!account) {
    return <p className="muted">Compte introuvable.</p>;
  }

  const head = !compact ? (
    <div className="account-opp-influence-head">
      <div>
        <h2>Opportunités & influence</h2>
        <p className="muted account-opp-influence-intro">
          Vue globale du compte : chaque opportunité et le niveau d’influence
          des contacts mappés (Economic Buyer, Champion, Influencer…).
        </p>
      </div>
      {canCreate && !creating && (
        <button type="button" className="primary-cta" onClick={openCreate}>
          Créer une opportunité
        </button>
      )}
    </div>
  ) : (
    <h2>
      Opportunités
      <span className="account-opp-count"> ({opportunities.length})</span>
    </h2>
  );

  return (
    <section className={`account-opp-influence ${compact ? "compact" : ""}`}>
      {head}

      {quotaError ? (
        <p className="form-error" role="alert">
          {quotaError}
        </p>
      ) : null}

      {creating && canCreate && (
        <div
          className="plan-create-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-opp-create-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCreating(false);
          }}
        >
          <form className="plan-create-dialog" onSubmit={handleCreate}>
            <h2 id="account-opp-create-title">Nouvelle opportunité</h2>
            <p className="muted">
              {isHolding
                ? `Groupe ${account.name} — choisir l’entreprise`
                : `Compte ${account.name}`}
            </p>
            <div className="entry-grid">
              <label>
                Nom
                <input name="name" required autoFocus />
              </label>
              <label>
                Type
                <select
                  name="kind"
                  value={createKind}
                  onChange={(e) =>
                    setCreateKind(e.target.value as OpportunityKind)
                  }
                  required
                >
                  {activeOppKinds.map((k) => (
                    <option key={k.id} value={k.id}>
                      {kindLabel(k.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Montant (€)
                <input name="amount" type="number" min={0} step={1000} />
              </label>
              <label>
                Close
                <input name="closeDate" type="date" />
              </label>
              {isHolding ? (
                <label>
                  Entreprise
                  <select
                    name="primaryAccountId"
                    required
                    value={createAccountId}
                    onChange={(e) => setCreateAccountId(e.target.value)}
                  >
                    {childEntreprises.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <input type="hidden" name="primaryAccountId" value={account.id} />
              )}
              <label>
                Phase
                <select
                  name="phase"
                  defaultValue={activeOppPhases[0]?.id ?? "Whitespace"}
                >
                  {activeOppPhases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {phaseLabel(p.id)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Solution (catalogue)
              <select
                name="solutionId"
                value={createSolutionId}
                onChange={(e) => {
                  setCreateSolutionId(e.target.value);
                  setCreateModuleIds([]);
                }}
              >
                <option value="">— Aucune —</option>
                {activeSolutions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.code ? ` (${s.code})` : ""}
                  </option>
                ))}
              </select>
            </label>

            {catalogFeatures.modules &&
              (() => {
                const sol = activeSolutions.find(
                  (s) => s.id === createSolutionId,
                );
                const modules = (sol?.modules ?? []).filter(
                  (m) => m.active !== false,
                );
                if (!sol || modules.length === 0) return null;
                return (
                  <fieldset className="opp-create-multi">
                    <legend>Modules</legend>
                    <div className="sold-check-grid">
                      {modules.map((m) => (
                        <label key={m.id} className="sold-check">
                          <input
                            type="checkbox"
                            checked={createModuleIds.includes(m.id)}
                            onChange={() => {
                              setCreateModuleIds((prev) =>
                                prev.includes(m.id)
                                  ? prev.filter((id) => id !== m.id)
                                  : [...prev, m.id],
                              );
                            }}
                          />
                          <span>{m.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })()}

            {catalogFeatures.personae && activePersonae.length > 0 && (
              <fieldset className="opp-create-multi">
                <legend>Personae adressées</legend>
                <p className="muted sold-multi-hint">
                  Aucune case = niveau entreprise.
                </p>
                <div className="sold-check-grid">
                  {activePersonae.map((d) => (
                    <label key={d.id} className="sold-check">
                      <input
                        type="checkbox"
                        checked={createPersonaIds.includes(d.id)}
                        onChange={() => {
                          setCreatePersonaIds((prev) =>
                            prev.includes(d.id)
                              ? prev.filter((id) => id !== d.id)
                              : [...prev, d.id],
                          );
                        }}
                      />
                      <span>{d.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="plan-create-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setCreating(false)}
              >
                Annuler
              </button>
              <button type="submit" className="primary-cta">
                Créer et ouvrir
              </button>
            </div>
          </form>
        </div>
      )}

      {opportunities.length === 0 ? (
        <p className="muted">
          Aucune opportunité active sur{" "}
          {isHolding ? "les entreprises du groupe" : "ce compte"}.
          {canCreate ? " Crée-en une pour démarrer." : null}
        </p>
      ) : (
        <ul className="account-opp-influence-list">
          {opportunities.map((opp) => {
            const stakeholders = [...(opp.stakeholders ?? [])].sort((a, b) => {
              const na = contactById.get(a.contactId)?.name ?? "";
              const nb = contactById.get(b.contactId)?.name ?? "";
              return na.localeCompare(nb, "fr");
            });
            const entrepriseName = isHolding
              ? accountNameById.get(opp.primaryAccountId)
              : null;

            return (
              <li key={opp.id} className="account-opp-card">
                <header className="account-opp-card-head">
                  <div className="account-opp-card-title">
                    <button
                      type="button"
                      className="ghost linkish account-opp-name"
                      onClick={() => handleOpenOpp(opp)}
                    >
                      {opp.name}
                    </button>
                    <div className="account-opp-meta">
                      <span className="account-opp-phase">{opp.phase}</span>
                      <span className="dot">·</span>
                      <span>
                        {kindLabel(opp.kind) ||
                          opportunityKindLabel[opp.kind] ||
                          opp.kind}
                      </span>
                      {opp.solutionId ? (
                        <>
                          <span className="dot">·</span>
                          <span>{solutionLabel(opp.solutionId)}</span>
                        </>
                      ) : null}
                      {entrepriseName ? (
                        <>
                          <span className="dot">·</span>
                          <span>{entrepriseName}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <strong className="account-opp-amount">
                    {formatEur(opp.amount)}
                  </strong>
                </header>
                <OppScorePills opportunity={opp} compact />

                {stakeholders.length === 0 ? (
                  <p className="muted account-opp-empty-stakes">
                    Aucun contact mappé sur cette opportunité.
                  </p>
                ) : (
                  <ul className="account-opp-stakes">
                    {stakeholders.map((s) => {
                      const contact = contactById.get(s.contactId);
                      const roleId = s.role ?? "";
                      const color = roleId
                        ? contactTypeColor(roleId)
                        : "#9ca3af";
                      const roleLabel = roleId
                        ? contactTypeLabel(roleId)
                        : "Type non défini";
                      return (
                        <li key={`${opp.id}-${s.contactId}`}>
                          <i
                            className="swatch"
                            style={{ background: color }}
                            aria-hidden
                          />
                          <div className="account-opp-stake-body">
                            {contact && onOpenContact ? (
                              <button
                                type="button"
                                className="ghost linkish"
                                onClick={() => onOpenContact(contact.id)}
                              >
                                {contact.name}
                              </button>
                            ) : (
                              <strong>
                                {contact?.name ?? "Contact introuvable"}
                              </strong>
                            )}
                            <span
                              className="account-opp-stake-role"
                              style={{ color }}
                            >
                              {roleLabel}
                            </span>
                            {!compact && contact?.title ? (
                              <span className="muted">{contact.title}</span>
                            ) : null}
                            <span className="muted">
                              {engagementLabel[s.status] ?? s.status}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!compact && activeContactTypes.length > 0 && (
        <ul
          className="opp-stake-legend account-opp-legend"
          aria-label="Légende des rôles"
        >
          {activeContactTypes.map((t) => (
            <li key={t.id}>
              <i style={{ background: t.color }} aria-hidden />
              {t.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
