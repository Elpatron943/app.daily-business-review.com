import { normalizeHeader } from "./csv";
import { parseScopedField, type ColumnMapping } from "./mappingFields";

export type CatalogListKind =
  | "status"
  | "size"
  | "sector"
  | "persona"
  | "phase"
  | "kind"
  | "solution";

export type CatalogOption = {
  id: string;
  label: string;
};

export type CatalogCatalogs = {
  statuses: CatalogOption[];
  sizes: CatalogOption[];
  sectors: CatalogOption[];
  personae: CatalogOption[];
  phases: CatalogOption[];
  kinds: CatalogOption[];
  solutions: CatalogOption[];
};

export type CatalogGap = {
  list: CatalogListKind;
  listLabel: string;
  value: string;
};

const FIELD_TO_LIST: Record<string, CatalogListKind> = {
  "accounts.status": "status",
  "accounts.size": "size",
  "accounts.sector": "sector",
  "contacts.persona": "persona",
  "opportunities.phase": "phase",
  "opportunities.kind": "kind",
  "opportunities.solution": "solution",
  "opportunities.personae": "persona",
  "sold_solutions.solution": "solution",
  "sold_solutions.personae": "persona",
};

const MULTI_VALUE_FIELDS = new Set([
  "opportunities.personae",
  "opportunities.modules",
  "sold_solutions.personae",
  "sold_solutions.modules",
]);

export const CATALOG_LIST_LABEL: Record<CatalogListKind, string> = {
  status: "Statut commercial",
  size: "Effectif / taille",
  sector: "Secteur d’activité",
  persona: "Personae",
  phase: "Phase opportunité",
  kind: "Nature opportunité",
  solution: "Solution catalogue",
};

/** Expose pour l’UI mapping. */
export function catalogListForField(fieldId: string): CatalogListKind | null {
  const scoped = parseScopedField(fieldId);
  if (scoped) {
    return FIELD_TO_LIST[`${scoped.kind}.${scoped.id}`] ?? null;
  }
  const legacy: Record<string, CatalogListKind> = {
    status: "status",
    size: "size",
    sector: "sector",
    persona: "persona",
    direction: "persona",
    personae: "persona",
    directions: "persona",
    phase: "phase",
    kind: "kind",
    solution: "solution",
  };
  return legacy[fieldId] ?? null;
}

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function optionsFor(
  list: CatalogListKind,
  catalogs: CatalogCatalogs,
): CatalogOption[] {
  switch (list) {
    case "status":
      return catalogs.statuses;
    case "size":
      return catalogs.sizes;
    case "sector":
      return catalogs.sectors;
    case "persona":
      return catalogs.personae;
    case "phase":
      return catalogs.phases;
    case "kind":
      return catalogs.kinds;
    case "solution":
      return catalogs.solutions;
  }
}

export function valueExistsInCatalog(
  value: string,
  list: CatalogListKind,
  catalogs: CatalogCatalogs,
): boolean {
  const t = value.trim();
  if (!t) return true;
  const n = norm(t);
  return optionsFor(list, catalogs).some(
    (o) => norm(o.id) === n || norm(o.label) === n,
  );
}

function tokensForField(scopedId: string, raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  if (MULTI_VALUE_FIELDS.has(scopedId) || scopedId.endsWith(".modules")) {
    return t
      .split(/[;|,]/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [t];
}

/** Collecte jusqu’à `max` valeurs d’exemple distinctes non vides par colonne. */
export function collectColumnSamples(
  headers: string[],
  rows: Record<string, string>[],
  max = 3,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const h of headers) {
    const seen = new Set<string>();
    const vals: string[] = [];
    for (const row of rows) {
      const v = (row[h] ?? "").trim();
      if (!v) continue;
      const key = normalizeHeader(v) || v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      vals.push(v);
      if (vals.length >= max) break;
    }
    out[h] = vals;
  }
  return out;
}

/**
 * Valeurs du fichier absentes des listes déroulantes DBR
 * (pour les champs catalogue mappés).
 */
export function findCatalogGaps(
  sheets: Array<{
    headers: string[];
    rows: Record<string, string>[];
    mapping: ColumnMapping;
  }>,
  catalogs: CatalogCatalogs,
): CatalogGap[] {
  const seen = new Set<string>();
  const gaps: CatalogGap[] = [];

  for (const sheet of sheets) {
    for (const header of sheet.headers) {
      const fieldId = (sheet.mapping[header] ?? "").trim();
      if (!fieldId) continue;
      const list = catalogListForField(fieldId);
      if (!list) continue;
      const parsed = parseScopedField(fieldId);
      const scoped = parsed ? `${parsed.kind}.${parsed.id}` : fieldId;

      for (const row of sheet.rows) {
        for (const token of tokensForField(scoped, row[header] ?? "")) {
          if (valueExistsInCatalog(token, list, catalogs)) continue;
          const key = `${list}::${norm(token)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          gaps.push({
            list,
            listLabel: CATALOG_LIST_LABEL[list],
            value: token,
          });
        }
      }
    }
  }

  return gaps;
}

export function formatCatalogGapsMessage(gaps: CatalogGap[]): string {
  if (!gaps.length) return "";
  const lines = gaps.map(
    (g) => `• « ${g.value} » → ajouté à « ${g.listLabel} »`,
  );
  return (
    `Ces valeurs n’existent pas encore dans les listes DBR et seront ajoutées au catalogue de votre organisation (partagé via Supabase) :\n\n` +
    `${lines.join("\n")}\n\n` +
    `Confirmer pour les créer puis continuer ?`
  );
}

function slugId(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9+\-_]/g, "")
      .slice(0, 80) || "item"
  );
}

/** Enrichit les catalogues locaux avec les valeurs à créer (ids slugifiés). */
export function extendCatalogsWithGaps(
  catalogs: CatalogCatalogs,
  gaps: CatalogGap[],
): CatalogCatalogs {
  const next: CatalogCatalogs = {
    statuses: [...catalogs.statuses],
    sizes: [...catalogs.sizes],
    sectors: [...catalogs.sectors],
    personae: [...catalogs.personae],
    phases: [...catalogs.phases],
    kinds: [...catalogs.kinds],
    solutions: [...catalogs.solutions],
  };
  for (const g of gaps) {
    if (valueExistsInCatalog(g.value, g.list, next)) continue;
    const opt = { id: slugId(g.value), label: g.value.trim() };
    switch (g.list) {
      case "status":
        next.statuses.push(opt);
        break;
      case "size":
        next.sizes.push(opt);
        break;
      case "sector":
        next.sectors.push(opt);
        break;
      case "persona":
        next.personae.push(opt);
        break;
      case "phase":
        next.phases.push(opt);
        break;
      case "kind":
        next.kinds.push(opt);
        break;
      case "solution":
        next.solutions.push(opt);
        break;
    }
  }
  return next;
}

export type CatalogGapAppliers = {
  addStatus: (label: string) => void;
  addSize: (label: string) => void;
  addSector: (label: string) => void;
  addPersona: (label: string) => void;
  addPhase: (label: string) => void;
  addKind: (label: string) => void;
  addSolution: (label: string) => void;
};

/** Persiste les nouvelles valeurs dans le catalogue org. */
export function applyCatalogGaps(
  gaps: CatalogGap[],
  appliers: CatalogGapAppliers,
): void {
  for (const g of gaps) {
    switch (g.list) {
      case "status":
        appliers.addStatus(g.value);
        break;
      case "size":
        appliers.addSize(g.value);
        break;
      case "sector":
        appliers.addSector(g.value);
        break;
      case "persona":
        appliers.addPersona(g.value);
        break;
      case "phase":
        appliers.addPhase(g.value);
        break;
      case "kind":
        appliers.addKind(g.value);
        break;
      case "solution":
        appliers.addSolution(g.value);
        break;
    }
  }
}

