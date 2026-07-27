import { useMemo } from "react";
import { engagementLabel, formatEur } from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import {
  opportunityKindLabel,
  useOpportunities,
  type Opportunity,
} from "./opportunities/OpportunityContext";

type Props = {
  accountId: string;
  /** Variante compacte pour le rail cartographie. */
  compact?: boolean;
  onOpenOpportunity?: (opportunityId: string) => void;
  onOpenContact?: (contactId: string) => void;
};

function openOpportunityDetail(opportunityId: string) {
  sessionStorage.setItem("powermap.openOppDetail", opportunityId);
}

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
  const { activeAccounts, activeContacts } = useDomain();
  const {
    activeContactTypes,
    contactTypeColor,
    contactTypeLabel,
    solutionLabel,
  } = useOrgConfig();
  const { activeOpportunities, setActiveOpportunityId } = useOpportunities();

  const account = activeAccounts.find((a) => a.id === accountId) ?? null;
  const isHolding = account?.type === "Holding";

  const scopedAccountIds = useMemo(() => {
    if (!account) return new Set<string>();
    if (isHolding) {
      return new Set(
        activeAccounts
          .filter((a) => a.type === "Entreprise" && a.holdingId === account.id)
          .map((a) => a.id),
      );
    }
    return new Set([account.id]);
  }, [account, isHolding, activeAccounts]);

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

  function handleOpenOpp(opp: Opportunity) {
    setActiveOpportunityId(opp.id);
    openOpportunityDetail(opp.id);
    onOpenOpportunity?.(opp.id);
  }

  if (!account) {
    return <p className="muted">Compte introuvable.</p>;
  }

  if (opportunities.length === 0) {
    return (
      <section
        className={`account-opp-influence ${compact ? "compact" : ""}`}
      >
        {!compact && <h2>Opportunités & influence</h2>}
        <p className="muted">
          Aucune opportunité active sur{" "}
          {isHolding ? "les entreprises du groupe" : "ce compte"}.
        </p>
      </section>
    );
  }

  return (
    <section className={`account-opp-influence ${compact ? "compact" : ""}`}>
      {!compact && (
        <>
          <h2>Opportunités & influence</h2>
          <p className="muted account-opp-influence-intro">
            Vue globale du compte : chaque opportunité et le niveau d’influence
            des contacts mappés (Economic Buyer, Champion, Influencer…).
          </p>
        </>
      )}
      {compact && (
        <h2>
          Opportunités
          <span className="account-opp-count"> ({opportunities.length})</span>
        </h2>
      )}

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
                    <span>{opportunityKindLabel[opp.kind]}</span>
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
                          <span className="account-opp-stake-role" style={{ color }}>
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

      {!compact && activeContactTypes.length > 0 && (
        <ul className="opp-stake-legend account-opp-legend" aria-label="Légende des rôles">
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
