import {
  ACCOUNT_SIZES,
  COMMERCIAL_STATUSES,
  migrateAccountSize,
  type Account,
  type AccountSize,
  type AccountType,
  type CommercialStatus,
  type Contact,
  type SoldSolution,
} from "../data";
import type { DirectionDef, SectorDef, SolutionDef } from "../config/types";
import {
  OPPORTUNITY_KINDS,
  OPPORTUNITY_PHASES,
  type Opportunity,
  type OpportunityKind,
} from "../opportunities/OpportunityContext";
import { ensureRequiredMappingChecks } from "../opportunities/mappingScore";
import type { OppMappingSubtypeDef } from "../config/types";
import type { CsvTable } from "./csv";

export type ImportEntityKind =
  | "accounts"
  | "contacts"
  | "opportunities"
  | "sold_solutions";

/**
 * Mode d'import :
 * - create : uniquement nouvelles lignes (cle absente de DBR)
 * - update : uniquement mises a jour (cle deja connue)
 * - upsert : creer les nouvelles + mettre a jour les existantes
 */
export type ImportMode = "create" | "update" | "upsert";

export const IMPORT_MODE_LABEL: Record<ImportMode, string> = {
  create: "Ajout uniquement",
  update: "Mise à jour uniquement",
  upsert: "Ajout + mise à jour",
};

export type ImportRowIssue = {
  row: number;
  level: "error" | "warning";
  message: string;
};

export type PlannedAccount = {
  row: number;
  externalKey: string;
  action: "create" | "update";
  id?: string;
  name: string;
  type: AccountType;
  commercialStatus: CommercialStatus;
  holdingKey: string;
  holdingId: string | null;
  sector?: string;
  size?: AccountSize;
};

export type PlannedContact = {
  row: number;
  externalKey: string;
  action: "create" | "update";
  id?: string;
  name: string;
  title: string;
  accountKey: string;
  accountId: string;
  directionId: string;
};

export type PlannedOpportunity = {
  row: number;
  externalKey: string;
  action: "create" | "update";
  id?: string;
  name: string;
  accountKey: string;
  accountId: string;
  amount: number;
  closeDate: string;
  phase: string;
  kind: OpportunityKind;
  solutionId: string;
};

export type PlannedSoldSolution = {
  row: number;
  externalKey: string;
  action: "create" | "update";
  id?: string;
  accountKey: string;
  accountId: string;
  solutionId: string;
  moduleIds: string[];
  directionIds: string[];
  billedAmount: number;
};

export type ImportPlan = {
  accounts: PlannedAccount[];
  contacts: PlannedContact[];
  opportunities: PlannedOpportunity[];
  soldSolutions: PlannedSoldSolution[];
  issues: ImportRowIssue[];
  keyToAccountId: Record<string, string>;
};

export type ImportContext = {
  accounts: Account[];
  contacts: Contact[];
  opportunities: Opportunity[];
  soldSolutions: SoldSolution[];
  directions: DirectionDef[];
  sectors: SectorDef[];
  solutions: SolutionDef[];
  oppMappingSubtypes: OppMappingSubtypeDef[];
};

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Transforme une Cle (souvent un nom d'entreprise) en id technique stable.
 * Ex. "Smoke Co" -> "smoke-co"
 */
export function slugifyKey(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || "item";
}

/** Toute Cle non vide est utilisable (y compris un nom d'entreprise). */
export function isStableExternalKey(key: string): boolean {
  return Boolean(key.trim());
}

/** Id DBR derive de la Cle (slug), pour creation. */
export function idFromExternalKey(key: string, fallbackPrefix: string): string {
  const slug = slugifyKey(key);
  if (slug && slug !== "item") return slug;
  return `${fallbackPrefix}-${Date.now().toString(36)}`;
}

function parseType(raw: string): AccountType | null {
  const n = norm(raw);
  if (!n) return "Entreprise";
  if (n === "holding" || n === "groupe" || n === "group") return "Holding";
  if (n === "entreprise" || n === "company" || n === "filiale") return "Entreprise";
  return null;
}

function parseStatus(raw: string): CommercialStatus | null {
  const n = norm(raw);
  if (!n) return "Prospect";
  if (n === "client") return "Client";
  if (n === "prospect") return "Prospect";
  if (n === "partner" || n === "partenaire") return "Partner";
  if (n === "concurrent" || n === "competitor") return "Concurrent";
  if (n === "other" || n === "autre") return "Prospect";
  if ((COMMERCIAL_STATUSES as string[]).includes(raw.trim())) {
    return raw.trim() as CommercialStatus;
  }
  return null;
}

function parseKind(raw: string): OpportunityKind | null {
  const n = norm(raw);
  if (!n) return "prospect";
  if (n === "up" || n === "upsell") return "up";
  if (
    n === "cross" ||
    n === "cross_sell" ||
    n === "cross-sell" ||
    n === "crosssell"
  )
    return "cross";
  if (
    n === "new_in_group" ||
    n === "nouveau_compte" ||
    n === "nouveau_dans_groupe" ||
    n === "nouveau compte dans le groupe" ||
    n === "new"
  )
    return "new_in_group";
  if (n === "prospect") return "prospect";
  if (
    n === "renewal" ||
    n === "renouvellement" ||
    n === "renew" ||
    n === "renouv"
  )
    return "renewal";
  if ((OPPORTUNITY_KINDS as string[]).includes(raw.trim())) {
    return raw.trim() as OpportunityKind;
  }
  return null;
}

function parsePhase(raw: string): string | null {
  const n = norm(raw);
  if (!n) return "Whitespace";
  const aliases: Record<string, string> = {
    whitespace: "Whitespace",
    "white space": "Whitespace",
    white_space: "Whitespace",
    discovery: "Discovery",
    "solution validation": "Solution Validation",
    solution_validation: "Solution Validation",
    validation: "Solution Validation",
    negotiation: "Negotiation",
    negociation: "Negotiation",
    "closed won": "Closed Won",
    closed_won: "Closed Won",
    gagne: "Closed Won",
    "closed lost": "Closed Lost",
    closed_lost: "Closed Lost",
    perdu: "Closed Lost",
  };
  if (aliases[n]) return aliases[n];
  const hit = OPPORTUNITY_PHASES.find((p) => norm(p) === n);
  return hit ?? null;
}

function resolveSector(
  raw: string,
  sectors: SectorDef[],
): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const byId = sectors.find((s) => s.id === t && s.active !== false);
  if (byId) return byId.id;
  const byName = sectors.find(
    (s) => s.active !== false && norm(s.name) === norm(t),
  );
  return byName?.id ?? t;
}

function resolveDirection(
  raw: string,
  directions: DirectionDef[],
): string | null {
  const active = directions.filter((d) => d.active !== false);
  if (active.length === 0) return null;
  const t = raw.trim();
  if (!t) return active[0].id;
  const byId = active.find((d) => d.id === t);
  if (byId) return byId.id;
  const byName = active.find((d) => norm(d.name) === norm(t));
  return byName?.id ?? null;
}

function resolveSolution(
  raw: string,
  solutions: SolutionDef[],
): string {
  const t = raw.trim();
  if (!t) return "";
  const active = solutions.filter((s) => s.active !== false);
  const byId = active.find((s) => s.id === t);
  if (byId) return byId.id;
  const byCode = active.find(
    (s) => s.code && norm(s.code) === norm(t),
  );
  if (byCode) return byCode.id;
  const byName = active.find((s) => norm(s.name) === norm(t));
  return byName?.id ?? "";
}

function splitMulti(raw: string): string[] {
  return raw
    .split(/[;|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveModules(
  raw: string,
  solutionId: string,
  solutions: SolutionDef[],
  rowNum: number,
  issues: ImportRowIssue[],
): string[] {
  const tokens = splitMulti(raw);
  if (tokens.length === 0) return [];
  const solution = solutions.find((s) => s.id === solutionId);
  const modules = (solution?.modules ?? []).filter((m) => m.active !== false);
  const ids: string[] = [];
  for (const token of tokens) {
    const byId = modules.find((m) => m.id === token);
    const byLabel = modules.find((m) => norm(m.label) === norm(token));
    const hit = byId ?? byLabel;
    if (hit) {
      ids.push(hit.id);
    } else {
      issues.push({
        row: rowNum,
        level: "warning",
        message: `Module « ${token} » introuvable pour la solution`,
      });
    }
  }
  return [...new Set(ids)];
}

function resolveDirectionsMulti(
  raw: string,
  directions: DirectionDef[],
  rowNum: number,
  issues: ImportRowIssue[],
): string[] {
  const tokens = splitMulti(raw);
  if (tokens.length === 0) return [];
  const ids: string[] = [];
  for (const token of tokens) {
    const id = resolveDirection(token, directions);
    if (id) ids.push(id);
    else {
      issues.push({
        row: rowNum,
        level: "warning",
        message: `Direction « ${token} » introuvable`,
      });
    }
  }
  return [...new Set(ids)];
}

function findSoldByKey(
  key: string,
  accountId: string | undefined,
  solutionId: string | undefined,
  sold: SoldSolution[],
): SoldSolution | undefined {
  if (key) {
    const keySlug = slugifyKey(key);
    const byKey = sold.find(
      (s) =>
        s.id === key ||
        s.id === keySlug ||
        slugifyKey(s.id) === keySlug,
    );
    if (byKey) return byKey;
  }
  if (accountId && solutionId) {
    return sold.find(
      (s) =>
        s.accountId === accountId &&
        s.solutionId === solutionId &&
        (!s.directionIds || s.directionIds.length === 0) &&
        !s.directionId,
    );
  }
  return undefined;
}

function findAccountByKey(
  key: string,
  accounts: Account[],
): Account | undefined {
  if (!key) return undefined;
  const keySlug = slugifyKey(key);
  const keyNorm = norm(key);
  return accounts.find((a) => {
    if (a.active === false) return false;
    if (a.id === key || a.hubspotCompanyId === key) return true;
    if (a.id === keySlug || slugifyKey(a.id) === keySlug) return true;
    if (a.hubspotCompanyId && slugifyKey(a.hubspotCompanyId) === keySlug)
      return true;
    // Fallback : Cle = nom d'entreprise
    if (norm(a.name) === keyNorm) return true;
    if (slugifyKey(a.name) === keySlug) return true;
    return false;
  });
}

function findContactByKey(
  key: string,
  contacts: Contact[],
): Contact | undefined {
  if (!key) return undefined;
  const keySlug = slugifyKey(key);
  const keyNorm = norm(key);
  return contacts.find((c) => {
    if (c.active === false) return false;
    if (c.id === key || c.id === keySlug || slugifyKey(c.id) === keySlug)
      return true;
    if (norm(c.name) === keyNorm) return true;
    return false;
  });
}

function findOpportunityByKey(
  key: string,
  opportunities: Opportunity[],
): Opportunity | undefined {
  if (!key) return undefined;
  const keySlug = slugifyKey(key);
  const keyNorm = norm(key);
  return opportunities.find((o) => {
    if (o.active === false) return false;
    if (o.id === key || o.id === keySlug || slugifyKey(o.id) === keySlug)
      return true;
    if (norm(o.name) === keyNorm) return true;
    return false;
  });
}

/** Cle effective : colonne Cle, sinon le Nom (cas "je n'ai que le nom"). */
function resolveRowKey(
  row: Record<string, string>,
  rowNum: number,
  issues: ImportRowIssue[],
  entityLabel: string,
): { name: string; externalKey: string } | null {
  const name = (row.name ?? "").trim();
  let externalKey = (row.external_key || row.id || "").trim();
  if (!externalKey && name) {
    externalKey = name;
    issues.push({
      row: rowNum,
      level: "warning",
      message: `${entityLabel} : Cle absente → nom « ${name} » utilise comme cle`,
    });
  }
  if (!name) {
    issues.push({
      row: rowNum,
      level: "error",
      message: `Nom ${entityLabel.toLowerCase()} manquant`,
    });
    return null;
  }
  if (!externalKey) {
    issues.push({
      row: rowNum,
      level: "error",
      message: "Cle (ou Nom) obligatoire",
    });
    return null;
  }
  return { name, externalKey };
}

export const ACCOUNT_TEMPLATE_HEADERS = [
  "external_key",
  "name",
  "type",
  "status",
  "holding_key",
  "sector",
  "size",
];

export const CONTACT_TEMPLATE_HEADERS = [
  "external_key",
  "name",
  "title",
  "account_key",
  "direction",
];

export const OPPORTUNITY_TEMPLATE_HEADERS = [
  "external_key",
  "name",
  "account_key",
  "amount",
  "close_date",
  "phase",
  "kind",
  "solution",
];

export function buildImportPlan(
  tables: {
    accounts?: CsvTable;
    contacts?: CsvTable;
    opportunities?: CsvTable;
    sold_solutions?: CsvTable;
  },
  ctx: ImportContext,
  mode: ImportMode = "upsert",
): ImportPlan {
  const issues: ImportRowIssue[] = [];
  const accountsOut: PlannedAccount[] = [];
  const contactsOut: PlannedContact[] = [];
  const oppsOut: PlannedOpportunity[] = [];
  const soldOut: PlannedSoldSolution[] = [];
  const keyToAccountId: Record<string, string> = {};
  const pendingKeys = new Set<string>();

  for (const a of ctx.accounts) {
    if (a.active === false) continue;
    keyToAccountId[a.id] = a.id;
    keyToAccountId[slugifyKey(a.id)] = a.id;
    keyToAccountId[slugifyKey(a.name)] = a.id;
    if (a.hubspotCompanyId) keyToAccountId[a.hubspotCompanyId] = a.id;
  }

  const accountRows = tables.accounts?.rows ?? [];

  // Pass 1: holdings
  accountRows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const type = parseType(row.type ?? "");
    if (type !== "Holding") return;
    const resolved = resolveRowKey(row, rowNum, issues, "Groupe");
    if (!resolved) return;
    const { name, externalKey } = resolved;
    const status = parseStatus(row.status ?? "");
    if (!status) {
      issues.push({
        row: rowNum,
        level: "error",
        message: `Statut invalide « ${row.status} »`,
      });
      return;
    }
    const keySlug = slugifyKey(externalKey);
    if (pendingKeys.has(keySlug) || pendingKeys.has(externalKey)) {
      issues.push({
        row: rowNum,
        level: "error",
        message: `Cle dupliquee « ${externalKey} »`,
      });
      return;
    }
    const existing = findAccountByKey(externalKey, ctx.accounts);
    const size = migrateAccountSize(row.size);
    if (
      row.size?.trim() &&
      !size &&
      !ACCOUNT_SIZES.includes(row.size.trim() as AccountSize)
    ) {
      issues.push({
        row: rowNum,
        level: "warning",
        message: `Taille ignoree « ${row.size} »`,
      });
    }
    accountsOut.push({
      row: rowNum,
      externalKey,
      action: existing ? "update" : "create",
      id: existing?.id,
      name,
      type: "Holding",
      commercialStatus: status,
      holdingKey: "",
      holdingId: null,
      sector: resolveSector(row.sector ?? "", ctx.sectors),
      size,
    });
    pendingKeys.add(keySlug);
    pendingKeys.add(externalKey);
    const resolvedId = existing?.id ?? `__new__:${externalKey}`;
    keyToAccountId[externalKey] = resolvedId;
    keyToAccountId[keySlug] = resolvedId;
  });

  // Pass 2: entreprises
  accountRows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const type = parseType(row.type ?? "");
    if (type === "Holding") return;
    if (type === null) {
      issues.push({
        row: rowNum,
        level: "error",
        message: `Type invalide « ${row.type} » (Holding/Groupe ou Entreprise)`,
      });
      return;
    }
    const resolved = resolveRowKey(row, rowNum, issues, "Entreprise");
    if (!resolved) return;
    const { name, externalKey } = resolved;
    const status = parseStatus(row.status ?? "");
    if (!status) {
      issues.push({
        row: rowNum,
        level: "error",
        message: `Statut invalide « ${row.status} »`,
      });
      return;
    }
    const keySlug = slugifyKey(externalKey);
    if (pendingKeys.has(keySlug) || pendingKeys.has(externalKey)) {
      issues.push({
        row: rowNum,
        level: "error",
        message: `Cle dupliquee « ${externalKey} »`,
      });
      return;
    }
    const holdingKey = (row.holding_key ?? "").trim();
    let holdingId: string | null = null;
    if (holdingKey) {
      const mapped =
        keyToAccountId[holdingKey] ?? keyToAccountId[slugifyKey(holdingKey)];
      if (mapped) {
        holdingId = mapped.startsWith("__new__:") ? null : mapped;
      } else {
        const hold = findAccountByKey(holdingKey, ctx.accounts);
        if (hold?.type === "Holding") holdingId = hold.id;
        else {
          issues.push({
            row: rowNum,
            level: "warning",
            message: `Groupe « ${holdingKey} » introuvable`,
          });
        }
      }
    }
    const existing = findAccountByKey(externalKey, ctx.accounts);
    const size = migrateAccountSize(row.size);
    if (
      row.size?.trim() &&
      !size &&
      !ACCOUNT_SIZES.includes(row.size.trim() as AccountSize)
    ) {
      issues.push({
        row: rowNum,
        level: "warning",
        message: `Taille ignoree « ${row.size} »`,
      });
    }
    accountsOut.push({
      row: rowNum,
      externalKey,
      action: existing ? "update" : "create",
      id: existing?.id,
      name,
      type: "Entreprise",
      commercialStatus: status,
      holdingKey,
      holdingId,
      sector: resolveSector(row.sector ?? "", ctx.sectors),
      size,
    });
    pendingKeys.add(keySlug);
    pendingKeys.add(externalKey);
    const resolvedId = existing?.id ?? `__new__:${externalKey}`;
    keyToAccountId[externalKey] = resolvedId;
    keyToAccountId[keySlug] = resolvedId;
  });

  // Contacts
  (tables.contacts?.rows ?? []).forEach((row, idx) => {
    const rowNum = idx + 2;
    const resolved = resolveRowKey(row, rowNum, issues, "Contact");
    if (!resolved) return;
    const { name, externalKey } = resolved;
    const accountKey = (row.account_key ?? "").trim();
    if (!accountKey) {
      issues.push({
        row: rowNum,
        level: "error",
        message: "Compte (cle entreprise) manquant",
      });
      return;
    }
    let accountId =
      keyToAccountId[accountKey] ?? keyToAccountId[slugifyKey(accountKey)];
    if (!accountId || accountId.startsWith("__new__:")) {
      const byKey = findAccountByKey(accountKey, ctx.accounts);
      if (byKey) accountId = byKey.id;
      else if (!accountId) accountId = `__pending__:${accountKey}`;
    }
    if (accountId.startsWith("__pending__:")) {
      const key = accountId.slice("__pending__:".length);
      if (
        !keyToAccountId[key] &&
        !keyToAccountId[slugifyKey(key)] &&
        !accountsOut.some(
          (a) =>
            a.externalKey === key || slugifyKey(a.externalKey) === slugifyKey(key),
        )
      ) {
        issues.push({
          row: rowNum,
          level: "error",
          message: `Entreprise introuvable « ${accountKey} »`,
        });
        return;
      }
    }

    const directionId = resolveDirection(row.direction ?? "", ctx.directions);
    if (!directionId) {
      issues.push({
        row: rowNum,
        level: "error",
        message: "Aucune direction active dans les Settings",
      });
      return;
    }
    const directionRaw = (row.direction ?? "").trim();
    if (directionRaw) {
      const exact = ctx.directions.some(
        (d) =>
          d.active !== false &&
          (d.id === directionRaw || norm(d.name) === norm(directionRaw)),
      );
      if (!exact) {
        issues.push({
          row: rowNum,
          level: "warning",
          message: `Direction « ${directionRaw} » introuvable → defaut`,
        });
      }
    }

    const existing =
      findContactByKey(externalKey, ctx.contacts) ??
      (!accountId.startsWith("__")
        ? ctx.contacts.find(
            (c) =>
              c.active !== false &&
              c.accountId === accountId &&
              norm(c.name) === norm(name),
          )
        : undefined);

    contactsOut.push({
      row: rowNum,
      externalKey,
      action: existing ? "update" : "create",
      id: existing?.id,
      name,
      title: (row.title ?? "").trim(),
      accountKey,
      accountId,
      directionId,
    });
  });

  // Opportunities
  (tables.opportunities?.rows ?? []).forEach((row, idx) => {
    const rowNum = idx + 2;
    const resolved = resolveRowKey(row, rowNum, issues, "Opportunite");
    if (!resolved) return;
    const { name, externalKey } = resolved;
    const accountKey = (row.account_key ?? "").trim();
    if (!accountKey) {
      issues.push({
        row: rowNum,
        level: "error",
        message: "Compte (cle entreprise) manquant",
      });
      return;
    }

    let accountId =
      keyToAccountId[accountKey] ?? keyToAccountId[slugifyKey(accountKey)];
    if (!accountId || accountId.startsWith("__new__:")) {
      const byKey = findAccountByKey(accountKey, ctx.accounts);
      if (byKey) accountId = byKey.id;
      else if (keyToAccountId[accountKey]) accountId = keyToAccountId[accountKey];
      else {
        issues.push({
          row: rowNum,
          level: "error",
          message: `Entreprise introuvable « ${accountKey} »`,
        });
        return;
      }
    }

    const amount =
      Number(
        String(row.amount ?? "0").replace(/\s/g, "").replace(",", "."),
      ) || 0;
    const closeDate = (row.close_date ?? "").trim();
    const phaseParsed = parsePhase(row.phase ?? "");
    if ((row.phase ?? "").trim() && !phaseParsed) {
      issues.push({
        row: rowNum,
        level: "warning",
        message: `Phase « ${row.phase} » inconnue → Whitespace`,
      });
    }
    const phase = phaseParsed || "Whitespace";
    const kind = parseKind(row.kind ?? "") ?? "prospect";
    const solutionId = resolveSolution(row.solution ?? "", ctx.solutions);

    const existing =
      findOpportunityByKey(externalKey, ctx.opportunities) ??
      (!accountId.startsWith("__")
        ? ctx.opportunities.find(
            (o) =>
              o.active !== false &&
              o.primaryAccountId === accountId &&
              norm(o.name) === norm(name),
          )
        : undefined);

    oppsOut.push({
      row: rowNum,
      externalKey,
      action: existing ? "update" : "create",
      id: existing?.id,
      name,
      accountKey,
      accountId,
      amount,
      closeDate,
      phase,
      kind,
      solutionId,
    });
  });

  (tables.sold_solutions?.rows ?? []).forEach((row, idx) => {
    const rowNum = idx + 2;
    const accountKey = (row.account_key ?? "").trim();
    const solutionRaw = (row.solution ?? "").trim();
    let externalKey = (row.external_key || row.id || "").trim();
    if (!accountKey) {
      issues.push({
        row: rowNum,
        level: "error",
        message: "Compte (entreprise) manquant pour la solution vendue",
      });
      return;
    }
    if (!solutionRaw) {
      issues.push({
        row: rowNum,
        level: "error",
        message: "Solution manquante",
      });
      return;
    }
    if (!externalKey) {
      externalKey = `${accountKey}:${solutionRaw}`;
    }

    let accountId =
      keyToAccountId[accountKey] ?? keyToAccountId[slugifyKey(accountKey)];
    if (!accountId) {
      const byKey = findAccountByKey(accountKey, ctx.accounts);
      if (byKey) accountId = byKey.id;
      else accountId = `__pending__:${accountKey}`;
    }
    if (accountId.startsWith("__pending__:")) {
      const key = accountId.slice("__pending__:".length);
      if (
        !keyToAccountId[key] &&
        !keyToAccountId[slugifyKey(key)] &&
        !accountsOut.some(
          (a) =>
            a.externalKey === key ||
            slugifyKey(a.externalKey) === slugifyKey(key),
        )
      ) {
        issues.push({
          row: rowNum,
          level: "error",
          message: `Entreprise introuvable « ${accountKey} »`,
        });
        return;
      }
    }

    const solutionId = resolveSolution(solutionRaw, ctx.solutions);
    if (!solutionId) {
      issues.push({
        row: rowNum,
        level: "error",
        message: `Solution « ${solutionRaw} » introuvable dans le catalogue`,
      });
      return;
    }

    const modulesRaw = row.modules ?? "";
    const moduleIds = resolveModules(
      modulesRaw,
      solutionId,
      ctx.solutions,
      rowNum,
      issues,
    );
    const directionIds = resolveDirectionsMulti(
      row.directions ?? row.direction ?? "",
      ctx.directions,
      rowNum,
      issues,
    );
    const billedAmount =
      Number(
        String(row.billed_amount ?? row.amount ?? "0")
          .replace(/\s/g, "")
          .replace(",", "."),
      ) || 0;

    const resolvedAccountId = accountId.startsWith("__")
      ? undefined
      : accountId;
    const existing =
      findSoldByKey(
        externalKey,
        resolvedAccountId,
        solutionId,
        ctx.soldSolutions,
      ) ??
      (resolvedAccountId
        ? ctx.soldSolutions.find(
            (s) =>
              s.accountId === resolvedAccountId &&
              s.solutionId === solutionId,
          )
        : undefined);

    soldOut.push({
      row: rowNum,
      externalKey,
      action: existing ? "update" : "create",
      id: existing?.id,
      accountKey,
      accountId,
      solutionId,
      moduleIds,
      directionIds,
      billedAmount,
    });
  });

  return applyImportMode(
    {
      accounts: accountsOut,
      contacts: contactsOut,
      opportunities: oppsOut,
      soldSolutions: soldOut,
      issues,
      keyToAccountId,
    },
    mode,
  );
}

/** Filtre le plan selon le mode choisi par l'utilisateur. */
export function applyImportMode(plan: ImportPlan, mode: ImportMode): ImportPlan {
  if (mode === "upsert") return plan;

  const issues = [...plan.issues];
  const keep = <
    T extends { action: "create" | "update"; row: number; externalKey: string },
  >(
    rows: T[],
    label: string,
  ): T[] => {
    const out: T[] = [];
    for (const row of rows) {
      if (mode === "create") {
        if (row.action === "create") out.push(row);
        else {
          issues.push({
            row: row.row,
            level: "warning",
            message: `${label} « ${row.externalKey || row.row} » deja present — ignore (mode ajout)`,
          });
        }
      } else if (row.action === "update") {
        out.push(row);
      } else {
        issues.push({
          row: row.row,
          level: "error",
          message: `${label} cle « ${row.externalKey} » introuvable — impossible en mode mise a jour`,
        });
      }
    }
    return out;
  };

  return {
    accounts: keep(plan.accounts, "Compte"),
    contacts: keep(plan.contacts, "Contact"),
    opportunities: keep(plan.opportunities, "Opportunite"),
    soldSolutions: keep(plan.soldSolutions, "Solution vendue"),
    issues,
    keyToAccountId: plan.keyToAccountId,
  };
}

export function planHasBlockingErrors(plan: ImportPlan): boolean {
  return plan.issues.some((i) => i.level === "error");
}

/** Resout les ids `__new__:` / `__pending__:` apres creation des comptes. */
export function resolveAccountId(
  raw: string,
  keyToAccountId: Record<string, string>,
): string | null {
  if (!raw) return null;
  if (!raw.startsWith("__")) return raw;
  if (raw.startsWith("__new__:")) {
    const key = raw.slice("__new__:".length);
    const id =
      keyToAccountId[key] ?? keyToAccountId[slugifyKey(key)];
    return id && !id.startsWith("__") ? id : null;
  }
  if (raw.startsWith("__pending__:")) {
    const key = raw.slice("__pending__:".length);
    const id =
      keyToAccountId[key] ?? keyToAccountId[slugifyKey(key)];
    return id && !id.startsWith("__") ? id : null;
  }
  return null;
}

export function defaultMappingChecks(subtypes: OppMappingSubtypeDef[]) {
  return ensureRequiredMappingChecks({}, subtypes);
}
