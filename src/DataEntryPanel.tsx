import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  getContactParentId,
  accountTypeLabel,
  formatEur,
} from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import { useSales } from "./sales/SalesContext";
import { useOpportunities } from "./opportunities/OpportunityContext";
import { useAccountPlans } from "./accountPlans/AccountPlanContext";
import AccountOnboardingWizard from "./AccountOnboardingWizard";
import AccountDetailPage from "./AccountDetailPage";
import ContactDetailPage from "./ContactDetailPage";
import OpportunityPage from "./OpportunityPage";
import SearchFilterBar, { matchesQuery } from "./SearchFilterBar";
import {
  resolveAccountEffectif,
  resolveAccountSector,
} from "./SameSectorPanel";
import type { AppPage } from "./navigation";

export type DataSection =
  | "entreprises"
  | "contacts"
  | "opportunites";

export const DATA_SECTIONS: {
  id: DataSection;
  label: string;
}[] = [
  { id: "entreprises", label: "Entreprises" },
  { id: "contacts", label: "Contacts" },
  { id: "opportunites", label: "Opportunités" },
];

const SECTIONS = DATA_SECTIONS;

export default function DataEntryPanel({
  section,
  onNavigate,
}: {
  section: DataSection;
  onNavigate?: (page: AppPage) => void;
}) {
  if (section === "opportunites") {
    return <OpportunityPage />;
  }

  return (
    <DataEntryPanelInner
      section={section}
      onNavigate={onNavigate}
      onPlanCreated={(planId) => {
        sessionStorage.setItem("powermap.openPlanId", planId);
        onNavigate?.("account-plans");
      }}
    />
  );
}

function DataEntryPanelInner({
  section,
  onNavigate,
  onPlanCreated,
}: {
  section: Exclude<DataSection, "opportunites">;
  onNavigate?: (page: AppPage) => void;
  onPlanCreated?: (planId: string) => void;
}) {
  const {
    accounts,
    activeAccounts,
    contacts,
    activeContacts,
    contactRelations,
    removeAccount,
    restoreAccount,
    upsertContact,
    removeContact,
    restoreContact,
    setContactParent,
  } = useDomain();
  const {
    activeDirections,
    activeSectors,
    statusLabel,
    sizeLabel,
    activeCommercialStatuses,
    activeAccountSizes,
  } = useOrgConfig();
  const { soldSolutions } = useSales();
  const { activeOpportunities } = useOpportunities();
  const { getPlanForAccount } = useAccountPlans();

  const entreprises = activeAccounts.filter((a) => a.type === "Entreprise");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [contactDetailId, setContactDetailId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingContact, setCreatingContact] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    if (section !== "entreprises") setDetailId(null);
  }, [section]);

  useEffect(() => {
    if (section !== "contacts") setContactDetailId(null);
  }, [section]);

  // Contact create form
  const [cName, setCName] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cAccount, setCAccount] = useState(entreprises[0]?.id ?? "");
  const [cDir, setCDir] = useState(activeDirections[0]?.id ?? "");
  const [cParent, setCParent] = useState("");

  const [accountFilters, setAccountFilters] = useState<Record<string, string>>({
    q: "",
    type: "",
    status: "",
    sector: "",
    size: "",
    active: "active",
  });
  const [contactFilters, setContactFilters] = useState<Record<string, string>>({
    q: "",
    accountId: "",
    directionId: "",
    active: "active",
  });

  useEffect(() => {
    if (section === "entreprises") {
      setAccountFilters({
        q: "",
        type: "",
        status: "",
        sector: "",
        size: "",
        active: "active",
      });
    }
    if (section === "contacts") {
      setContactFilters({
        q: "",
        accountId: "",
        directionId: "",
        active: "active",
      });
    }
  }, [section]);

  const filteredAccounts = useMemo(() => {
    const q = accountFilters.q ?? "";
    return accounts
      .filter((a) => {
        if (accountFilters.type && a.type !== accountFilters.type) return false;
        if (
          accountFilters.status &&
          a.commercialStatus !== accountFilters.status
        ) {
          return false;
        }
        if (accountFilters.sector) {
          const sector = resolveAccountSector(a, accounts);
          if (sector !== accountFilters.sector) return false;
        }
        if (accountFilters.size) {
          const size = resolveAccountEffectif(a, accounts);
          if (size !== accountFilters.size) return false;
        }
        if (accountFilters.active === "active" && !a.active) return false;
        if (accountFilters.active === "inactive" && a.active) return false;
        const holdingName = a.holdingId
          ? accounts.find((h) => h.id === a.holdingId)?.name
          : "";
        return matchesQuery(
          q,
          a.name,
          a.sector,
          holdingName,
          accountTypeLabel[a.type],
          statusLabel(a.commercialStatus),
        );
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [accounts, accountFilters]);

  const filteredContacts = useMemo(() => {
    const q = contactFilters.q ?? "";
    return contacts
      .filter((c) => {
        if (
          contactFilters.accountId &&
          c.accountId !== contactFilters.accountId
        ) {
          return false;
        }
        if (
          contactFilters.directionId &&
          c.directionId !== contactFilters.directionId
        ) {
          return false;
        }
        if (contactFilters.active === "active" && !c.active) return false;
        if (contactFilters.active === "inactive" && c.active) return false;
        const account = accounts.find((a) => a.id === c.accountId);
        const dirLabel =
          activeDirections.find((d) => d.id === c.directionId)?.name ?? "";
        return matchesQuery(
          q,
          c.name,
          c.title,
          c.email,
          c.phone,
          account?.name,
          dirLabel,
        );
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [
    contacts,
    contactFilters,
    accounts,
    activeDirections,
  ]);

  useEffect(() => {
    if (!cAccount && entreprises[0]) setCAccount(entreprises[0].id);
  }, [entreprises, cAccount]);

  useEffect(() => {
    if (!cDir && activeDirections[0]) setCDir(activeDirections[0].id);
  }, [activeDirections, cDir]);

  function resetContactForm() {
    setCName("");
    setCTitle("");
    setCEmail("");
    setCPhone("");
    setCParent("");
    setCAccount(entreprises[0]?.id ?? "");
    setCDir(activeDirections[0]?.id ?? "");
  }

  const submitContactCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!cName.trim() || !cAccount || !cDir) return;
    const entreprise = activeAccounts.find((a) => a.id === cAccount);
    if (!entreprise || entreprise.type !== "Entreprise") return;
    const id = upsertContact({
      name: cName,
      title: cTitle,
      email: cEmail,
      phone: cPhone,
      directionId: cDir,
      accountId: cAccount,
    });
    if (id) setContactParent(id, cParent || null);
    resetContactForm();
    setCreatingContact(false);
    setContactDetailId(id);
  };

  const meta = SECTIONS.find((s) => s.id === section);

  if (section === "entreprises" && detailId) {
    return (
      <AccountDetailPage
        accountId={detailId}
        onBack={() => setDetailId(null)}
        onOpenAccount={setDetailId}
        onOpenContact={(contactId) => {
          setDetailId(null);
          setContactDetailId(contactId);
          onNavigate?.("contacts");
        }}
        onOpenOpportunities={() => onNavigate?.("opportunites")}
      />
    );
  }

  if (section === "contacts" && contactDetailId) {
    return (
      <ContactDetailPage
        contactId={contactDetailId}
        onBack={() => setContactDetailId(null)}
        onOpenContact={setContactDetailId}
        onOpenAccount={(accountId) => {
          setContactDetailId(null);
          setDetailId(accountId);
          onNavigate?.("entreprises");
        }}
      />
    );
  }

  return (
    <div className="data-page">
      <header className="data-page-head">
        <div>
          <h1>{meta?.label ?? "Saisie"}</h1>
        </div>
        {section === "entreprises" && (
          <button
            type="button"
            className="primary-cta"
            onClick={() => setCreating(true)}
          >
            Ajouter une entreprise
          </button>
        )}
        {section === "contacts" && (
          <button
            type="button"
            className="primary-cta"
            onClick={() => setCreatingContact(true)}
            disabled={entreprises.length === 0}
            title={
              entreprises.length === 0
                ? "Crée d’abord une entreprise"
                : undefined
            }
          >
            Ajouter un contact
          </button>
        )}
      </header>

      <div className="data-page-body">
        {section === "entreprises" && (
          <>
            <SearchFilterBar
              values={accountFilters}
              onChange={(id, value) =>
                setAccountFilters((prev) => ({ ...prev, [id]: value }))
              }
              resultCount={filteredAccounts.length}
              resultLabel="entreprise"
              fields={[
                {
                  id: "q",
                  kind: "search",
                  placeholder: "Rechercher une entreprise…",
                },
                {
                  id: "type",
                  kind: "select",
                  label: "Type",
                  options: [
                    { value: "Holding", label: "Groupe" },
                    { value: "Entreprise", label: "Entreprise" },
                  ],
                },
                {
                  id: "status",
                  kind: "select",
                  label: "Statut",
                  options: activeCommercialStatuses.map((s) => ({
                    value: s.id,
                    label: statusLabel(s.id),
                  })),
                },
                {
                  id: "sector",
                  kind: "select",
                  label: "Secteur",
                  options: activeSectors.map((s) => ({
                    value: s.name,
                    label: s.name,
                  })),
                },
                {
                  id: "size",
                  kind: "select",
                  label: "Effectif",
                  options: activeAccountSizes.map((s) => ({
                    value: s.id,
                    label: sizeLabel(s.id),
                  })),
                },
                {
                  id: "active",
                  kind: "select",
                  label: "État",
                  allLabel: "Tous",
                  options: [
                    { value: "active", label: "Actifs" },
                    { value: "inactive", label: "Désactivés" },
                  ],
                },
              ]}
            />
            {filteredAccounts.length === 0 ? (
              <p className="muted">Aucun résultat.</p>
            ) : (
              <div className="ecosystem-table-wrap account-plan-table-wrap">
                <table className="ecosystem-table account-plan-table">
                  <thead>
                    <tr>
                      <th>Entreprise</th>
                      <th>Type</th>
                      <th>Statut</th>
                      <th>Account plan</th>
                      <th>Montant opportunités</th>
                      <th>CA actuel</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.map((a) => {
                      const plan = getPlanForAccount(a.id);
                      const oppAmount = activeOpportunities
                        .filter((o) => o.primaryAccountId === a.id)
                        .reduce((sum, o) => sum + (o.amount || 0), 0);
                      const currentRevenue = soldSolutions
                        .filter((s) => s.accountId === a.id)
                        .reduce((sum, s) => sum + (s.billedAmount || 0), 0);
                      return (
                        <tr key={a.id} className={!a.active ? "inactive" : ""}>
                          <td>
                            <strong>{a.name}</strong>
                            {(() => {
                              const size = resolveAccountEffectif(a, accounts);
                              const sector = resolveAccountSector(a, accounts);
                              const holding = a.holdingId
                                ? accounts.find((h) => h.id === a.holdingId)?.name
                                : "";
                              const meta = [holding, size ? sizeLabel(size) : "", sector]
                                .filter(Boolean)
                                .join(" · ");
                              return meta ? <span className="meta">{meta}</span> : null;
                            })()}
                          </td>
                          <td>{accountTypeLabel[a.type]}</td>
                          <td>{statusLabel(a.commercialStatus)}</td>
                          <td>
                            {plan ? (
                              <span className="meta">
                                {plan.status}
                                {plan.dueDate ? ` · ${plan.dueDate}` : ""}
                              </span>
                            ) : (
                              <span className="muted">Aucun</span>
                            )}
                          </td>
                          <td className="num">
                            {oppAmount > 0 ? formatEur(oppAmount) : "—"}
                          </td>
                          <td className="num">
                            {currentRevenue > 0 ? formatEur(currentRevenue) : "—"}
                          </td>
                          <td>
                            <div className="entry-actions">
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => setDetailId(a.id)}
                              >
                                Ouvrir
                              </button>
                              {a.active ? (
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() => removeAccount(a.id)}
                                >
                                  Désactiver
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() => restoreAccount(a.id)}
                                >
                                  Réactiver
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {creating && (
              <AccountOnboardingWizard
                mode="create"
                onClose={() => {
                  setCreating(false);
                  if (createdId) {
                    setDetailId(createdId);
                    setCreatedId(null);
                  }
                }}
                onAccountSaved={(id) => setCreatedId(id)}
                onPlanCreated={(planId) => {
                  setCreatedId(null);
                  onPlanCreated?.(planId);
                }}
              />
            )}

          </>
        )}

        {section === "contacts" && (
          <>
            <SearchFilterBar
              values={contactFilters}
              onChange={(id, value) =>
                setContactFilters((prev) => ({ ...prev, [id]: value }))
              }
              resultCount={filteredContacts.length}
              resultLabel="contact"
              fields={[
                {
                  id: "q",
                  kind: "search",
                  placeholder: "Rechercher un contact…",
                },
                {
                  id: "accountId",
                  kind: "select",
                  label: "Entreprise",
                  options: entreprises
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
                    .map((a) => ({ value: a.id, label: a.name })),
                },
                {
                  id: "directionId",
                  kind: "select",
                  label: "Direction",
                  options: activeDirections.map((d) => ({
                    value: d.id,
                    label: d.name,
                  })),
                },
                {
                  id: "active",
                  kind: "select",
                  label: "État",
                  allLabel: "Tous",
                  options: [
                    { value: "active", label: "Actifs" },
                    { value: "inactive", label: "Désactivés" },
                  ],
                },
              ]}
            />
            <ul className="entry-list">
              {filteredContacts.length === 0 && (
                <li className="muted">Aucun résultat.</li>
              )}
              {filteredContacts.map((c) => {
                  const parentId = getContactParentId(c.id, contactRelations);
                  const parent = parentId
                    ? activeContacts.find((p) => p.id === parentId)
                    : null;
                  const account = accounts.find((a) => a.id === c.accountId);
                  const dirLabel =
                    activeDirections.find((d) => d.id === c.directionId)
                      ?.name ?? "";
                  return (
                    <li key={c.id} className={!c.active ? "inactive" : ""}>
                      <button
                        type="button"
                        className="entry-list-main"
                        onClick={() => setContactDetailId(c.id)}
                      >
                        <strong>{c.name}</strong>
                        <span className="meta">
                          {c.title ? `${c.title} · ` : ""}
                          {c.email ? `${c.email} · ` : ""}
                          {c.phone ? `${c.phone} · ` : ""}
                          {dirLabel}
                          {account ? ` · ${account.name}` : ""}
                          {parent ? ` · parent : ${parent.name}` : ""}
                        </span>
                      </button>
                      <div className="entry-actions">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setContactDetailId(c.id)}
                        >
                          Ouvrir
                        </button>
                        {c.active ? (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => removeContact(c.id)}
                          >
                            Désactiver
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => restoreContact(c.id)}
                          >
                            Réactiver
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>

            {creatingContact && (
              <div
                className="plan-create-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="contact-create-title"
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setCreatingContact(false);
                    resetContactForm();
                  }
                }}
              >
                <form
                  className="plan-create-dialog"
                  onSubmit={submitContactCreate}
                >
                  <h2 id="contact-create-title">Nouveau contact</h2>
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
                      E-mail
                      <input
                        type="email"
                        value={cEmail}
                        onChange={(e) => setCEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </label>
                    <label>
                      Téléphone
                      <input
                        type="tel"
                        value={cPhone}
                        onChange={(e) => setCPhone(e.target.value)}
                        autoComplete="tel"
                      />
                    </label>
                    <label>
                      Entreprise
                      <select
                        value={cAccount}
                        onChange={(e) => {
                          setCAccount(e.target.value);
                          setCDir(activeDirections[0]?.id ?? "");
                        }}
                        required
                      >
                        {entreprises.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
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
                        {activeContacts.map((c) => (
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
                      onClick={() => {
                        setCreatingContact(false);
                        resetContactForm();
                      }}
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

            <p className="muted entry-hint">
              Les liens de réseau métier (influence, alliés…) se saisissent
              dans la fiche de chaque contact.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
