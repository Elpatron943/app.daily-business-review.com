import type { ReactNode } from "react";

export type SearchFilterOption = { value: string; label: string };

export type SearchFilterField =
  | {
      id: string;
      kind: "search";
      label?: string;
      placeholder?: string;
    }
  | {
      id: string;
      kind: "select";
      label: string;
      options: SearchFilterOption[];
      /** Valeur = tous / aucun filtre. */
      allLabel?: string;
    };

type Props = {
  fields: SearchFilterField[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  /** Nombre d’éléments après filtre. */
  resultCount?: number;
  /** Libellé singulier (ex. « opportunité »). */
  resultLabel?: string;
  /** Libellé pluriel si différent du singulier + « s ». */
  resultLabelPlural?: string;
  trailing?: ReactNode;
};

/** Barre de recherche + filtres select pour les listes menu. */
export default function SearchFilterBar({
  fields,
  values,
  onChange,
  resultCount,
  resultLabel = "résultat",
  resultLabelPlural,
  trailing,
}: Props) {
  const hasActive = fields.some((f) => (values[f.id] ?? "").trim() !== "");
  const countLabel =
    typeof resultCount === "number"
      ? resultCount === 1
        ? resultLabel
        : (resultLabelPlural ?? `${resultLabel}s`)
      : null;

  return (
    <div className="search-filter-bar" role="search">
      <div className="search-filter-fields">
        {fields.map((field) => {
          if (field.kind === "search") {
            return (
              <label key={field.id} className="search-filter-search">
                <span className="sr-only">{field.label ?? "Recherche"}</span>
                <input
                  type="search"
                  value={values[field.id] ?? ""}
                  placeholder={field.placeholder ?? "Rechercher…"}
                  onChange={(e) => onChange(field.id, e.target.value)}
                />
              </label>
            );
          }
          return (
            <label key={field.id} className="search-filter-select">
              <span>{field.label}</span>
              <select
                value={values[field.id] ?? ""}
                onChange={(e) => onChange(field.id, e.target.value)}
              >
                <option value="">{field.allLabel ?? "Tous"}</option>
                {field.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <div className="search-filter-meta">
        {typeof resultCount === "number" && countLabel && (
          <span className="muted">
            {resultCount} {countLabel}
          </span>
        )}
        {hasActive && (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              for (const f of fields) onChange(f.id, "");
            }}
          >
            Réinitialiser
          </button>
        )}
        {trailing}
      </div>
    </div>
  );
}

export function matchesQuery(
  query: string,
  ...parts: (string | null | undefined)[]
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return parts.some((p) => (p ?? "").toLowerCase().includes(q));
}
