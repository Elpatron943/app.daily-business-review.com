import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  accountTypeLabel,
  companyRelationLabel,
  formatEur,
  salesForAccountScope,
  opportunitiesForAccountScope,
  aggregateKpis,
  ECOSYSTEM_COMPANY_RELATIONS,
  type AccountSize,
  type CommercialStatus,
  type CompanyRelationType,
} from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import { useSales } from "./sales/SalesContext";
import AccountPlanOverviewOnFiche from "./accountPlans/AccountPlanOverviewOnFiche";
import AccountOpportunitiesInfluenceOverview from "./AccountOpportunitiesInfluenceOverview";
import AccountEquipmentPanel from "./AccountEquipmentPanel";
import SoldSolutionEditor from "./SoldSolutionEditor";
import TargetResearchPanel from "./research/TargetResearchPanel";
import { useOpportunities } from "./opportunities/OpportunityContext";

const COMPANY_REL_GROUPS: { label: string; types: CompanyRelationType[] }[] = [
  {
    label: "Écosystème",
    types: [...ECOSYSTEM_COMPANY_RELATIONS],
  },
  {
    label: "Autres liens",
    types: ["SupplierOf", "CustomerOf", "InvestorIn"],
  },
];

type Tab =
  | "fiche"
  | "plan"
  | "indicateurs"
  | "recherche"
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
    activeDirections,
    salesTaxonomy,
    statusLabel,
    sizeLabel,
    activeCommercialStatuses,
    activeAccountSizes,
  } = useOrgConfig();
  const { soldSolutions } = useSales();
  const { activeOpportunities } = useOpportunities();
  const [tab, setTab] = useState<Tab>("fiche");
  const [relTo, setRelTo] = useState("");
  const [relType, setRelType] = useState<CompanyRelationType>("PartnerOf");
  const [relDirection, setRelDirection] = useState<"out" | "in">("out");
  const [relError, setRelError] = useState("");

  const [cName, setCName] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cDir, setCDir] = useState("");
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
      (r) => r.source === account.id || r.target === account.id,
    );
  }, [account, companyRelations]);

  const linkableAccounts = useMemo(() => {
    if (!account) return [];
    return activeAccounts
      .filter((a) => a.id !== account.id)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [account, activeAccounts]);

  useEffect(() => {
    if (
      account?.type === "Holding" &&
      (tab === "plan" || tab === "contacts" || tab === "equipement")
    ) {
      setTab("fiche");
    }
  }, [account?.type, tab]);

  useEffect(() => {
    if (!cDir && activeDirections[0]) setCDir(activeDirections[0].id);
  }, [activeDirections, cDir]);

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
    if (!account || !relTo) return;
    if (relTo === account.id) {
      setRelError("Choisis un autre compte.");
      return;
    }
    const source = relDirection === "out" ? account.id : relTo;
    const target = relDirection === "out" ? relTo : account.id;
    const exists = companyRelations.some(
      (r) =>
        r.relation === relType &&
        ((r.source === source && r.target === target) ||
          (r.source === target && r.target === source)),
    );
    if (exists) {
      setRelError("Ce lien existe déjà (dans un sens ou l’autre).");
      return;
    }
    upsertCompanyRelation({
      source,
      target,
      relation: relType,
    });
    setRelTo("");
  }

  function resetContactForm() {
    setCName("");
    setCTitle("");
    setCParent("");
    setCDir(activeDirections[0]?.id ?? "");
    setCreatingContact(false);
  }

  function handleAddContact(e: FormEvent) {
    e.preventDefault();
    if (!account || account.type !== "Entreprise") return;
    if (!cName.trim() || !cDir) return;
    const id = upsertContact({
      name: cName.trim(),
      title: cTitle.trim(),
      accountId: account.id,
      directionId: cDir,
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
            <span>Renouvellement</span>
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
        <button
          type="button"
          className={tab === "recherche" ? "active" : ""}
          onClick={() => setTab("recherche")}
        >
          Recherche
          {account.researchBrief?.updatedAt ? " ·" : ""}
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

      {tab === "recherche" && <TargetResearchPanel account={account} />}

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
                  Direction
                  <select
                    value={cDir}
                    onChange={(e) => setCDir(e.target.value)}
                    required
                  >
                    <option value="">Choisir…</option>
                    {activeDirections.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
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
                        {activeDirections.find((d) => d.id === c.directionId)
                          ?.name ?? c.directionId}
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
                  value={account.commercialStatus}
                  onChange={(e) =>
                    patch({
                      commercialStatus: e.target.value as CommercialStatus,
                    })
                  }
                >
                  {activeCommercialStatuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {statusLabel(s.id)}
                    </option>
                  ))}
                </select>
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

          {account.type === "Entreprise" && (
            <section className="entry-subsection sold-on-fiche">
              <h2>Solutions vendues</h2>
              <SoldSolutionEditor accountId={account.id} allowDirectionPick />
            </section>
          )}

          {account.type === "Holding" && (
            <p className="muted">
              Solutions vendues : fiche d’une <strong>Entreprise</strong>.
            </p>
          )}

          <section className="entry-subsection">
            <h2>Relations & écosystème</h2>
            <p className="muted entry-hint">
              Partenaires, concurrents, même secteur et autres liens business —
              saisis ici (plus de page Écosystème dédiée).
            </p>
            <ul className="entry-list">
              {ownRelations.length === 0 && (
                <li className="muted">Aucun lien.</li>
              )}
              {ownRelations.map((r) => {
                const otherId =
                  r.source === account.id ? r.target : r.source;
                const other = accounts.find((a) => a.id === otherId);
                const outbound = r.source === account.id;
                return (
                  <li key={r.id}>
                    <div>
                      <strong>
                        {outbound ? "→" : "←"}{" "}
                        {companyRelationLabel[r.relation]}
                      </strong>
                      <span className="meta">
                        {outbound ? "vers" : "depuis"}{" "}
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
                          ? ` · ${accountTypeLabel[other.type]}`
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
                  Sens
                  <select
                    value={relDirection}
                    onChange={(e) =>
                      setRelDirection(e.target.value as "out" | "in")
                    }
                  >
                    <option value="out">Ce compte → autre</option>
                    <option value="in">Autre → ce compte</option>
                  </select>
                </label>
                <label>
                  Type
                  <select
                    value={relType}
                    onChange={(e) =>
                      setRelType(e.target.value as CompanyRelationType)
                    }
                  >
                    {COMPANY_REL_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.types.map((t) => (
                          <option key={t} value={t}>
                            {companyRelationLabel[t]}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label>
                  Autre compte
                  <select
                    value={relTo}
                    onChange={(e) => setRelTo(e.target.value)}
                    required
                  >
                    <option value="">Choisir…</option>
                    {linkableAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {accountTypeLabel[a.type]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {relError && <p className="entry-error">{relError}</p>}
              <button type="submit">Ajouter le lien</button>
            </form>
          </section>
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
