import {
  buildKpiClassifier,
  defaultKpiClassifier,
  type KpiClassifier,
  type SalesTaxonomy,
} from "./config/salesTaxonomy";
import { DEFAULT_KPI_RULES, type KpiRulesConfig } from "./config/types";

/** Statut commercial — entreprise et persona (ids catalogue OrgConfig). */
export type CommercialStatus = string;

/** Holding = groupe (libellé UI « Groupe ») ; Entreprise = entité légale. */
export type AccountType = "Holding" | "Entreprise";

export const accountTypeLabel: Record<AccountType, string> = {
  Holding: "Groupe",
  Entreprise: "Entreprise",
};

/** Id de type de contact — catalogue personnalisable (voir OrgConfig). */
export type Role = string;

/** Engagement d’un contact — uniquement dans le cadre d’une opportunité. */
export type Status =
  | "Unknown"
  | "Identified"
  | "Engaged"
  | "Aligned"
  | "Opposed";

export const ENGAGEMENT_STATUSES: Status[] = [
  "Unknown",
  "Identified",
  "Engaged",
  "Aligned",
  "Opposed",
];

export const engagementLabel: Record<Status, string> = {
  Unknown: "Inconnu",
  Identified: "Identifié",
  Engaged: "Engagé",
  Aligned: "Aligné",
  Opposed: "Opposé",
};

/** Relations entre contacts (y compris cross-entreprises). */
export type ContactRelationType =
  | "ReportsTo"
  | "Influences"
  | "AlliesWith"
  | "Blocks"
  | "FormerColleague"
  | "Knows";

/** Relations entre entreprises (hors hiérarchie groupe). */
export type CompanyRelationType =
  | "PartnerOf"
  | "CompetitorOf"
  | "SameSectorAs"
  | "SupplierOf"
  | "CustomerOf"
  | "InvestorIn";

type SoldSolutionLegacyFields = {
  /** @deprecated lire via soldLinePersonaIds — ancien champ direction */
  directionId?: string | null;
  directionIds?: string[];
};

export type SoldSolution = {
  id: string;
  solutionId: string;
  accountId: string;
  /**
   * Legacy — une seule persona.
   * Préférer `personaIds` ; synchronisé à la migration / upsert.
   */
  personaId: string | null;
  /** Personas rattachées (vide = niveau entreprise). */
  personaIds?: string[];
  /** Modules installés / ciblés pour cette solution. */
  moduleIds?: string[];
  currency: "EUR";
  /** CA facturé (€) */
  billedAmount: number;
};

/** Personas effectives d’une ligne (multi + legacy direction). */
export function soldLinePersonaIds(
  s: SoldSolution & SoldSolutionLegacyFields,
): string[] {
  if (Array.isArray(s.personaIds) && s.personaIds.length > 0) {
    return [...new Set(s.personaIds.filter(Boolean))];
  }
  if (s.personaId) return [s.personaId];
  if (Array.isArray(s.directionIds) && s.directionIds.length > 0) {
    return [...new Set(s.directionIds.filter(Boolean))];
  }
  if (s.directionId) return [s.directionId];
  return [];
}

/** @deprecated utiliser soldLinePersonaIds */
export const soldLineDirectionIds = soldLinePersonaIds;

export function isCompanyLevelSoldLine(s: SoldSolution): boolean {
  return soldLinePersonaIds(s).length === 0;
}

export function soldLineMatchesPersona(
  s: SoldSolution,
  personaId: string,
): boolean {
  return soldLinePersonaIds(s).includes(personaId);
}

/** @deprecated utiliser soldLineMatchesPersona */
export function soldLineMatchesDirection(
  s: SoldSolution,
  directionId: string,
): boolean {
  return soldLineMatchesPersona(s, directionId);
}

export function normalizeSoldSolution(
  raw: SoldSolution & SoldSolutionLegacyFields & { targetAmount?: number },
): SoldSolution {
  const personaIds = soldLinePersonaIds(raw);
  const {
    targetAmount: _removed,
    directionId: _legacyDir,
    directionIds: _legacyDirs,
    ...rest
  } = raw;
  return {
    ...rest,
    personaIds,
    personaId: personaIds[0] ?? null,
    moduleIds: Array.isArray(raw.moduleIds)
      ? [...new Set(raw.moduleIds.filter(Boolean))]
      : [],
  };
}

/** Tranche d’effectif (ids catalogue OrgConfig). */
export type AccountSize = string;

export const ACCOUNT_SIZES: AccountSize[] = [
  "1-1000",
  "1001-2500",
  "2501-5000",
  "5001-10000",
  "10000+",
];

export const accountSizeLabel: Record<string, string> = {
  "1-1000": "Jusqu’à 1 000",
  "1001-2500": "1 001 – 2 500",
  "2501-5000": "2 501 – 5 000",
  "5001-10000": "5 001 – 10 000",
  "10000+": "10 000+",
};

/** Migre les anciennes tailles / tranches. */
export function migrateAccountSize(raw: unknown): AccountSize | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  if ((ACCOUNT_SIZES as string[]).includes(raw)) return raw;
  if (raw === "SMB" || raw === "1-9" || raw === "10-49") return "1-1000";
  if (raw === "MidMarket" || raw === "50-249" || raw === "250-999")
    return "1-1000";
  if (raw === "Enterprise" || raw === "1000+") return "1001-2500";
  return raw;
}

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  commercialStatus: CommercialStatus;
  holdingId: string | null;
  /** Secteur d’activité (catalogue org) */
  sector?: string;
  size?: AccountSize;
  x: number;
  y: number;
  active: boolean;
  /** Gestionnaire DBR (profiles.id). */
  ownerProfileId?: string | null;
  /** Id Company HubSpot (sync CRM). */
  hubspotCompanyId?: string | null;
  hubspotSyncedAt?: string | null;
  hubspotDirty?: boolean;
};

export type Contact = {
  id: string;
  accountId: string;
  personaId: string;
  name: string;
  /** Prénom (sync CRM). */
  firstName?: string | null;
  /** Nom de famille (sync CRM). */
  lastName?: string | null;
  title: string;
  email?: string | null;
  phone?: string | null;
  x: number;
  y: number;
  active: boolean;
  /** Gestionnaire DBR (profiles.id). */
  ownerProfileId?: string | null;
  hubspotContactId?: string | null;
  hubspotSyncedAt?: string | null;
  hubspotDirty?: boolean;
};

export type CompanyRelation = {
  id: string;
  source: string;
  target: string;
  relation: CompanyRelationType;
};

export type ContactRelation = {
  id: string;
  source: string;
  target: string;
  relation: ContactRelationType;
};

export const defaultAccounts: Account[] = [
  {
    id: "hold-acme",
    name: "Acme Groupe",
    type: "Holding",
    commercialStatus: "Client",
    holdingId: null,
    sector: "Industrie / Manufacturing",
    size: "10000+",
    x: 520,
    y: 10,
    active: true,
  },
  {
    id: "fr",
    name: "Acme France",
    type: "Entreprise",
    commercialStatus: "Client",
    holdingId: "hold-acme",
    size: "2501-5000",
    x: 160,
    y: 130,
    active: true,
  },
  {
    id: "de",
    name: "Acme Germany",
    type: "Entreprise",
    commercialStatus: "Prospect",
    holdingId: "hold-acme",
    size: "1001-2500",
    x: 520,
    y: 130,
    active: true,
  },
  {
    id: "hold-nova",
    name: "Nova Group",
    type: "Holding",
    commercialStatus: "Concurrent",
    holdingId: null,
    sector: "Tech / SaaS",
    size: "2501-5000",
    x: 980,
    y: 10,
    active: true,
  },
  {
    id: "nova-fr",
    name: "Nova France",
    type: "Entreprise",
    commercialStatus: "Concurrent",
    holdingId: "hold-nova",
    size: "1001-2500",
    x: 980,
    y: 130,
    active: true,
  },
  {
    id: "hold-orbit",
    name: "Orbit Partners",
    type: "Holding",
    commercialStatus: "Partner",
    holdingId: null,
    sector: "Services",
    size: "1-1000",
    x: -40,
    y: 10,
    active: true,
  },
  {
    id: "hold-steel",
    name: "SteelCorp",
    type: "Holding",
    commercialStatus: "Prospect",
    holdingId: null,
    sector: "Industrie / Manufacturing",
    size: "1001-2500",
    x: 1180,
    y: 10,
    active: true,
  },
  {
    id: "steel-fr",
    name: "SteelCorp France",
    type: "Entreprise",
    commercialStatus: "Prospect",
    holdingId: "hold-steel",
    size: "1001-2500",
    x: 1180,
    y: 130,
    active: true,
  },
];

/** Seed — préférer useDomain().accounts */
export const accounts = defaultAccounts;

export const defaultContacts: Contact[] = [
  {
    id: "c1",
    accountId: "fr",
    personaId: "persona-cfo",
    name: "Marie Dupont",
    title: "CFO",
    x: 20,
    y: 430,
    active: true,
  },
  {
    id: "c2",
    accountId: "fr",
    personaId: "persona-coo",
    name: "Thomas Bernard",
    title: "VP Sales Ops",
    x: 220,
    y: 430,
    active: true,
  },
  {
    id: "c3",
    accountId: "de",
    personaId: "persona-cio",
    name: "Hans Mueller",
    title: "CTO",
    x: 620,
    y: 430,
    active: true,
  },
  {
    id: "c4",
    accountId: "de",
    personaId: "persona-cpo",
    name: "Greta Klein",
    title: "Head of Procurement",
    x: 820,
    y: 430,
    active: true,
  },
  {
    id: "c5",
    accountId: "fr",
    personaId: "persona-cio",
    name: "Léa Martin",
    title: "IT Manager",
    x: 420,
    y: 430,
    active: true,
  },
  {
    id: "c6",
    accountId: "nova-fr",
    personaId: "persona-champion",
    name: "Julie Renard",
    title: "Enterprise AE",
    x: 1020,
    y: 430,
    active: true,
  },
];

/** Seed — préférer useDomain().contacts */
export const contacts = defaultContacts;

export const defaultCompanyRelations: CompanyRelation[] = [
  {
    id: "cr2",
    source: "hold-orbit",
    target: "hold-acme",
    relation: "PartnerOf",
  },
  {
    id: "cr4",
    source: "hold-orbit",
    target: "fr",
    relation: "SupplierOf",
  },
  {
    id: "cr-comp-1",
    source: "hold-nova",
    target: "hold-acme",
    relation: "CompetitorOf",
  },
  {
    id: "cr-sec-1",
    source: "hold-nova",
    target: "hold-acme",
    relation: "SameSectorAs",
  },
];

export const companyRelations = defaultCompanyRelations;

export const membershipEdges = contacts
  .filter((c) => c.personaId)
  .map((c) => ({
    id: `e-${c.personaId}-${c.id}`,
    source: c.personaId,
    target: c.id,
    type: "hasMember" as const,
  }));

export const defaultContactRelations: ContactRelation[] = [
  { id: "i1", source: "c2", target: "c1", relation: "Influences" },
  { id: "i2", source: "c2", target: "c1", relation: "ReportsTo" },
  { id: "i3", source: "c3", target: "c1", relation: "Influences" },
  { id: "i4", source: "c4", target: "c1", relation: "Blocks" },
  { id: "i5", source: "c5", target: "c2", relation: "AlliesWith" },
  { id: "i5b", source: "c5", target: "c2", relation: "ReportsTo" },
  { id: "i6", source: "c6", target: "c2", relation: "Knows" },
  { id: "i7", source: "c6", target: "c3", relation: "FormerColleague" },
];

export const contactRelations = defaultContactRelations;

export function buildHoldingEdges(list: Account[]) {
  return list
    .filter((a) => a.active !== false && a.type === "Entreprise" && a.holdingId)
    .map((a) => ({
      id: `h-${a.holdingId}-${a.id}`,
      source: a.holdingId!,
      target: a.id,
      type: "holdingOf" as const,
    }));
}

/** @deprecated utiliser buildHoldingEdges(accounts dynamiques) */
export const holdingEdges = buildHoldingEdges(defaultAccounts);

export const commercialLabel: Record<string, string> = {
  Client: "Client",
  Prospect: "Prospect",
  Concurrent: "Concurrent",
  Partner: "Partenaire",
};

export const COMMERCIAL_STATUSES: CommercialStatus[] = [
  "Client",
  "Prospect",
  "Concurrent",
  "Partner",
];

export const companyRelationLabel: Record<CompanyRelationType, string> = {
  PartnerOf: "Partenaire",
  CompetitorOf: "Concurrent",
  SameSectorAs: "Même secteur",
  SupplierOf: "Fournisseur",
  CustomerOf: "Client de",
  InvestorIn: "Investisseur",
};

/** Relations écosystème affichables / filtrables en cartographie. */
export const ECOSYSTEM_COMPANY_RELATIONS: CompanyRelationType[] = [
  "CompetitorOf",
  "SameSectorAs",
  "PartnerOf",
];

/** Liens contact « réseau métier » (hors hiérarchie ReportsTo). */
export const METIER_CONTACT_RELATIONS: ContactRelationType[] = [
  "Influences",
  "AlliesWith",
  "Blocks",
  "FormerColleague",
  "Knows",
];

export const contactRelationLabel: Record<ContactRelationType, string> = {
  ReportsTo: "Rapporte à (parent)",
  Influences: "Influences",
  AlliesWith: "Alliés avec",
  Blocks: "Bloque",
  FormerColleague: "Ex-collègue",
  Knows: "Connaît",
};

/** Parent hiérarchique : cible d’un ReportsTo (enfant → parent). */
export function getContactParentId(
  contactId: string,
  relations: ContactRelation[],
): string | null {
  return (
    relations.find(
      (r) => r.relation === "ReportsTo" && r.source === contactId,
    )?.target ?? null
  );
}

/** Enfants directs : sources des ReportsTo vers ce contact. */
export function getContactChildrenIds(
  contactId: string,
  relations: ContactRelation[],
): string[] {
  return relations
    .filter((r) => r.relation === "ReportsTo" && r.target === contactId)
    .map((r) => r.source);
}

/** Empêche un cycle dans l’arbre ReportsTo (enfant → … → parent). */
export function wouldCreateReportsToCycle(
  childId: string,
  parentId: string,
  relations: ContactRelation[],
): boolean {
  if (childId === parentId) return true;
  let cursor: string | null = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === childId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = getContactParentId(cursor, relations);
  }
  return false;
}

export const defaultSolutions = [
  { id: "sol-platform", name: "Platform EU" },
  { id: "sol-analytics", name: "Analytics Suite" },
  { id: "sol-support", name: "Premium Support" },
];

/** @deprecated préférer useOrgConfig().solutionLabel */
export const solutions = defaultSolutions;

/**
 * Solutions vendues démo (seed).
 * Les instances éditables vivent dans SalesContext + localStorage.
 */
export const defaultSoldSolutions: SoldSolution[] = [
  {
    id: "ss1",
    solutionId: "sol-platform",
    accountId: "fr",
    personaId: null,
    currency: "EUR",
    billedAmount: 320_000,
  },
  {
    id: "ss2",
    solutionId: "sol-support",
    accountId: "fr",
    personaId: null,
    currency: "EUR",
    billedAmount: 48_000,
  },
  {
    id: "ss3",
    solutionId: "sol-analytics",
    accountId: "fr",
    personaId: "persona-cfo",
    currency: "EUR",
    billedAmount: 75_000,
  },
  {
    id: "ss4",
    solutionId: "sol-platform",
    accountId: "de",
    personaId: "persona-cio",
    currency: "EUR",
    billedAmount: 40_000,
  },
  {
    id: "ss5",
    solutionId: "sol-analytics",
    accountId: "de",
    personaId: null,
    currency: "EUR",
    billedAmount: 0,
  },
];

/** Alias seed pour imports existants — ne plus muter. */
export const soldSolutions = defaultSoldSolutions;

export function solutionName(
  solutionId: string,
  catalog: { id: string; name: string }[] = defaultSolutions,
) {
  return catalog.find((s) => s.id === solutionId)?.name ?? solutionId;
}

/** Source minimale pour dériver cible / potentiel depuis les opportunités. */
export type OppAmountSource = {
  amount: number;
  phase: string;
  solutionId: string;
  primaryAccountId: string;
  /** Nature du deal — requis pour isoler les renouvellements. */
  kind?: string;
  closeDate?: string;
};

/** Phase initiale : up/cross potentiel, pas encore une opportunité engagée. */
export function isWhitespacePhase(phase: string): boolean {
  return defaultKpiClassifier.isWhitespacePhase(phase);
}

/**
 * Opportunité engagée (pipeline) : Discovery → Negotiation.
 * Hors Whitespace et hors clos.
 */
export function isPipelineOpportunityPhase(phase: string): boolean {
  return defaultKpiClassifier.isPipelineOpportunityPhase(phase);
}

/** Tout deal encore « vivant » (whitespace + pipeline). */
export function isOpenOpportunityPhase(phase: string): boolean {
  return defaultKpiClassifier.isOpenOpportunityPhase(phase);
}

/** Compte dans le pipeline « vivant » (hors Closed Lost) — hors CA facturé. */
export function isTargetOpportunityPhase(phase: string): boolean {
  return !defaultKpiClassifier.isLostPhase(phase);
}

export function isRenewalOpportunity(o: { kind?: string }): boolean {
  return defaultKpiClassifier.isRenewalOpportunity(o);
}

/** Whitespace (cible) : phase initiale, hors renouvellements. */
export function isWhitespaceTargetOpp(o: OppAmountSource): boolean {
  return defaultKpiClassifier.isWhitespaceTargetOpp(o);
}

/** Pipeline (cible) : engagé, hors renouvellements. */
export function isPipelineTargetOpp(o: OppAmountSource): boolean {
  return defaultKpiClassifier.isPipelineTargetOpp(o);
}

/** Renouvellement ouvert (cible). */
export function isOpenRenewalOpp(o: OppAmountSource): boolean {
  return defaultKpiClassifier.isOpenRenewalOpp(o);
}

/** Closed Won de l’année civile (CA installé). */
export function isWonInstalledOpp(
  o: OppAmountSource,
  year = new Date().getFullYear(),
): boolean {
  return defaultKpiClassifier.isWonInstalledOpp(o, year);
}

export function opportunitiesForAccountScope(
  accountId: string,
  opportunities: OppAmountSource[],
  accountList: Account[] = defaultAccounts,
): OppAmountSource[] {
  const account = accountList.find((a) => a.id === accountId);
  if (!account) return [];
  if (account.type === "Holding") {
    const childIds = new Set(
      accountList
        .filter((a) => a.holdingId === accountId && a.active !== false)
        .map((a) => a.id),
    );
    return opportunities.filter(
      (o) =>
        o.primaryAccountId === accountId || childIds.has(o.primaryAccountId),
    );
  }
  return opportunities.filter((o) => o.primaryAccountId === accountId);
}

export function opportunitiesForPersonaScope(
  personaId: string,
  opportunities: OppAmountSource[],
  contacts: { accountId: string; personaId: string }[],
): OppAmountSource[] {
  const accountIds = new Set(
    contacts.filter((c) => c.personaId === personaId).map((c) => c.accountId),
  );
  if (accountIds.size === 0) return [];
  return opportunities.filter((o) => accountIds.has(o.primaryAccountId));
}

export function sumOpportunityAmounts(
  opportunities: OppAmountSource[],
  predicate: (o: OppAmountSource) => boolean = () => true,
): number {
  return opportunities.reduce(
    (sum, o) => (predicate(o) ? sum + (Number(o.amount) || 0) : sum),
    0,
  );
}

export function soldSolutionsForAccount(
  accountId: string,
  lines: SoldSolution[] = defaultSoldSolutions,
) {
  return lines.filter(
    (s) => s.accountId === accountId && isCompanyLevelSoldLine(s),
  );
}

export function soldSolutionsForPersona(
  personaId: string,
  lines: SoldSolution[] = defaultSoldSolutions,
) {
  return lines.filter((s) => soldLineMatchesPersona(s, personaId));
}

export function formatEur(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export type SolutionKpiLine = {
  solutionId: string;
  name: string;
  billedAmount: number;
  /** Whitespace + pipeline + renouvellement. */
  targetAmount: number;
  /** Pipeline engagé hors renouvellement (Discovery → Negotiation). */
  potentialAmount: number;
  /** Whitespace hors renouvellement. */
  whitespaceAmount: number;
  /** Renouvellements ouverts. */
  renewalAmount: number;
  count: number;
};

export type ScopeKpis = {
  scopeLabel: string;
  /** CA facturé (lignes) + opportunités Closed Won de l’année. */
  billedAmount: number;
  /** Whitespace + pipeline + renouvellement. */
  targetAmount: number;
  /** Pipeline engagé hors renouvellement. */
  potentialAmount: number;
  /** Whitespace hors renouvellement. */
  whitespaceAmount: number;
  /** Renouvellements ouverts. */
  renewalAmount: number;
  solutionCount: number;
  bySolution: SolutionKpiLine[];
  lines: SoldSolution[];
};

/**
 * KPIs d’un périmètre :
 * - CA installé = lignes de vente facturées (Won → crée/maj une ligne)
 * - Pipeline / Whitespace / Renouvellement en cours selon phases & types
 * - Cible = somme des buckets activés dans kpiRules
 */
export function aggregateKpis(
  lines: SoldSolution[],
  scopeLabel: string,
  labelOf: (solutionId: string) => string = solutionName,
  opportunities: OppAmountSource[] = [],
  year = new Date().getFullYear(),
  taxonomy?: SalesTaxonomy,
): ScopeKpis {
  const rules: KpiRulesConfig = taxonomy?.kpiRules ?? DEFAULT_KPI_RULES;
  const clf: KpiClassifier = taxonomy
    ? buildKpiClassifier(taxonomy)
    : defaultKpiClassifier;

  const salesBilled = rules.includeSalesInInstalled
    ? lines.reduce((a, s) => a + s.billedAmount, 0)
    : 0;
  const wonInstalled = rules.includeWonOppsInInstalled
    ? sumOpportunityAmounts(opportunities, (o) =>
        clf.isWonInstalledOpp(o, year),
      )
    : 0;
  const billedAmount = salesBilled + wonInstalled;

  const potentialAmount = rules.includePipelineInTarget
    ? sumOpportunityAmounts(opportunities, clf.isPipelineTargetOpp)
    : 0;
  const whitespaceAmount = rules.includeWhitespaceInTarget
    ? sumOpportunityAmounts(opportunities, clf.isWhitespaceTargetOpp)
    : 0;
  const renewalAmount = rules.includeRenewalInTarget
    ? sumOpportunityAmounts(opportunities, clf.isOpenRenewalOpp)
    : 0;
  const targetAmount = potentialAmount + whitespaceAmount + renewalAmount;

  const byId = new Map<
    string,
    {
      billed: number;
      potential: number;
      whitespace: number;
      renewal: number;
      count: number;
    }
  >();

  for (const line of lines) {
    const cur = byId.get(line.solutionId) ?? {
      billed: 0,
      potential: 0,
      whitespace: 0,
      renewal: 0,
      count: 0,
    };
    if (rules.includeSalesInInstalled) cur.billed += line.billedAmount;
    cur.count += 1;
    byId.set(line.solutionId, cur);
  }

  for (const o of opportunities) {
    const sid = o.solutionId || "__none__";
    if (sid === "__none__") continue;
    const cur = byId.get(sid) ?? {
      billed: 0,
      potential: 0,
      whitespace: 0,
      renewal: 0,
      count: 0,
    };
    const amt = Number(o.amount) || 0;
    if (rules.includeWonOppsInInstalled && clf.isWonInstalledOpp(o, year)) {
      cur.billed += amt;
    }
    if (rules.includePipelineInTarget && clf.isPipelineTargetOpp(o)) {
      cur.potential += amt;
    }
    if (rules.includeWhitespaceInTarget && clf.isWhitespaceTargetOpp(o)) {
      cur.whitespace += amt;
    }
    if (rules.includeRenewalInTarget && clf.isOpenRenewalOpp(o)) {
      cur.renewal += amt;
    }
    byId.set(sid, cur);
  }

  const bySolution: SolutionKpiLine[] = [...byId.entries()].map(
    ([solutionId, cur]) => ({
      solutionId,
      name: labelOf(solutionId),
      billedAmount: cur.billed,
      potentialAmount: cur.potential,
      whitespaceAmount: cur.whitespace,
      renewalAmount: cur.renewal,
      targetAmount: cur.potential + cur.whitespace + cur.renewal,
      count: cur.count,
    }),
  );

  bySolution.sort(
    (a, b) =>
      b.potentialAmount +
      b.whitespaceAmount +
      b.renewalAmount -
      (a.potentialAmount + a.whitespaceAmount + a.renewalAmount),
  );

  return {
    scopeLabel,
    billedAmount,
    targetAmount,
    potentialAmount,
    whitespaceAmount,
    renewalAmount,
    solutionCount: bySolution.length,
    bySolution,
    lines,
  };
}

/** Lignes de vente dans le périmètre d’un compte (entreprise = ses lignes ; holding = entreprises du groupe). */
export function salesForAccountScope(
  accountId: string,
  lines: SoldSolution[] = defaultSoldSolutions,
  accountList: Account[] = defaultAccounts,
): SoldSolution[] {
  const account = accountList.find((a) => a.id === accountId);
  if (!account) return [];
  if (account.type === "Holding") {
    const childIds = accountList
      .filter((a) => a.holdingId === accountId && a.active !== false)
      .map((a) => a.id);
    return lines.filter(
      (s) => s.accountId === accountId || childIds.includes(s.accountId),
    );
  }
  return lines.filter((s) => s.accountId === accountId);
}

export function salesForPersonaScope(
  personaId: string,
  lines: SoldSolution[] = defaultSoldSolutions,
): SoldSolution[] {
  return lines.filter((s) => soldLineMatchesPersona(s, personaId));
}
