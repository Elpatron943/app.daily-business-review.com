import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  accountTypeLabel,
  companyRelationLabel,
  formatEur,
  salesForAccountScope,
  opportunitiesForAccountScope,
  aggregateKpis,
  type AccountSize,
  type CommercialStatus,
} from "./data";
import { useAuth } from "./auth/AuthContext";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import { useSales } from "./sales/SalesContext";
import AccountPlanOverviewOnFiche from "./accountPlans/AccountPlanOverviewOnFiche";
import AccountOpportunitiesInfluenceOverview from "./AccountOpportunitiesInfluenceOverview";
import AccountEquipmentPanel from "./AccountEquipmentPanel";
import SoldSolutionEditor from "./SoldSolutionEditor";
import { useOpportunities } from "./opportunities/OpportunityContext";

type EcosystemLinkType = "CompetitorOf" | "PartnerOf";

type Tab =
  | "fiche"
  | "plan"
  | "indicateurs"
  | "contacts"
  | "opportunites"
  | "equipement";

type Props = {
  accountId: string;
  onBack: () => void;
  onOpenAccount?: (id: string) => void;
  onOpenContact?: (id: string) => void;
  onOpenOpportunities?: () => void;
};

export default function AccountDetailPage({
  accountId,
  onBack,
  onOpenAccount,
  onOpenContact,
  onOpenOpportunities,
}: Props) {
  const {
    accounts,
    activeAccounts,
    activeContacts,
    companyRelations,
    upsertAccount,
    removeAccount,
    restoreAccount,
    upsertCompanyRelation,
    removeCompanyRelation,
    upsertContact,
    setContactParent,
  } = useDomain();
  const {
    activeSectors,
    solutionLabel,
    activePersonae,
    personaLabel,
    salesTaxonomy,
    statusLabel,
    sizeLabel,
    activeCommercialStatuses,
    activeAccountSizes,
  } = useOrgConfig();
  const { soldSolutions } = useSales();
  const { activeOpportunities, assignOwnerForAccount } = useOpportunities();
  const { team, canAssignOwner, canWriteDomain, billing } = useAuth();
  const readOnly = !canWriteDomain || !billing.canWrite;
  const [tab, setTab] = useState<Tab>("fiche");
  const [relTo, setRelTo] = useState("");
  const [relType, setRelType] = useState<EcosystemLinkType>("CompetitorOf");
  const [relError, setRelError] = useState("");

  const [cName, setCName] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cPersona, setCPersona] = useState("");
  const [cParent, setCParent] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);

  const account = accounts.find((a) => a.id === accountId) ?? null;

  const holding = account?.holdingId
    ? (accounts.find((h) => h.id === account.holdingId) ?? null)
    : null;

  const childEntreprises = useMemo(
    () =>
      activeAccounts
        .filter((a) => a.type === "Entreprise" && a.holdingId === accountId)
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [activeAccounts, accountId],
  );

  const holdings = activeAccounts.filter((a) => a.type === "Holding");

  const kpis = useMemo(() => {
    if (!account) return null;
    const lines = salesForAccountScope(
      account.id,
      soldSolutions,
      activeAccounts,
    );
    // Groupe : uniquement les ventes des entreprises filles
    const scoped =
      account.type === "Holding"
        ? lines.filter((s) => s.accountId !== account.id)
        : lines;
    const opps = opportunitiesForAccountScope(
      account.id,
      activeOpportunities,
      activeAccounts,
    );
    const scopedOpps =
      account.type === "Holding"
        ? opps.filter((o) => o.primaryAccountId !== account.id)
        : opps;
    return aggregateKpis(
      scoped,
      account.name,
      solutionLabel,
      scopedOpps,
      undefined,
      salesTaxonomy,
    );
  }, [account, soldSolutions, activeAccounts, activeOpportunities, solutionLabel, salesTaxonomy]);

  const ownRelations = useMemo(() => {
    if (!account) return [];
    return companyRelations.filter(
      (r) =>
        (r.relation === "CompetitorOf" || r.relation === "PartnerOf") &&
        (r.source === account.id || r.target === account.id),
    );
  }, [account, companyRelations]);

  const canLinkEcosystem =
    account?.type === "Entreprise" &&
    (account.commercialStatus === "Client" ||
      account.commercialStatus === "Prospect");

  const linkableAccounts = useMemo(() => {
    if (!account) return [];
    const wantedStatus =
      relType === "CompetitorOf" ? "Concurrent" : "Partner";
    return activeAccounts
      .filter(
        (a) =>
          a.id !== account.id &&
          a.type === "Entreprise" &&
          a.commercialStatus === wantedStatus,
      )
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [account, activeAccounts, relType]);

  useEffect(() => {
    if (
      account?.type === "Holding" &&
      (tab === "plan" || tab === "contacts" || tab === "equipement")
    ) {
      setTab("fiche");
    }
  }, [account?.type, tab]);

  useEffect(() => {
    if (account?.commercialStatus === "Other") {
      upsertAccount({
        id: account.id,
        name: account.name,
        type: account.type,
        commercialStatus: "Prospect",
        holdingId: account.holdingId,
        sector: account.sector,
        size: account.size,
        x: account.x,
        y: account.y,
        active: account.active,
      });
    }
  }, [account, upsertAccount]);

  useEffect(() => {
    setRelTo("");
  }, [relType]);

  useEffect(() => {
    if (!cPersona && activePersonae[0]) setCPersona(activePersonae[0].id);
  }, [activePersonae, cPersona]);

  const contactsOnAccount = useMemo(
    () =>
      activeContacts
        .filter((c) => c.accountId === accountId)
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [activeContacts, accountId],
  );

  function handleAddRelation(e: FormEvent) {
    e.preventDefault();
    setRelError("");
    if (!account || !relTo || !canLinkEcosystem) return;
    if (relTo === account.id) {
      setRelError("Choisis un autre compte.");
      return;
    }
    const exists = companyRelations.some(
      (r) =>
        r.relation === relType &&
        ((r.source === account.id && r.target === relTo) ||
          (r.source === relTo && r.target === account.id)),
    );
    if (exists) {
      setRelError("Ce lien existe déjà.");
      return;
    }
    upsertCompanyRelation({
      source: account.id,
      target: relTo,
      relation: relType,
    });
    setRelTo("");
  }

  function resetContactForm() {
    setCName("");
    setCTitle("");
    setCParent("");
    setCPersona(activePersonae[0]?.id ?? "");
    setCreatingContact(false);
  }

  function handleAddContact(e: FormEvent) {
    e.preventDefault();
    if (!account || account.type !== "Entreprise") return;
    if (!cName.trim() || !cPersona) return;
    const id = upsertContact({
      name: cName.trim(),
      title: cTitle.trim(),
      accountId: account.id,
      personaId: cPersona,
    });
    if (id) setContactParent(id, cParent || null);
    resetContactForm();
    if (id && onOpenContact) onOpenContact(id);
  }

  if (!account) {
    return (
      <div className="data-page account-detail-page">
        <header className="data-page-head">
          <div>
            <button type="button" className="ghost back-link" onClick={onBack}>
              ← Retour à la liste
            </button>
            <h1>Compte introuvable</h1>
          </div>
        </header>
      </div>
    );
  }

  function patch(
    next: Partial<{
      name: string;
      commercialStatus: CommercialStatus;
      holdingId: string | null;
      sector: string | undefined;
      size: AccountSize | undefined;
      ownerProfileId: string | null;
    }>,
  ) {
    upsertAccount({
      id: account!.id,
      name: next.name ?? account!.name,
      type: account!.type,
      commercialStatus: next.commercialStatus ?? account!.commercialStatus,
      holdingId:
        account!.type === "Holding"
          ? null
          : next.holdingId !== undefined
            ? next.holdingId
            : account!.holdingId,
      sector: next.sector !== undefined ? next.sector : account!.sector,
      size: next.size !== undefined ? next.size : account!.size,
      ownerProfileId:
        next.ownerProfileId !== undefined
          ? next.ownerProfileId
          : account!.ownerProfileId,
    });
  }

  return (
    <div className="data-page account-detail-page">
      <header className="data-page-head">
        <div>
          <button type="button" className="ghost back-link" onClick={onBack}>
            ← Retour à la liste
          </button>
          <h1>{account.name}</h1>
          <p>
            {accountTypeLabel[account.type]} ·{" "}
            {statusLabel(account.commercialStatus)}
            {holding ? ` · ${holding.name}` : ""}
            {!account.active ? " · désactivé" : ""}
          </p>
        </div>
        <div className="account-detail-actions">
          {account.active ? (
            <button
              type="button"
              className="ghost danger-text"
              onClick={() => removeAccount(account.id)}
            >
              Désactiver
            </button>
          ) : (
            <button
              type="button"
              className="ghost"
              onClick={() => restoreAccount(account.id)}
            >
              Réactiver
            </button>
          )}
        </div>
      </header>

      {kpis && (
        <section className="account-detail-kpis" aria-label="Indicateurs">
          <article>
            <span>CA installé</span>
            <strong>{formatEur(kpis.billedAmount)}</strong>
          </article>
          <article>
            <span>Pipeline</span>
            <strong>{formatEur(kpis.potentialAmount)}</strong>
          </article>
          <article>
            <span>Whitespace</span>
            <strong>{formatEur(kpis.whitespaceAmount)}</strong>
          </article>
          <article>
            <span>Renouvellements en cours</span>
            <strong>{formatEur(kpis.renewalAmount)}</strong>
          </article>
          <article>
            <span>Cible</span>
            <strong>{formatEur(kpis.targetAmount)}</strong>
          </article>
        </section>
      )}

      <nav className="plan-tabs" aria-label="Sections fiche entreprise">
        <button
          type="button"
          className={tab === "fiche" ? "active" : ""}
          onClick={() => setTab("fiche")}
        >
          Fiche
        </button>
        {account.type === "Entreprise" && (
          <button
            type="button"
            className={tab === "contacts" ? "active" : ""}
            onClick={() => setTab("contacts")}
          >
            Contacts
            {contactsOnAccount.length > 0
              ? ` (${contactsOnAccount.length})`
              : ""}
          </button>
        )}
        <button
          type="button"
          className={tab === "opportunites" ? "active" : ""}
          onClick={() => setTab("opportunites")}
        >
          Opportunités & influence
        </button>
        {account.type === "Entreprise" && (
          <button
            type="button"
            className={tab === "equipement" ? "active" : ""}
            onClick={() => setTab("equipement")}
          >
            Équipement
          </button>
        )}
        {account.type === "Entreprise" && (
          <button
            type="button"
            className={tab === "plan" ? "active" : ""}
            onClick={() => setTab("plan")}
          >
            Account plan
          </button>
        )}
        {account.type === "Holding" && (
          <button
            type="button"
            className={tab === "indicateurs" || tab === "plan" ? "active" : ""}
            onClick={() => setTab("indicateurs")}
          >
            Indicateurs
          </button>
        )}
      </nav>

      {tab === "opportunites" && (
        <AccountOpportunitiesInfluenceOverview
          accountId={account.id}
          onOpenOpportunity={() => onOpenOpportunities?.()}
          onOpenContact={onOpenContact}
        />
      )}

      {tab === "equipement" && account.type === "Entreprise" && (
        <AccountEquipmentPanel
          account={account}
          onOpenOpportunities={onOpenOpportunities}
        />
      )}

      {tab === "contacts" && account.type === "Entreprise" && (
        <section className="entry-subsection account-contacts-tab">
          <div className="account-contacts-tab-head">
            <div>
              <h2>Contacts · {account.name}</h2>
            </div>
            {!creatingContact && (
              <button
                type="button"
                className="primary-cta"
                onClick={() => setCreatingContact(true)}
              >
                Ajouter un contact
              </button>
            )}
          </div>

          {creatingContact && (
            <form className="entry-form" onSubmit={handleAddContact}>
              <div className="data-form-grid">
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
                    placeholder="CFO, CTO…"
                  />
                </label>
                <label>
                  Persona
                  <select
                    value={cPersona}
                    onChange={(e) => setCPersona(e.target.value)}
                    required
                  >
                    <option value="">Choisir…</option>
                    {activePersonae.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Parent / N+1 (opt.)
                  <select
                    value={cParent}
                    onChange={(e) => setCParent(e.target.value)}
                  >
                    <option value="">Aucun</option>
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
                  onClick={resetContactForm}
                >
                  Annuler
                </button>
                <button type="submit" className="primary-cta">
                  Créer{onOpenContact ? " et ouvrir" : ""}
                </button>
              </div>
            </form>
          )}

          {contactsOnAccount.length === 0 ? (
            <p className="muted">Aucun contact.</p>
          ) : (
            <ul className="entry-list account-contact-list">
              {contactsOnAccount.map((c) => {
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="entry-list-main"
                      onClick={() => onOpenContact?.(c.id)}
                      disabled={!onOpenContact}
                    >
                      <strong>{c.name}</strong>
                      <span className="meta">
                        {c.title || "Sans titre"}
                        {" · "}
                        {personaLabel(c.personaId)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "fiche" && (
        <>
          <section className="entry-subsection account-detail-fiche">
            <h2>Fiche</h2>
            <div className="data-form-grid">
              <label>
                Nom
                <input
                  value={account.name}
                  disabled={readOnly}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </label>
              <label>
                Type
                <input value={accountTypeLabel[account.type]} disabled />
              </label>
              <label>
                Statut
                <select
                  value={
                    account.commercialStatus === "Other"
                      ? "Prospect"
                      : account.commercialStatus
                  }
                  disabled={readOnly}
                  onChange={(e) =>
                    patch({
                      commercialStatus: e.target.value as CommercialStatus,
                    })
                  }
                >
                  {activeCommercialStatuses
                    .filter((s) => s.id !== "Other")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {statusLabel(s.id)}
                      </option>
                    ))}
                </select>
              </label>

              <label>
                Owner
                <select
                  value={account.ownerProfileId ?? ""}
                  disabled={readOnly || !canAssignOwner}
                  onChange={(e) => {
                    const ownerProfileId = e.target.value || null;
                    patch({ ownerProfileId });
                    assignOwnerForAccount(account.id, ownerProfileId);
                  }}
                >
                  <option value="">— Non rattaché —</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name
                        ? `${m.full_name} (${m.email})`
                        : m.email}
                    </option>
                  ))}
                  {account.ownerProfileId &&
                    !team.some((m) => m.id === account.ownerProfileId) && (
                      <option value={account.ownerProfileId}>
                        User inconnu / hors équipe
                      </option>
                    )}
                </select>
                <span className="muted" style={{ display: "block", marginTop: "0.35rem", fontSize: "0.85em" }}>
                  Contacts et opportunités liés sont rattachés au même owner.
                </span>
              </label>

              {account.type === "Entreprise" && (
                <label>
                  Groupe
                  <select
                    value={account.holdingId ?? ""}
                    onChange={(e) =>
                      patch({ holdingId: e.target.value || null })
                    }
                  >
                    <option value="">— Non rattaché —</option>
                    {holdings.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                Secteur
                <select
                  value={account.sector ?? ""}
                  onChange={(e) =>
                    patch({ sector: e.target.value || undefined })
                  }
                >
                  <option value="">—</option>
                  {activeSectors.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                  {account.sector &&
                    !activeSectors.some((s) => s.name === account.sector) && (
                      <option value={account.sector}>
                        {account.sector} (hors catalogue)
                      </option>
                    )}
                </select>
              </label>
              <label>
                Effectif (tranche)
                <select
                  value={account.size ?? ""}
                  onChange={(e) =>
                    patch({
                      size: (e.target.value || undefined) as
                        | AccountSize
                        | undefined,
                    })
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
          </section>

          {account.type === "Holding" && (
            <section className="entry-subsection">
              <h2>Entreprises du groupe</h2>
              {childEntreprises.length === 0 ? (
                <p className="muted">Aucune entreprise rattachée.</p>
              ) : (
                <ul className="entry-list account-child-list">
                  {childEntreprises.map((e) => (
                    <li key={e.id}>
                      <div>
                        <strong>{e.name}</strong>
                        <span className="meta">
                          {statusLabel(e.commercialStatus)}
                          {e.size ? ` · ${sizeLabel(e.size)}` : ""}
                        </span>
                      </div>
                      {onOpenAccount && (
                        <div className="entry-actions">
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => onOpenAccount(e.id)}
                          >
                            Ouvrir
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {canLinkEcosystem ? (
            <section className="entry-subsection">
              <h2>Concurrents & partenaires</h2>
              <p className="muted entry-hint">
                Lie ce compte à des entreprises au statut Concurrent ou
                Partenaire.
              </p>
              <ul className="entry-list">
                {ownRelations.length === 0 && (
                  <li className="muted">Aucun lien.</li>
                )}
                {ownRelations.map((r) => {
                  const otherId =
                    r.source === account.id ? r.target : r.source;
                  const other = accounts.find((a) => a.id === otherId);
                  return (
                    <li key={r.id}>
                      <div>
                        <strong>{companyRelationLabel[r.relation]}</strong>
                        <span className="meta">
                          {other ? (
                            onOpenAccount ? (
                              <button
                                type="button"
                                className="ghost linkish"
                                onClick={() => onOpenAccount(other.id)}
                              >
                                {other.name}
                              </button>
                            ) : (
                              other.name
                            )
                          ) : (
                            otherId
                          )}
                          {other
                            ? ` · ${statusLabel(other.commercialStatus)}`
                            : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => removeCompanyRelation(r.id)}
                      >
                        Retirer
                      </button>
                    </li>
                  );
                })}
              </ul>
              <form className="entry-form" onSubmit={handleAddRelation}>
                <div className="entry-grid">
                  <label>
                    Type de lien
                    <select
                      value={relType}
                      onChange={(e) =>
                        setRelType(e.target.value as EcosystemLinkType)
                      }
                    >
                      <option value="CompetitorOf">Concurrent</option>
                      <option value="PartnerOf">Partenaire</option>
                    </select>
                  </label>
                  <label>
                    Entreprise
                    <select
                      value={relTo}
                      onChange={(e) => setRelTo(e.target.value)}
                      required
                    >
                      <option value="">Choisir…</option>
                      {linkableAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {linkableAccounts.length === 0 ? (
                  <p className="muted">
                    Aucune entreprise au statut{" "}
                    {relType === "CompetitorOf" ? "Concurrent" : "Partenaire"}{" "}
                    à lier. Créez-en une d’abord.
                  </p>
                ) : null}
                {relError && <p className="entry-error">{relError}</p>}
                <button type="submit" disabled={linkableAccounts.length === 0}>
                  Ajouter le lien
                </button>
              </form>
            </section>
          ) : null}

          {account.type === "Entreprise" && (
            <section className="entry-subsection sold-on-fiche">
              <h2>Solutions vendues</h2>
              <SoldSolutionEditor accountId={account.id} allowPersonaPick />
            </section>
          )}

          {account.type === "Holding" && (
            <p className="muted">
              Solutions vendues : fiche d’une <strong>Entreprise</strong>.
            </p>
          )}
        </>
      )}

      {(tab === "plan" || tab === "indicateurs") && (
        <AccountPlanOverviewOnFiche
          accountId={account.id}
          onOpenOpportunities={onOpenOpportunities}
        />
      )}
    </div>
  );
}
