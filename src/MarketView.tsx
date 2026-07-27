import {
  accountTypeLabel,
  aggregateKpis,
  formatEur,
  opportunitiesForAccountScope,
  salesForAccountScope,
  type AccountType,
  type CommercialStatus,
  type OppAmountSource,
} from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import { useSales } from "./sales/SalesContext";
import { useOpportunities } from "./opportunities/OpportunityContext";

type MarketColumn = "Client" | "Prospect";

const COLUMNS: {
  key: MarketColumn;
  title: string;
}[] = [
  { key: "Client", title: "Clients" },
  { key: "Prospect", title: "Prospects" },
];

function EntityCard({
  id,
  name,
  type,
  status,
  onSelect,
  nested,
}: {
  id: string;
  name: string;
  type: AccountType;
  status: CommercialStatus;
  onSelect: (id: string) => void;
  nested?: boolean;
}) {
  const { soldSolutions } = useSales();
  const { activeAccounts } = useDomain();
  const { solutionLabel, salesTaxonomy, statusLabel } = useOrgConfig();
  const { activeOpportunities } = useOpportunities();
  const kpis = aggregateKpis(
    salesForAccountScope(id, soldSolutions, activeAccounts),
    name,
    solutionLabel,
    opportunitiesForAccountScope(id, activeOpportunities, activeAccounts),
    undefined,
    salesTaxonomy,
  );
  return (
    <button
      type="button"
      className={`market-card ${nested ? "nested" : ""} status-${status.toLowerCase()}`}
      onClick={() => onSelect(id)}
    >
      <div className="market-card-head">
        <span className="market-card-type">
          {accountTypeLabel[type]}
        </span>
        <span className={`badge status-${status.toLowerCase()}`}>
          {statusLabel(status)}
        </span>
      </div>
      <strong>{name}</strong>
      <div className="market-card-kpis">
        <span>
          CA <b>{formatEur(kpis.billedAmount)}</b>
        </span>
        <span>
          Cible <b>{formatEur(kpis.targetAmount)}</b>
        </span>
        <span>
          Pot. <b>{formatEur(kpis.potentialAmount)}</b>
        </span>
        {kpis.whitespaceAmount > 0 && (
          <span>
            WS <b>{formatEur(kpis.whitespaceAmount)}</b>
          </span>
        )}
      </div>
      {kpis.bySolution.filter((s) => s.potentialAmount > 0 || s.targetAmount > 0)
        .length > 0 && (
        <div className="solution-chips">
          {kpis.bySolution
            .filter((s) => s.potentialAmount > 0 || s.targetAmount > 0)
            .slice(0, 3)
            .map((s) => (
              <span key={s.solutionId} className="solution-chip light">
                {s.name} ·{" "}
                {formatEur(
                  s.potentialAmount > 0 ? s.potentialAmount : s.targetAmount,
                )}
              </span>
            ))}
        </div>
      )}
    </button>
  );
}

export function useMarketKpis() {
  const { soldSolutions } = useSales();
  const { activeAccounts } = useDomain();
  const { solutionLabel, salesTaxonomy } = useOrgConfig();
  const { activeOpportunities } = useOpportunities();

  const byCol = COLUMNS.map((col) => {
    const holdings = activeAccounts.filter(
      (a) => a.type === "Holding" && a.commercialStatus === col.key,
    );
    const orphanEntreprises = activeAccounts.filter(
      (a) =>
        a.type === "Entreprise" &&
        a.commercialStatus === col.key &&
        (!a.holdingId ||
          activeAccounts.find((h) => h.id === a.holdingId)
            ?.commercialStatus !== col.key),
    );
    const nestedEntreprises = activeAccounts.filter(
      (a) =>
        a.type === "Entreprise" &&
        a.commercialStatus === col.key &&
        a.holdingId &&
        holdings.some((h) => h.id === a.holdingId),
    );
    const columnAccounts = [...holdings, ...nestedEntreprises, ...orphanEntreprises];
    const lines = columnAccounts.flatMap((a) =>
      a.type === "Holding"
        ? salesForAccountScope(a.id, soldSolutions, activeAccounts).filter(
            (s) => s.accountId === a.id,
          )
        : salesForAccountScope(a.id, soldSolutions, activeAccounts),
    );
    const seen = new Set<string>();
    const unique = lines.filter((l) => {
      if (seen.has(l.id)) return false;
      seen.add(l.id);
      return true;
    });
    const accountIds = new Set(columnAccounts.map((a) => a.id));
    for (const a of columnAccounts) {
      if (a.type === "Holding") {
        for (const child of activeAccounts) {
          if (child.holdingId === a.id) accountIds.add(child.id);
        }
      }
    }
    const opps = activeOpportunities.filter((o) =>
      accountIds.has(o.primaryAccountId),
    );
    return aggregateKpis(unique, col.title, solutionLabel, opps, undefined, salesTaxonomy);
  });

  const allLines = byCol.flatMap((k) => k.lines);
  const seen = new Set<string>();
  const unique = allLines.filter((l) => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });

  /** Décomposition du potentiel (pipeline opportunités) par type de compte. */
  const growthBuckets = (() => {
    const clients: typeof soldSolutions = [];
    const groupes: typeof soldSolutions = [];
    const prospects: typeof soldSolutions = [];
    const clientOpps: OppAmountSource[] = [];
    const groupeOpps: OppAmountSource[] = [];
    const prospectOpps: OppAmountSource[] = [];
    const activeLines = soldSolutions.filter((s) => {
      const acc = activeAccounts.find((a) => a.id === s.accountId);
      return !!acc;
    });
    for (const line of activeLines) {
      const acc = activeAccounts.find((a) => a.id === line.accountId)!;
      if (acc.type === "Entreprise" && acc.commercialStatus === "Client") {
        clients.push(line);
      } else if (
        acc.type === "Entreprise" &&
        acc.commercialStatus === "Prospect"
      ) {
        prospects.push(line);
      } else {
        groupes.push(line);
      }
    }
    for (const o of activeOpportunities) {
      const acc = activeAccounts.find((a) => a.id === o.primaryAccountId);
      if (!acc) continue;
      if (acc.type === "Entreprise" && acc.commercialStatus === "Client") {
        clientOpps.push(o);
      } else if (
        acc.type === "Entreprise" &&
        acc.commercialStatus === "Prospect"
      ) {
        prospectOpps.push(o);
      } else {
        groupeOpps.push(o);
      }
    }
    return {
      clients: aggregateKpis(clients, "Clients", solutionLabel, clientOpps, undefined, salesTaxonomy),
      groupes: aggregateKpis(groupes, "Groupes", solutionLabel, groupeOpps, undefined, salesTaxonomy),
      prospects: aggregateKpis(
        prospects,
        "Prospects",
        solutionLabel,
        prospectOpps,
        undefined,
        salesTaxonomy,
      ),
      total: aggregateKpis(
        activeLines,
        "Croissance",
        solutionLabel,
        activeOpportunities,
        undefined,
        salesTaxonomy,
      ),
    };
  })();

  return {
    global: aggregateKpis(
      unique,
      "Marché",
      solutionLabel,
      activeOpportunities,
      undefined,
      salesTaxonomy,
    ),
    clients: byCol[0],
    prospects: byCol[1],
    growth: growthBuckets,
  };
}

export default function MarketView({
  onOpenAccount,
}: {
  onOpenAccount: (accountId: string) => void;
}) {
  const { soldSolutions } = useSales();
  const { activeAccounts } = useDomain();
  const { solutionLabel, salesTaxonomy } = useOrgConfig();
  const { activeOpportunities } = useOpportunities();

  return (
    <div className="market-board">
      {COLUMNS.map((col) => {
        const holdings = activeAccounts.filter(
          (a) => a.type === "Holding" && a.commercialStatus === col.key,
        );
        const orphanEntreprises = activeAccounts.filter(
          (a) =>
            a.type === "Entreprise" &&
            a.commercialStatus === col.key &&
            (!a.holdingId ||
              activeAccounts.find((h) => h.id === a.holdingId)
                ?.commercialStatus !== col.key),
        );

        const columnAccounts = [...holdings, ...orphanEntreprises];
        const lines = columnAccounts.flatMap((a) =>
          salesForAccountScope(a.id, soldSolutions, activeAccounts),
        );
        const seen = new Set<string>();
        const unique = lines.filter((l) => {
          if (seen.has(l.id)) return false;
          seen.add(l.id);
          return true;
        });
        const accountIds = new Set(columnAccounts.map((a) => a.id));
        for (const a of holdings) {
          for (const child of activeAccounts) {
            if (child.holdingId === a.id) accountIds.add(child.id);
          }
        }
        const opps = activeOpportunities.filter((o) =>
          accountIds.has(o.primaryAccountId),
        );
        const colKpis = aggregateKpis(
          unique,
          col.title,
          solutionLabel,
          opps,
          undefined,
          salesTaxonomy,
        );

        return (
          <section key={col.key} className="market-column">
            <header className="market-column-head">
              <h2>{col.title}</h2>
              <p>
                CA <strong>{formatEur(colKpis.billedAmount)}</strong>
                {" · "}
                Pot. <strong>{formatEur(colKpis.potentialAmount)}</strong>
              </p>
            </header>
            <div className="market-column-body">
              {holdings.map((h) => {
                const children = activeAccounts.filter(
                  (a) => a.type === "Entreprise" && a.holdingId === h.id,
                );
                return (
                  <div key={h.id} className="market-group">
                    <EntityCard
                      id={h.id}
                      name={h.name}
                      type={h.type}
                      status={h.commercialStatus}
                      onSelect={onOpenAccount}
                    />
                    {children.map((c) => (
                      <EntityCard
                        key={c.id}
                        id={c.id}
                        name={c.name}
                        type={c.type}
                        status={c.commercialStatus}
                        onSelect={onOpenAccount}
                        nested
                      />
                    ))}
                  </div>
                );
              })}
              {orphanEntreprises.map((a) => (
                <EntityCard
                  key={a.id}
                  id={a.id}
                  name={a.name}
                  type={a.type}
                  status={a.commercialStatus}
                  onSelect={onOpenAccount}
                />
              ))}
              {holdings.length === 0 && orphanEntreprises.length === 0 && (
                <p className="muted">Aucun compte.</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
