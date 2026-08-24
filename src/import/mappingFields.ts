import { normalizeHeader, type CsvTable } from "./csv";

export type ImportEntityKind =
  | "accounts"
  | "contacts"
  | "opportunities"
  | "sold_solutions";

export type DbrImportField = {
  id: string;
  label: string;
  /** Groupe UI dans le sélecteur de mapping. */
  group?: string;
  required?: boolean;
};

export const IMPORT_ENTITY_KINDS: ImportEntityKind[] = [
  "accounts",
  "contacts",
  "opportunities",
  "sold_solutions",
];

/** Champs DBR cibles par type d’entité. */
export const DBR_IMPORT_FIELDS: Record<ImportEntityKind, DbrImportField[]> = {
  accounts: [
    {
      id: "external_key",
      label: "Clé entreprise (Cle) — optionnel si = Nom",
      group: "Identité",
      required: false,
    },
    {
      id: "name",
      label: "Nom de l’entreprise",
      group: "Identité",
      required: true,
    },
    {
      id: "type",
      label: "Type (Holding / Entreprise)",
      group: "Identité",
    },
    {
      id: "status",
      label: "Statut commercial (Client / Prospect…)",
      group: "Profil",
    },
    {
      id: "holding_key",
      label: "Clé du groupe parent",
      group: "Profil",
    },
    {
      id: "sector",
      label: "Secteur d’activité",
      group: "Profil",
    },
    {
      id: "size",
      label: "Effectif / taille",
      group: "Profil",
    },
    {
      id: "owner_email",
      label: "E-mail du owner DBR (user existant)",
      group: "Owner",
      required: false,
    },
  ],
  contacts: [
    {
      id: "external_key",
      label: "Clé contact (Cle) — optionnel",
      group: "Identité",
      required: false,
    },
    {
      id: "firstname",
      label: "Prénom du contact",
      group: "Identité",
    },
    {
      id: "lastname",
      label: "Nom de famille du contact",
      group: "Identité",
    },
    {
      id: "name",
      label: "Nom complet du contact (si pas prénom/nom séparés)",
      group: "Identité",
      required: true,
    },
    {
      id: "title",
      label: "Titre / fonction",
      group: "Identité",
    },
    {
      id: "email",
      label: "E-mail du contact",
      group: "Coordonnées",
    },
    {
      id: "phone",
      label: "Téléphone du contact",
      group: "Coordonnées",
    },
    {
      id: "account_key",
      label: "Entreprise liée (Cle ou nom) — auto si même ligne",
      group: "Rattachement",
      required: true,
    },
    {
      id: "persona",
      label: "Persona / métier",
      group: "Rattachement",
    },
    {
      id: "owner_email",
      label: "E-mail du owner DBR (user existant)",
      group: "Owner",
      required: false,
    },
  ],
  opportunities: [
    {
      id: "external_key",
      label: "Clé opportunité (Cle) — optionnel",
      group: "Identité",
      required: false,
    },
    {
      id: "name",
      label: "Nom de l’opportunité",
      group: "Identité",
      required: true,
    },
    {
      id: "account_key",
      label: "Entreprise liée (Cle ou nom) — auto si même ligne",
      group: "Rattachement",
      required: true,
    },
    {
      id: "amount",
      label: "Montant (€)",
      group: "Pipeline",
    },
    {
      id: "close_date",
      label: "Date de clôture",
      group: "Pipeline",
    },
    {
      id: "phase",
      label: "Phase / étape",
      group: "Pipeline",
    },
    {
      id: "kind",
      label: "Nature (prospect / upsell / cross / renewal…)",
      group: "Pipeline",
    },
    {
      id: "solution",
      label: "Solution catalogue",
      group: "Offre",
    },
    {
      id: "modules",
      label: "Modules (; séparés)",
      group: "Offre",
    },
    {
      id: "personae",
      label: "Personae ciblées (; séparées)",
      group: "Offre",
    },
    {
      id: "owner_email",
      label: "E-mail du owner DBR (user existant)",
      group: "Owner",
      required: false,
    },
  ],
  sold_solutions: [
    {
      id: "external_key",
      label: "Clé ligne vendue (Cle) — optionnel",
      group: "Identité",
      required: false,
    },
    {
      id: "account_key",
      label: "Entreprise liée (Cle ou nom) — auto si même ligne",
      group: "Rattachement",
      required: true,
    },
    {
      id: "solution",
      label: "Solution vendue",
      group: "CA installé",
      required: true,
    },
    {
      id: "modules",
      label: "Modules installés (; séparés)",
      group: "CA installé",
    },
    {
      id: "personae",
      label: "Personae (; séparées)",
      group: "CA installé",
    },
    {
      id: "billed_amount",
      label: "CA facturé (€)",
      group: "CA installé",
    },
  ],
};

export const IMPORT_ENTITY_LABEL: Record<ImportEntityKind, string> = {
  accounts: "Entreprise",
  contacts: "Contact",
  opportunities: "Opportunité",
  sold_solutions: "Solution vendue",
};

export function scopedFieldId(kind: ImportEntityKind, fieldId: string): string {
  return `${kind}.${fieldId}`;
}

export function parseScopedField(
  raw: string,
): { kind: ImportEntityKind; id: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const dot = trimmed.indexOf(".");
  if (dot <= 0) return null;
  const kind = trimmed.slice(0, dot) as ImportEntityKind;
  const id = trimmed.slice(dot + 1);
  if (!IMPORT_ENTITY_KINDS.includes(kind) || !id) return null;
  if (!DBR_IMPORT_FIELDS[kind].some((f) => f.id === id)) return null;
  return { kind, id };
}

/** Tous les champs, regroupés par entité · section (mapping multi-entités). */
export function fieldsGroupedAll(): Array<{
  group: string;
  fields: Array<DbrImportField & { scopedId: string }>;
}> {
  const out: Array<{
    group: string;
    fields: Array<DbrImportField & { scopedId: string }>;
  }> = [];
  for (const kind of IMPORT_ENTITY_KINDS) {
    const bySection = new Map<string, Array<DbrImportField & { scopedId: string }>>();
    const order: string[] = [];
    for (const f of DBR_IMPORT_FIELDS[kind]) {
      const section = f.group ?? "Autres";
      const group = `${IMPORT_ENTITY_LABEL[kind]} · ${section}`;
      if (!bySection.has(group)) {
        bySection.set(group, []);
        order.push(group);
      }
      bySection.get(group)!.push({
        ...f,
        scopedId: scopedFieldId(kind, f.id),
      });
    }
    for (const group of order) {
      out.push({ group, fields: bySection.get(group)! });
    }
  }
  return out;
}

export function fieldsGrouped(
  kind: ImportEntityKind,
): Array<{ group: string; fields: DbrImportField[] }> {
  const fields = DBR_IMPORT_FIELDS[kind];
  const order: string[] = [];
  const byGroup = new Map<string, DbrImportField[]>();
  for (const f of fields) {
    const g = f.group ?? "Autres";
    if (!byGroup.has(g)) {
      byGroup.set(g, []);
      order.push(g);
    }
    byGroup.get(g)!.push(f);
  }
  return order.map((group) => ({ group, fields: byGroup.get(group)! }));
}

/** Alias normalisés → id champ DBR (non scopé). */
const ALIAS_TO_FIELD: Record<string, string> = {
  external_key: "external_key",
  cle: "external_key",
  cle_externe: "external_key",
  key: "external_key",
  id_externe: "external_key",
  id: "external_key",
  name: "name",
  nom: "name",
  nom_entreprise: "name",
  nom_de_l_entreprise: "name",
  company_name: "name",
  raison_sociale: "name",
  nom_contact: "name",
  nom_du_contact: "lastname",
  contact_name: "name",
  nom_complet: "name",
  nom_opportunite: "name",
  nom_de_l_opportunite: "name",
  deal_name: "name",
  opportunity_name: "name",
  firstname: "firstname",
  prenom: "firstname",
  first_name: "firstname",
  lastname: "lastname",
  nom_famille: "lastname",
  last_name: "lastname",
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
  jobtitle: "title",
  account_key: "account_key",
  entreprise_key: "account_key",
  compte_key: "account_key",
  account: "account_key",
  entreprise: "account_key",
  compte: "account_key",
  direction: "persona",
  persona: "persona",
  directions: "personae",
  direction_ids: "personae",
  persona_ids: "personae",
  personae: "personae",
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
  billed_amount: "billed_amount",
  ca_facture: "billed_amount",
  ca: "billed_amount",
  montant_facture: "billed_amount",
  owner_email: "owner_email",
  email_owner: "owner_email",
  owner: "owner_email",
  gestionnaire: "owner_email",
  proprietaire: "owner_email",
};

/** En-têtes exacts du template officiel DBR par entité. */
export const OFFICIAL_TEMPLATE_HEADERS: Record<ImportEntityKind, string[]> = {
  accounts: [
    "Cle",
    "Nom",
    "Type",
    "Statut",
    "Cle_groupe",
    "Secteur",
    "Taille",
    "Owner_email",
  ],
  contacts: ["Cle", "Nom", "Titre", "Compte", "Persona"],
  opportunities: [
    "Cle",
    "Nom",
    "Compte",
    "Montant",
    "Date_cloture",
    "Phase",
    "Nature",
    "Solution",
  ],
  sold_solutions: [
    "Cle",
    "Compte",
    "Solution",
    "Modules",
    "Personae",
    "CA_facture",
  ],
};

export function headersMatchOfficialTemplate(
  headers: string[],
  kind: ImportEntityKind,
): boolean {
  const expected = OFFICIAL_TEMPLATE_HEADERS[kind];
  if (headers.length !== expected.length) return false;
  return headers.every(
    (h, i) => normalizeHeader(h) === normalizeHeader(expected[i] ?? ""),
  );
}

/** Mapping direct colonne → champ quand le fichier suit le template officiel. */
export function suggestOfficialTemplateMapping(
  headers: string[],
  kind: ImportEntityKind,
): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const header of headers) {
    const field = ALIAS_TO_FIELD[normalizeHeader(header)];
    if (field && DBR_IMPORT_FIELDS[kind].some((f) => f.id === field)) {
      mapping[header] = scopedFieldId(kind, field);
    } else {
      mapping[header] = "";
    }
  }
  return mapping;
}

export function fieldsGroupedForKind(
  kind: ImportEntityKind,
): Array<{
  group: string;
  fields: Array<DbrImportField & { scopedId: string }>;
}> {
  return fieldsGrouped(kind).map((g) => ({
    group: `${IMPORT_ENTITY_LABEL[kind]} · ${g.group}`,
    fields: g.fields.map((f) => ({
      ...f,
      scopedId: scopedFieldId(kind, f.id),
    })),
  }));
}

/** Heuristique entité pour un en-tête ambigu. */
function guessKindForAlias(
  alias: string,
  headerNorm: string,
  preferred: ImportEntityKind,
): ImportEntityKind {
  if (
    headerNorm.includes("opportun") ||
    headerNorm.includes("deal") ||
    alias === "amount" ||
    alias === "phase" ||
    alias === "kind" ||
    alias === "close_date"
  ) {
    return "opportunities";
  }
  if (
    headerNorm.includes("contact") ||
    headerNorm.includes("prenom") ||
    headerNorm.includes("firstname") ||
    headerNorm.includes("lastname") ||
    headerNorm.includes("famille") ||
    alias === "firstname" ||
    alias === "lastname" ||
    alias === "title" ||
    alias === "phone"
  ) {
    return "contacts";
  }
  if (
    headerNorm.includes("vendu") ||
    headerNorm.includes("installe") ||
    alias === "billed_amount"
  ) {
    return "sold_solutions";
  }
  if (
    headerNorm.includes("entreprise") ||
    headerNorm.includes("company") ||
    headerNorm.includes("compte") ||
    headerNorm.includes("holding") ||
    headerNorm.includes("secteur") ||
    headerNorm.includes("effectif") ||
    alias === "type" ||
    alias === "status" ||
    alias === "sector" ||
    alias === "size" ||
    alias === "holding_key"
  ) {
    return "accounts";
  }
  if (alias === "email" && headerNorm.includes("owner")) return preferred;
  if (alias === "email") return "contacts";
  if (alias === "name" && headerNorm.includes("opportun")) return "opportunities";
  if (alias === "name" && headerNorm.includes("contact")) return "contacts";
  if (alias === "name" && headerNorm.includes("entreprise")) return "accounts";
  return preferred;
}

export type ColumnMapping = Record<string, string>;

/** Suggestion locale via aliases → ids scopés (accounts.name, …). */
export function suggestMappingFromAliases(
  headers: string[],
  kind: ImportEntityKind,
): ColumnMapping {
  const used = new Set<string>();
  const mapping: ColumnMapping = {};
  for (const header of headers) {
    const n = normalizeHeader(header);
    const field = ALIAS_TO_FIELD[n];
    if (!field) {
      mapping[header] = "";
      continue;
    }
    const entity = guessKindForAlias(field, n, kind);
    const scoped = scopedFieldId(entity, field);
    if (used.has(scoped)) {
      mapping[header] = "";
      continue;
    }
    // Vérifie que le champ existe bien pour cette entité
    if (!DBR_IMPORT_FIELDS[entity].some((f) => f.id === field)) {
      mapping[header] = "";
      continue;
    }
    mapping[header] = scoped;
    used.add(scoped);
  }
  return mapping;
}

/** Applique le mapping (ids simples ou scopés) → tables multi-entités. */
export function applyMultiEntityMapping(
  headers: string[],
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  fallbackKind: ImportEntityKind,
): Partial<Record<ImportEntityKind, CsvTable>> {
  const outRows: Partial<Record<ImportEntityKind, Record<string, string>[]>> = {
    accounts: [],
    contacts: [],
    opportunities: [],
    sold_solutions: [],
  };

  for (const row of rows) {
    const byKind: Partial<Record<ImportEntityKind, Record<string, string>>> = {};
    for (const h of headers) {
      const raw = mapping[h]?.trim();
      if (!raw) continue;
      const parsed =
        parseScopedField(raw) ??
        (DBR_IMPORT_FIELDS[fallbackKind].some((f) => f.id === raw)
          ? { kind: fallbackKind, id: raw }
          : null);
      if (!parsed) continue;
      const bucket = byKind[parsed.kind] ?? (byKind[parsed.kind] = {});
      const value = row[h] ?? "";
      if (bucket[parsed.id] && !value) continue;
      bucket[parsed.id] = value;
    }

    const accountRef =
      (byKind.accounts?.external_key || byKind.accounts?.name || "").trim();
    for (const kind of [
      "contacts",
      "opportunities",
      "sold_solutions",
    ] as const) {
      const bucket = byKind[kind];
      if (!bucket) continue;
      if (!(bucket.account_key || "").trim() && accountRef) {
        bucket.account_key = accountRef;
      }
    }

    if (byKind.contacts) {
      const c = byKind.contacts;
      if (!(c.name || "").trim()) {
        const composed = `${c.firstname ?? ""} ${c.lastname ?? ""}`.trim();
        if (composed) c.name = composed;
      }
    }

    for (const kind of IMPORT_ENTITY_KINDS) {
      const bucket = byKind[kind];
      if (!bucket || Object.keys(bucket).length === 0) continue;
      // Ne pousse une ligne contact/opp/sold que s’il y a un signal utile
      if (kind === "contacts" && !(bucket.name || "").trim()) continue;
      if (kind === "opportunities" && !(bucket.name || "").trim()) continue;
      if (kind === "sold_solutions" && !(bucket.solution || "").trim()) continue;
      if (kind === "accounts" && !(bucket.name || "").trim()) continue;
      outRows[kind]!.push(bucket);
    }
  }

  const tables: Partial<Record<ImportEntityKind, CsvTable>> = {};
  for (const kind of IMPORT_ENTITY_KINDS) {
    const list = outRows[kind] ?? [];
    if (list.length === 0) continue;
    const hdr = [...new Set(list.flatMap((r) => Object.keys(r)))];
    tables[kind] = { headers: hdr, rows: list };
  }
  return tables;
}

/** @deprecated préfère applyMultiEntityMapping */
export function applyColumnMapping(
  headers: string[],
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): CsvTable {
  const tables = applyMultiEntityMapping(headers, rows, mapping, "accounts");
  const first = tables.accounts ?? tables.contacts ?? tables.opportunities;
  return first ?? { headers: [], rows: [] };
}

export function mappingCoversRequired(
  kind: ImportEntityKind,
  mapping: ColumnMapping,
): string[] {
  const mapped = new Set<string>();
  let touchesKind = false;
  for (const raw of Object.values(mapping)) {
    if (!raw) continue;
    const parsed =
      parseScopedField(raw) ??
      (DBR_IMPORT_FIELDS[kind].some((f) => f.id === raw)
        ? { kind, id: raw }
        : null);
    if (!parsed) continue;
    if (parsed.kind === kind) {
      touchesKind = true;
      mapped.add(parsed.id);
    }
    // Sur une ligne mixte, account_key contact/opp peut venir de accounts.name
    if (
      (kind === "contacts" ||
        kind === "opportunities" ||
        kind === "sold_solutions") &&
      parsed.kind === "accounts" &&
      (parsed.id === "name" || parsed.id === "external_key")
    ) {
      mapped.add("account_key");
    }
  }
  if (!touchesKind && kind !== "accounts") return [];
  // Contact : name peut venir de firstname+lastname
  if (kind === "contacts" && (mapped.has("firstname") || mapped.has("lastname"))) {
    mapped.add("name");
  }
  return DBR_IMPORT_FIELDS[kind]
    .filter((f) => f.required && !mapped.has(f.id))
    .map((f) => `${IMPORT_ENTITY_LABEL[kind]} : ${f.label}`);
}

/** Champs requis manquants pour toutes les entités touchées par le mapping. */
export function mappingCoversRequiredAll(mapping: ColumnMapping): string[] {
  const missing: string[] = [];
  for (const kind of IMPORT_ENTITY_KINDS) {
    missing.push(...mappingCoversRequired(kind, mapping));
  }
  return missing;
}
