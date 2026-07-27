import { useEffect, useMemo, useRef, useState } from "react";
import type { Account } from "./data";
import { accountTypeLabel } from "./data";

type AccountOption = {
  id: string;
  name: string;
  type: Account["type"];
  holdingName?: string;
  status?: string;
};

export default function AccountSearchSelect({
  accounts,
  value,
  onChange,
  ariaLabel = "Compte affiché",
}: {
  accounts: Account[];
  value: string | null;
  onChange: (accountId: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => {
    const holdings = accounts
      .filter((a) => a.type === "Holding")
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    const byHolding = new Map(holdings.map((h) => [h.id, h.name]));
    const entreprises = accounts
      .filter((a) => a.type === "Entreprise")
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    const list: AccountOption[] = [
      ...holdings.map((h) => ({
        id: h.id,
        name: h.name,
        type: h.type,
        status: h.commercialStatus,
      })),
      ...entreprises.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        holdingName: e.holdingId
          ? byHolding.get(e.holdingId)
          : undefined,
        status: e.commercialStatus,
      })),
    ];
    return list;
  }, [accounts]);

  const selected = options.find((o) => o.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay =
        `${o.name} ${o.holdingName ?? ""} ${accountTypeLabel[o.type]}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  return (
    <div className={`account-search-select${open ? " open" : ""}`} ref={rootRef}>
      <span className="account-search-field-label" id="account-search-label">
        Compte
      </span>
      <button
        type="button"
        className="account-search-trigger"
        aria-labelledby="account-search-label"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="account-search-label">
          {selected ? (
            <>
              <strong>{selected.name}</strong>
              <em>
                {selected.type === "Holding"
                  ? accountTypeLabel.Holding
                  : selected.holdingName
                    ? `Entreprise · ${selected.holdingName}`
                    : accountTypeLabel.Entreprise}
              </em>
            </>
          ) : (
            <strong>Choisir…</strong>
          )}
        </span>
        <span className="account-search-chevron" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="account-search-popover" role="listbox">
          <input
            ref={inputRef}
            type="search"
            className="account-search-input"
            value={query}
            placeholder="Rechercher un compte…"
            aria-label="Rechercher un compte"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered[0]) {
                onChange(filtered[0].id);
                setOpen(false);
                setQuery("");
              }
            }}
          />
          <ul className="account-search-list">
            {filtered.length === 0 && (
              <li className="account-search-empty muted">Aucun compte</li>
            )}
            {filtered.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.id === value}
                  className={o.id === value ? "active" : ""}
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <strong>{o.name}</strong>
                  <span>
                    {o.type === "Holding"
                      ? accountTypeLabel.Holding
                      : o.holdingName
                        ? `Entreprise · ${o.holdingName}`
                        : accountTypeLabel.Entreprise}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
