import {
  ACCOUNT_SIZES,
  COMMERCIAL_STATUSES,
  migrateAccountSize,
  type Account,
  type AccountSize,
  type AccountType,
  type CommercialStatus,
  type Contact,
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

export type ImportEntityKind = "accounts" | "contacts" | "opportunities";

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

export type ImportPlan = {
  accounts: PlannedAccount[];
  contacts: PlannedContact[];
  opportunities: PlannedOpportunity[];
  issues: ImportRowIssue[];
  keyToAccountId: Record<string, string>;
};

export type ImportContext = {
  accounts: Account[];
  contacts: Contact[];
  opportunities: Opportunity[];
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
  if (n === "other" || n === "autre") return "Other";
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

function findAccountByKeyOrName(
  key: string,
  name: string,
  type: AccountType,
  accounts: Account[],
  keyMap: Record<string, string>,
): Account | undefined {
  if (key && keyMap[key]) {
    return accounts.find((a) => a.id === keyMap[key] && a.active !== false);
  }
  if (key) {
    const byId = accounts.find((a) => a.id === key && a.active !== false);
    if (byId) return byId;
  }
  return accounts.find(
    (a) =>
      a.active !== false &&
      a.type === type &&
      norm(a.name) === norm(name),
  );
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
  },
  ctx: ImportContext,
): ImportPlan {
  const issues: ImportRowIssue[] = [];
  const accountsOut: PlannedAccount[] = [];
  const contactsOut: PlannedContact[] = [];
  const oppsOut: PlannedOpportunity[] = [];
  const keyToAccountId: Record<string, string> = {};
  const pendingKeys = new Set<string>();

  // Seed map with existing account ids as keys (so account_key can be an id)
  for (const a of ctx.accounts) {
    if (a.active !== false) keyToAccountId[a.id] = a.id;
  }

  const accountRows = tables.accounts?.rows ?? [];
  // Pass 1: holdings
  accountRows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const type = parseType(row.type ?? "");
    if (type !== "Holding") return;
    const name = (row.name ?? "").trim();
    const externalKey = (row.external_key || row.id || "").trim();
    if (!name) {
      issues.push({ row: rowNum, level: "error", message: "Nom groupe manquant" });
      return;
    }
    const status = parseStatus(row.status ?? "");
    if (!status) {
      issues.push({
        row: rowNum,
        level: "error",
        message: `Statut invalide « ${row.status} »`,
      });
      return;
    }
    if (externalKey && pendingKeys.has(externalKey)) {
      issues.push({
        row: rowNum,
        level: "error",
        message: `Clé externe dupliquée « ${externalKey} »`,
      });
      return;
    }
    const existing = findAccountByKeyOrName(
      externalKey,
      name,
      "Holding",
      ctx.accounts,
      keyToAccountId,
    );
    const size = migrateAccountSize(row.size);
    if (row.size?.trim() && !size && !ACCOUNT_SIZES.includes(row.size.trim() as AccountSize)) {
      issues.push({
        row: rowNum,
        level: "warning",
        message: `Taille ignorée « ${row.size} »`,
      });
    }
    const planned: PlannedAccount = {
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
    };
    accountsOut.push(planned);
    if (externalKey) {
      pendingKeys.add(externalKey);
      keyToAccountId[externalKey] = existing?.id ?? `__new__:${externalKey}`;
    }
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
    const name = (row.name ?? "").trim();
    const externalKey = (row.external_key || row.id || "").trim();
    if (!name) {
      issues.push({
        row: rowNum,
        level: "error",
        message: "Nom entreprise manquant",
      });
      return;
    }
    const status = parseStatus(row.status ?? "");
    if (!status) {
      issues.push({
        row: rowNum,
        level: "error",
        message: `Statut invalide « ${row.status} »`,
      });
      return;
    }
    if (externalKey && pendingKeys.has(externalKey)) {
      issues.push({
        row: rowNum,
        level: "error",
        message: `Clé externe dupliquée « ${externalKey} »`,
      });
      return;
    }
    const holdingKey = (row.holding_key ?? "").trim();
    let holdingId: string | null = null;
    if (holdingKey) {
      const mapped = keyToAccountId[holdingKey];
      if (mapped) {
        holdingId = mapped.startsWith("__new__:") ? null : mapped;
        // will resolve at apply using key
      } else {
        const hold = ctx.accounts.find(
          (a) =>
            a.active !== false &&
            a.type === "Holding" &&
            (a.id === holdingKey || norm(a.name) === norm(holdingKey)),
        );
        if (hold) holdingId = hold.id;
        else {
          issues.push({
            row: rowNum,
            level: "error",
            message: `Groupe introuvable « ${holdingKey} »`,
          });
          return;
        }
      }
    }

    const existing = findAccountByKeyOrName(
      externalKey,
      name,
      "Entreprise",
      ctx.accounts,
      keyToAccountId,
    );
    const size = migrateAccountSize(row.size);
    const planned: PlannedAccount = {
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
    };
    accountsOut.push(planned);
    if (externalKey) {
      pendingKeys.add(externalKey);
      keyToAccountId[externalKey] = existing?.id ?? `__new__:${externalKey}`;
    }
  });

  // Contacts
  (tables.contacts?.rows ?? []).forEach((row, idx) => {
    const rowNum = idx + 2;
    const name = (row.name ?? "").trim();
    const externalKey = (row.external_key || row.id || "").trim();
    const accountKey = (row.account_key ?? "").trim();
    if (!name) {
      issues.push({ row: rowNum, level: "error", message: "Nom contact manquant" });
      return;
    }
    if (!accountKey) {
      issues.push({
        row: rowNum,
        level: "error",
        message: "account_key manquant",
      });
      return;
    }
    let accountId = keyToAccountId[accountKey];
    if (!accountId || accountId.startsWith("__new__:")) {
      const byName = ctx.accounts.find(
        (a) =>
          a.active !== false &&
          a.type === "Entreprise" &&
          norm(a.name) === norm(accountKey),
      );
      if (byName) accountId = byName.id;
      else if (!accountId) {
        // Will be resolved at apply if key is in import
        accountId = `__pending__:${accountKey}`;
      }
    }
    if (accountId.startsWith("__pending__:")) {
      const key = accountId.slice("__pending__:".length);
      if (!keyToAccountId[key] && !accountsOut.some((a) => a.externalKey === key)) {
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
          message: `Direction « ${directionRaw} » introuvable → défaut`,
        });
      }
    }

    const resolvedAccountId = accountId.startsWith("__")
      ? accountId
      : accountId;
    const existing = ctx.contacts.find(
      (c) =>
        c.active !== false &&
        !resolvedAccountId.startsWith("__") &&
        c.accountId === resolvedAccountId &&
        norm(c.name) === norm(name),
    );

    contactsOut.push({
      row: rowNum,
      externalKey,
      action: existing ? "update" : "create",
      id: existing?.id,
      name,
      title: (row.title ?? "").trim(),
      accountKey,
      accountId: resolvedAccountId,
      directionId,
    });
  });

  // Opportunities
  (tables.opportunities?.rows ?? []).forEach((row, idx) => {
    const rowNum = idx + 2;
    const name = (row.name ?? "").trim();
    const externalKey = (row.external_key || row.id || "").trim();
    const accountKey = (row.account_key ?? "").trim();
    if (!name) {
      issues.push({
        row: rowNum,
        level: "error",
        message: "Nom opportunité manquant",
      });
      return;
    }
    if (!accountKey) {
      issues.push({
        row: rowNum,
        level: "error",
        message: "account_key manquant",
      });
      return;
    }

    let accountId = keyToAccountId[accountKey];
    if (!accountId || accountId.startsWith("__new__:")) {
      const byName = ctx.accounts.find(
        (a) =>
          a.active !== false &&
          a.type === "Entreprise" &&
          (a.id === accountKey || norm(a.name) === norm(accountKey)),
      );
      if (byName) accountId = byName.id;
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

    // Entreprises only for opps
    if (!accountId.startsWith("__")) {
      const acc = ctx.accounts.find((a) => a.id === accountId);
      const plannedAcc = accountsOut.find(
        (a) => a.externalKey === accountKey || a.id === accountId,
      );
      const type = acc?.type ?? plannedAcc?.type;
      if (type === "Holding") {
        issues.push({
          row: rowNum,
          level: "error",
          message: "Une opportunité doit être rattachée à une Entreprise",
        });
        return;
      }
    }

    const phase = parsePhase(row.phase ?? "");
    if (!phase) {
      issues.push({
        row: rowNum,
        level: "error",
        message: `Phase invalide « ${row.phase} »`,
      });
      return;
    }
    const kind = parseKind(row.kind ?? "");
    if (!kind) {
      issues.push({
        row: rowNum,
        level: "error",
        message: `Nature invalide « ${row.kind} »`,
      });
      return;
    }
    const amountRaw = (row.amount ?? "").replace(/\s/g, "").replace(",", ".");
    const amount = amountRaw ? Number(amountRaw) : 0;
    if (amountRaw && !Number.isFinite(amount)) {
      issues.push({
        row: rowNum,
        level: "error",
        message: `Montant invalide « ${row.amount} »`,
      });
      return;
    }
    const solutionRaw = (row.solution ?? "").trim();
    const solutionId = resolveSolution(solutionRaw, ctx.solutions);
    if (solutionRaw && !solutionId) {
      issues.push({
        row: rowNum,
        level: "warning",
        message: `Solution « ${solutionRaw} » introuvable → vide`,
      });
    }

    const existing =
      !accountId.startsWith("__")
        ? ctx.opportunities.find(
            (o) =>
              o.active !== false &&
              o.primaryAccountId === accountId &&
              norm(o.name) === norm(name),
          )
        : undefined;

    oppsOut.push({
      row: rowNum,
      externalKey,
      action: existing ? "update" : "create",
      id: existing?.id,
      name,
      accountKey,
      accountId,
      amount: Number.isFinite(amount) ? amount : 0,
      closeDate: (row.close_date ?? "").trim(),
      phase,
      kind,
      solutionId,
    });
  });

  return {
    accounts: accountsOut,
    contacts: contactsOut,
    opportunities: oppsOut,
    issues,
    keyToAccountId,
  };
}

export function planHasBlockingErrors(plan: ImportPlan): boolean {
  return plan.issues.some((i) => i.level === "error");
}

/** Résout les ids `__new__:` / `__pending__:` après création des comptes. */
export function resolveAccountId(
  raw: string,
  keyToAccountId: Record<string, string>,
): string | null {
  if (!raw) return null;
  if (!raw.startsWith("__")) return raw;
  if (raw.startsWith("__new__:")) {
    const key = raw.slice("__new__:".length);
    const id = keyToAccountId[key];
    return id && !id.startsWith("__") ? id : null;
  }
  if (raw.startsWith("__pending__:")) {
    const key = raw.slice("__pending__:".length);
    const id = keyToAccountId[key];
    return id && !id.startsWith("__") ? id : null;
  }
  return null;
}

export function defaultMappingChecks(subtypes: OppMappingSubtypeDef[]) {
  return ensureRequiredMappingChecks({}, subtypes);
}
