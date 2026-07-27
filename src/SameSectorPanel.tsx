import { useMemo } from "react";
import {
  type Account,
  type AccountSize,
} from "./data";
import { useOrgConfig } from "./config/ConfigContext";

export type PeerGroup = {
  /** Null si l’entreprise comparable n’a pas de groupe. */
  holding: Account | null;
  entreprises: Account[];
};

export type PeerFilters = {
  sameSector: boolean;
  sameEffectif: boolean;
};

/** Secteur résolu : champ fiche `sector`, sinon celui du groupe parent. */
export function resolveAccountSector(
  account: Account,
  accounts: Account[],
): string | null {
  const own = account.sector?.trim();
  if (own) return own;
  if (!account.holdingId) return null;
  const holding = accounts.find((a) => a.id === account.holdingId);
  return holding?.sector?.trim() || null;
}

/** Effectif résolu : champ fiche `size` de l’entreprise, sinon du groupe. */
export function resolveAccountEffectif(
  account: Account,
  accounts: Account[],
): AccountSize | null {
  if (account.type === "Entreprise") {
    if (account.size) return account.size;
    if (account.holdingId) {
      const holding = accounts.find((a) => a.id === account.holdingId);
      return holding?.size ?? null;
    }
    return null;
  }
  return account.size ?? null;
}

export function buildPeerGroups(
  accounts: Account[],
  focusAccountId: string | null,
  filters: PeerFilters,
): {
  sector: string | null;
  effectif: AccountSize | null;
  groups: PeerGroup[];
  hint: string | null;
} {
  if (!focusAccountId) {
    return { sector: null, effectif: null, groups: [], hint: null };
  }

  const focus = accounts.find((a) => a.id === focusAccountId) ?? null;
  if (!focus) {
    return { sector: null, effectif: null, groups: [], hint: null };
  }

  const focusHolding =
    focus.type === "Holding"
      ? focus
      : (accounts.find((a) => a.id === focus.holdingId) ?? null);
  const focusHoldingId = focusHolding?.id ?? null;

  const sector = resolveAccountSector(focus, accounts);
  const effectif = resolveAccountEffectif(focus, accounts);

  if (!filters.sameSector && !filters.sameEffectif) {
    return {
      sector,
      effectif,
      groups: [],
      hint: "Aucun critère.",
    };
  }

  if (filters.sameSector && !sector) {
    return {
      sector,
      effectif,
      groups: [],
      hint: "Aucun secteur renseigné sur ce compte.",
    };
  }
  if (filters.sameEffectif && !effectif) {
    return {
      sector,
      effectif,
      groups: [],
      hint: "Aucun effectif renseigné sur ce compte.",
    };
  }

  /** Entreprises hors du groupe cœur, matchées sur secteur et/ou effectif. */
  const peerEntreprises = accounts.filter((e) => {
    if (e.type !== "Entreprise" || e.active === false) return false;
    if (e.id === focus.id) return false;
    if (
      focusHoldingId &&
      (e.holdingId === focusHoldingId || e.id === focusHoldingId)
    ) {
      return false;
    }
    if (filters.sameSector && sector) {
      if (resolveAccountSector(e, accounts) !== sector) return false;
    }
    if (filters.sameEffectif && effectif) {
      if (resolveAccountEffectif(e, accounts) !== effectif) return false;
    }
    return true;
  });

  /** Regroupe pour l’affichage — le comparable reste l’entreprise, jamais le groupe. */
  const byHolding = new Map<string | null, Account[]>();
  for (const e of peerEntreprises) {
    const key = e.holdingId ?? null;
    const list = byHolding.get(key) ?? [];
    list.push(e);
    byHolding.set(key, list);
  }

  const groups: PeerGroup[] = [];
  for (const [holdingId, entreprises] of byHolding) {
    if (entreprises.length === 0) continue;
    const holding =
      holdingId == null
        ? null
        : (accounts.find(
            (a) =>
              a.id === holdingId &&
              a.type === "Holding" &&
              a.active !== false,
          ) ?? null);
    groups.push({ holding, entreprises });
  }

  groups.sort((a, b) => {
    const an = a.holding?.name ?? a.entreprises[0]?.name ?? "";
    const bn = b.holding?.name ?? b.entreprises[0]?.name ?? "";
    return an.localeCompare(bn, "fr");
  });

  return {
    sector,
    effectif,
    groups: groups.map((g) => ({
      ...g,
      entreprises: [...g.entreprises].sort((a, b) =>
        a.name.localeCompare(b.name, "fr"),
      ),
    })),
    hint: groups.length === 0 ? "Aucun comparable." : null,
  };
}

export default function SameSectorPanel({
  accounts,
  focusAccountId,
  onOpenAccount,
  filters,
  onFiltersChange,
}: {
  accounts: Account[];
  focusAccountId: string | null;
  onOpenAccount: (accountId: string) => void;
  filters: PeerFilters;
  onFiltersChange: (next: PeerFilters) => void;
}) {
  const { statusLabel, sizeLabel } = useOrgConfig();
  const peers = useMemo(
    () => buildPeerGroups(accounts, focusAccountId, filters),
    [accounts, focusAccountId, filters],
  );

  return (
    <section className="same-sector-panel" aria-label="Comptes comparables">
      <h3>Comparables</h3>
      <div className="peer-filters" role="group" aria-label="Critères">
        <label>
          <input
            type="checkbox"
            checked={filters.sameSector}
            onChange={(e) =>
              onFiltersChange({ ...filters, sameSector: e.target.checked })
            }
          />
          Même secteur
          {peers.sector ? <em>{peers.sector}</em> : null}
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.sameEffectif}
            onChange={(e) =>
              onFiltersChange({ ...filters, sameEffectif: e.target.checked })
            }
          />
          Même effectif
          {peers.effectif ? (
            <em>{sizeLabel(peers.effectif)}</em>
          ) : null}
        </label>
      </div>

      {peers.hint ? (
        <p className="muted">{peers.hint}</p>
      ) : (
        <ul className="same-sector-list">
          {peers.groups.map(({ holding, entreprises }) => (
            <li
              key={holding?.id ?? entreprises.map((e) => e.id).join("-")}
              className="same-sector-group"
            >
              {holding ? (
                <div className="same-sector-holding">
                  <strong>{holding.name}</strong>
                  <span className="muted">Groupe (contexte)</span>
                </div>
              ) : null}
              {entreprises.length > 0 && (
                <ul className="same-sector-entreprises">
                  {entreprises.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => onOpenAccount(e.id)}
                      >
                        {e.name}
                        <span>
                          {statusLabel(e.commercialStatus)}
                          {e.size ? ` · ${sizeLabel(e.size)}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
