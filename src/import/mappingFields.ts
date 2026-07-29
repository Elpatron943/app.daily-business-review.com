import { normalizeHeader, type CsvTable } from "./csv";

export type ImportEntityKind =
  | "accounts"
  | "contacts"
  | "opportunities"
  | "sold_solutions";

export type DbrImportField = {
  id: string;
  label: string;
  required?: boolean;
};

/** Champs DBR cibles par type d’entité. */
export const DBR_IMPORT_FIELDS: Record<ImportEntityKind, DbrImportField[]> = {
  accounts: [
    { id: "external_key", label: "Clé externe (Cle) — optionnel si = Nom", required: false },
    { id: "name", label: "Nom", required: true },
    { id: "type", label: "Type (Holding / Entreprise)" },
    { id: "status", label: "Statut commercial" },
    { id: "holding_key", label: "Clé du groupe" },
    { id: "sector", label: "Secteur" },
    { id: "size", label: "Effectif" },
  ],
  contacts: [
    { id: "external_key", label: "Clé externe (Cle) — optionnel si = Nom", required: false },
    { id: "name", label: "Nom", required: true },
    { id: "title", label: "Titre / fonction" },
    { id: "account_key", label: "Clé entreprise", required: true },
    { id: "direction", label: "Direction" },
    { id: "email", label: "E-mail" },
    { id: "phone", label: "Téléphone" },
  ],
  opportunities: [
    { id: "external_key", label: "Clé externe (Cle) — optionnel si = Nom", required: false },
    { id: "name", label: "Nom", required: true },
    { id: "account_key", label: "Clé entreprise", required: true },
    { id: "amount", label: "Montant" },
    { id: "close_date", label: "Date de clôture" },
    { id: "phase", label: "Phase" },
    { id: "kind", label: "Nature / type" },
    { id: "solution", label: "Solution" },
  ],
  sold_solutions: [
    { id: "external_key", label: "Clé externe (Cle) — optionnel", required: false },
    { id: "account_key", label: "Clé entreprise", required: true },
    { id: "solution", label: "Solution", required: true },
    { id: "modules", label: "Modules (séparés par ; )" },
    { id: "directions", label: "Directions (séparées par ; )" },
    { id: "billed_amount", label: "CA facturé (€)" },
  ],
};

export const IMPORT_ENTITY_LABEL: Record<ImportEntityKind, string> = {
  accounts: "Entreprises",
  contacts: "Contacts",
  opportunities: "Opportunités",
  sold_solutions: "Solutions vendues",
};

/** Alias normalisés → id champ DBR (suggestions locales). */
const ALIAS_TO_FIELD: Record<string, string> = {
  external_key: "external_key",
  cle: "external_key",
  cle_externe: "external_key",
  key: "external_key",
  id_externe: "external_key",
  id: "external_key",
  name: "name",
  nom: "name",
  type: "type",
  status: "status",
  statut: "status",
  commercial_status: "status",
  holding_key: "holding_key",
  groupe_key: "holding_key",
  cle_groupe: "holding_key",
  holding: "holding_key",
  groupe: "holding_key",
  sector: "sector",
  secteur: "sector",
  size: "size",
  taille: "size",
  effectif: "size",
  title: "title",
  titre: "title",
  fonction: "title",
  account_key: "account_key",
  entreprise_key: "account_key",
  compte_key: "account_key",
  account: "account_key",
  entreprise: "account_key",
  compte: "account_key",
  direction: "direction",
  email: "email",
  e_mail: "email",
  mail: "email",
  phone: "phone",
  telephone: "phone",
  tel: "phone",
  amount: "amount",
  montant: "amount",
  close_date: "close_date",
  date_close: "close_date",
  date_cloture: "close_date",
  phase: "phase",
  etape: "phase",
  kind: "kind",
  type_deal: "kind",
  nature: "kind",
  solution: "solution",
  solution_id: "solution",
  solution_code: "solution",
  modules: "modules",
  module: "modules",
  module_ids: "modules",
  directions: "directions",
  direction_ids: "directions",
  billed_amount: "billed_amount",
  ca_facture: "billed_amount",
  ca: "billed_amount",
  montant_facture: "billed_amount",
};

export type ColumnMapping = Record<string, string>;

/** Suggestion locale via aliases (sans IA). */
export function suggestMappingFromAliases(
  headers: string[],
  kind: ImportEntityKind,
): ColumnMapping {
  const allowed = new Set(DBR_IMPORT_FIELDS[kind].map((f) => f.id));
  const used = new Set<string>();
  const mapping: ColumnMapping = {};
  for (const header of headers) {
    const n = normalizeHeader(header);
    const field = ALIAS_TO_FIELD[n];
    if (field && allowed.has(field) && !used.has(field)) {
      mapping[header] = field;
      used.add(field);
    } else {
      mapping[header] = "";
    }
  }
  return mapping;
}

/** Applique le mapping colonnes → table canonique DBR. */
export function applyColumnMapping(
  headers: string[],
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): CsvTable {
  const canonHeaders = [
    ...new Set(
      headers
        .map((h) => mapping[h]?.trim())
        .filter((f): f is string => Boolean(f)),
    ),
  ];
  const outRows: Record<string, string>[] = rows.map((row) => {
    const next: Record<string, string> = {};
    for (const h of headers) {
      const field = mapping[h]?.trim();
      if (!field) continue;
      const value = row[h] ?? "";
      if (next[field] && !value) continue;
      next[field] = value;
    }
    return next;
  });
  return { headers: canonHeaders, rows: outRows };
}

export function mappingCoversRequired(
  kind: ImportEntityKind,
  mapping: ColumnMapping,
): string[] {
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  return DBR_IMPORT_FIELDS[kind]
    .filter((f) => f.required && !mapped.has(f.id))
    .map((f) => f.label);
}
