import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../supabase/client";
import {
  isRemoteOrgConfigEmpty,
  loadOrgConfigRemote,
  logSyncError,
  pushOrgConfigRemote,
  upsertOrgConfigRemote,
} from "../sync";
import { defaultConfig } from "./defaults";
import {
  normalizeOppMappingSubtypes,
  normalizeOppMappingThemes,
} from "./oppMappingLibrary";
import { ensureProcessDomainsForPhases } from "../opportunities/salesProcess";
import {
  CONFIG_STORAGE_KEY,
  normalizeCatalogFeatures,
  type BoCategoryDef,
  type BoFieldDef,
  type BoFieldKind,
  type CatalogFeatures,
  type CompetitorDef,
  type CompetitorFeatureDef,
  type ContactTypeDef,
  type PersonaDef,
  type OppMappingCategory,
  type OppMappingSubtypeDef,
  type OppMappingThemeDef,
  type OppVariableDef,
  type OppVariableKind,
  type OrgConfig,
  type OrgProfile,
  type CompellingEventDef,
  type RiskMatrixConfig,
  type SectorDef,
  type ProcessDomainDef,
  type ProcessQuestionDef,
  type SolutionDef,
  type SolutionModuleDef,
  type UspDef,
  type OppPhaseDef,
  type OppPhaseKpiRole,
  type OppKindDef,
  type OppKindTargetMode,
  type CommercialStatusDef,
  type AccountSizeDef,
  type KpiRulesConfig,
  DEFAULT_KPI_RULES,
  DEFAULT_OPP_PHASES,
  DEFAULT_OPP_KINDS,
  isBuiltInOppPhaseId,
} from "./types";
import {
  salesTaxonomyFromConfig,
  buildKpiClassifier,
  activeSortedPhases,
  activeSortedKinds,
  activeSortedStatuses,
  activeSortedSizes,
  phaseLabelOf,
  kindLabelOf,
  statusLabelOf,
  sizeLabelOf,
  type SalesTaxonomy,
  type KpiClassifier,
} from "./salesTaxonomy";

function clampPct(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function normalizeRiskMatrix(
  raw: Partial<RiskMatrixConfig> | undefined,
): RiskMatrixConfig {
  const base = structuredClone(defaultConfig.riskMatrix);
  if (!raw) return base;

  // Legacy: single processThreshold → low band
  const legacyLow = Number(raw.processThreshold);
  const lowFromLegacy =
    Number.isFinite(legacyLow) && legacyLow >= 0 && legacyLow <= 100
      ? Math.round(legacyLow)
      : null;

  let processHighThreshold = clampPct(
    Number(raw.processHighThreshold),
    base.processHighThreshold,
  );
  let processLowThreshold = clampPct(
    Number(
      raw.processLowThreshold ??
        (lowFromLegacy != null ? lowFromLegacy : base.processLowThreshold),
    ),
    base.processLowThreshold,
  );
  if (processLowThreshold >= processHighThreshold) {
    processLowThreshold = Math.max(0, processHighThreshold - 1);
  }

  const pipelinePhases = Array.isArray(raw.pipelinePhases)
    ? raw.pipelinePhases.map(String).map((p) => p.trim()).filter(Boolean)
    : base.pipelinePhases;

  const axis = raw.axisLabels as
    | Partial<RiskMatrixConfig["axisLabels"]> & {
        impactHigh?: string;
        impactLow?: string;
        riskLow?: string;
        riskHigh?: string;
      }
    | undefined;

  const axisLabels = {
    processHigh:
      axis?.processHigh?.trim() ||
      axis?.riskLow?.trim() ||
      base.axisLabels.processHigh,
    processMid: axis?.processMid?.trim() || base.axisLabels.processMid,
    processLow:
      axis?.processLow?.trim() ||
      axis?.riskHigh?.trim() ||
      base.axisLabels.processLow,
    pipeline: axis?.pipeline?.trim() || base.axisLabels.pipeline,
  };

  return {
    processHighThreshold,
    processLowThreshold,
    pipelinePhases: pipelinePhases.length
      ? pipelinePhases
      : base.pipelinePhases,
    axisLabels,
  };
}

function normalizeUsp(u: Partial<UspDef>, i: number): UspDef {
  return {
    id: u.id || `usp-${i + 1}`,
    label: u.label ?? "",
    description: u.description ?? "",
    active: u.active !== false,
    order: u.order ?? i + 1,
  };
}

function normalizeModule(
  m: Partial<SolutionModuleDef>,
  mi: number,
  seed?: SolutionModuleDef,
): SolutionModuleDef {
  const usps = Array.isArray(m.usps)
    ? m.usps.map((u, ui) => normalizeUsp(u, ui))
    : structuredClone(seed?.usps ?? []);
  return {
    id: m.id || `mod-${mi + 1}`,
    label: m.label ?? seed?.label ?? "",
    description: m.description ?? seed?.description ?? "",
    usps,
    active: m.active !== false,
    order: m.order ?? mi + 1,
  };
}

function normalizeSolution(
  s: SolutionDef,
  i: number,
  defaultModules?: SolutionModuleDef[],
): SolutionDef {
  const seedById = new Map((defaultModules ?? []).map((m) => [m.id, m]));
  const modules = Array.isArray(s.modules)
    ? s.modules.map((m, mi) => normalizeModule(m, mi, seedById.get(m.id)))
    : structuredClone(defaultModules ?? []);
  return {
    ...s,
    description: s.description ?? "",
    active: s.active !== false,
    order: s.order ?? i + 1,
    modules,
  };
}

function normalizeOrgProfile(raw: Partial<OrgProfile> | undefined): OrgProfile {
  const base = structuredClone(defaultConfig.orgProfile);
  if (!raw) return base;
  return {
    name: raw.name?.trim() || base.name,
    description: raw.description ?? base.description,
    usps: Array.isArray(raw.usps)
      ? raw.usps.map((u, i) => normalizeUsp(u, i))
      : base.usps,
  };
}

function normalizeCompetitorFeature(
  f: Partial<CompetitorFeatureDef>,
  i: number,
): CompetitorFeatureDef {
  return {
    id: f.id || `cf-${i + 1}`,
    label: f.label ?? "",
    description: f.description ?? "",
    ourModuleId: f.ourModuleId ?? null,
    active: f.active !== false,
    order: f.order ?? i + 1,
  };
}

function normalizeCompetitor(
  c: Partial<CompetitorDef>,
  i: number,
): CompetitorDef {
  return {
    id: c.id || `comp-${i + 1}`,
    name: c.name ?? "",
    description: c.description ?? "",
    active: c.active !== false,
    order: c.order ?? i + 1,
    features: Array.isArray(c.features)
      ? c.features.map((f, fi) => normalizeCompetitorFeature(f, fi))
      : [],
  };
}

function normalizeCompetitors(
  raw: CompetitorDef[] | undefined,
): CompetitorDef[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return structuredClone(defaultConfig.competitors);
  }
  return raw.map((c, i) => normalizeCompetitor(c, i));
}

function normalizeCompellingEvents(
  raw: CompellingEventDef[] | undefined,
): CompellingEventDef[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return structuredClone(defaultConfig.compellingEvents);
  }
  return raw.map((c, i) => ({
    id: c.id || `ce-${i + 1}`,
    label: c.label ?? "",
    description: c.description ?? "",
    active: c.active !== false,
    order: c.order ?? i + 1,
  }));
}

const KIND_MODES: OppKindTargetMode[] = ["by_phase", "renewal", "none"];

function normalizeOppPhases(raw: OppPhaseDef[] | undefined): OppPhaseDef[] {
  const defaults = structuredClone(DEFAULT_OPP_PHASES);
  const byId = new Map<string, OppPhaseDef>();
  for (const def of defaults) byId.set(def.id, { ...def });

  const customs: OppPhaseDef[] = [];
  // Catalogue vide → funnel aligné sur les domaines Process d’usine.
  const source =
    Array.isArray(raw) && raw.length > 0
      ? raw
      : defaultConfig.oppPhases;
  for (let i = 0; i < source.length; i++) {
    const p = source[i];
    const id = p.id || `phase-${i + 1}`;
    if (id === "Whitespace" || id === "Closed Won" || id === "Closed Lost") {
      const base = byId.get(id)!;
      byId.set(id, {
        ...base,
        label: p.label?.trim() || base.label,
        active: p.active !== false,
      });
      continue;
    }
    customs.push({
      id,
      label: p.label || id,
      kpiRole: "active",
      active: p.active !== false,
      order: p.order ?? i + 2,
    });
  }

  customs.sort(
    (a, b) => a.order - b.order || a.label.localeCompare(b.label, "fr"),
  );

  return [
    { ...byId.get("Whitespace")!, order: 1 },
    ...customs.map((p, i) => ({ ...p, kpiRole: "active" as const, order: i + 2 })),
    { ...byId.get("Closed Won")!, order: 1000 },
    { ...byId.get("Closed Lost")!, order: 1001 },
  ];
}

function normalizeOppKinds(raw: OppKindDef[] | undefined): OppKindDef[] {
  const defaults = structuredClone(DEFAULT_OPP_KINDS);
  if (!Array.isArray(raw) || raw.length === 0) {
    return defaults;
  }
  const normalized = raw.map((k, i) => ({
    id: k.id || `kind-${i + 1}`,
    label: k.label || k.id || `Type ${i + 1}`,
    targetMode: KIND_MODES.includes(k.targetMode) ? k.targetMode : "by_phase",
    active: k.active !== false,
    order: k.order ?? i + 1,
  }));
  // Garantit les natures d’usine manquantes (org déjà configurée).
  for (const def of defaults) {
    if (!normalized.some((k) => k.id === def.id)) {
      // Alias legacy → ne pas doubler
      if (def.id === "new_logo" && normalized.some((k) => k.id === "new_in_group")) {
        continue;
      }
      if (def.id === "up" && normalized.some((k) => k.id === "upsell")) {
        continue;
      }
      normalized.push({ ...def, order: normalized.length + 1 });
    }
  }
  // Renouvellement : mode cible dédié
  return normalized.map((k) =>
    k.id === "renewal" ? { ...k, targetMode: "renewal" as const } : k,
  );
}

function normalizeCommercialStatuses(
  raw: CommercialStatusDef[] | undefined,
): CommercialStatusDef[] {
  const defaults = structuredClone(defaultConfig.commercialStatuses);
  if (!Array.isArray(raw) || raw.length === 0) {
    return defaults;
  }
  const normalized = raw
    .filter((s) => s.id !== "Other")
    .map((s, i) => ({
      id: s.id || `status-${i + 1}`,
      label: s.label || s.id || `Statut ${i + 1}`,
      active: s.active !== false,
      order: s.order ?? i + 1,
    }));
  // Garantit les statuts catalogue manquants (ex. Concurrent ajouté après coup).
  for (const def of defaults) {
    if (!normalized.some((s) => s.id === def.id)) {
      normalized.push({ ...def, order: normalized.length + 1 });
    }
  }
  return normalized;
}

function normalizeAccountSizes(
  raw: AccountSizeDef[] | undefined,
): AccountSizeDef[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return structuredClone(defaultConfig.accountSizes);
  }
  return raw.map((s, i) => ({
    id: s.id || `size-${i + 1}`,
    label: s.label || s.id || `Tranche ${i + 1}`,
    active: s.active !== false,
    order: s.order ?? i + 1,
  }));
}

function normalizeKpiRules(
  raw: Partial<KpiRulesConfig> | undefined,
): KpiRulesConfig {
  return {
    ...DEFAULT_KPI_RULES,
    ...(raw ?? {}),
  };
}

function migratePersonaeFromLegacy(): PersonaDef[] | null {
  try {
    for (const key of ["powermap.directions.v2", "powermap.directions.v1"]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as {
        id: string;
        name: string;
        active?: boolean;
      }[];
      if (!Array.isArray(parsed) || parsed.length === 0) continue;
      const seen = new Set<string>();
      const list: PersonaDef[] = [];
      for (const d of parsed) {
        if (!d?.id || !d?.name || seen.has(d.id)) continue;
        seen.add(d.id);
        list.push({
          id: d.id,
          name: d.name,
          active: d.active !== false,
          order: list.length + 1,
        });
      }
      if (list.length) return list;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function loadConfig(): OrgConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) {
      const legacy = migratePersonaeFromLegacy();
      const base = structuredClone(defaultConfig);
      if (legacy?.length) base.personae = legacy;
      return base;
    }
    return hydrateOrgConfig(JSON.parse(raw) as OrgConfig);
  } catch {
    return structuredClone(defaultConfig);
  }
}

/** Normalise un blob OrgConfig (localStorage ou Supabase org_configs). */
export function hydrateOrgConfig(parsed: OrgConfig | null | undefined): OrgConfig {
  try {
    if (!parsed || parsed.version !== 1) return structuredClone(defaultConfig);
    const legacyDirections = (
      parsed as OrgConfig & { directions?: PersonaDef[] }
    ).directions;
    const personae =
      parsed.personae?.length
        ? parsed.personae.map((d, i) => ({
            ...d,
            active: d.active !== false,
            order: d.order ?? i + 1,
          }))
        : legacyDirections?.length
          ? legacyDirections.map((d, i) => ({
              ...d,
              active: d.active !== false,
              order: d.order ?? i + 1,
            }))
          : migratePersonaeFromLegacy() ??
            structuredClone(defaultConfig.personae);

    return {
      version: 1,
      orgProfile: normalizeOrgProfile(
        (parsed as OrgConfig & { orgProfile?: OrgProfile }).orgProfile,
      ),
      catalogFeatures: normalizeCatalogFeatures(
        (parsed as OrgConfig & { catalogFeatures?: CatalogFeatures })
          .catalogFeatures,
      ),
      contactTypes: parsed.contactTypes?.length
        ? parsed.contactTypes
        : structuredClone(defaultConfig.contactTypes),
      solutions: parsed.solutions?.length
        ? parsed.solutions.map((s, i) => {
            const seed = defaultConfig.solutions.find((d) => d.id === s.id);
            return normalizeSolution(s, i, seed?.modules);
          })
        : structuredClone(defaultConfig.solutions),
      personae,
      sectors: parsed.sectors?.length
        ? parsed.sectors.map((s, i) => ({
            ...s,
            active: s.active !== false,
            order: s.order ?? i + 1,
          }))
        : structuredClone(defaultConfig.sectors),
      boCategories: Array.isArray(parsed.boCategories)
        ? parsed.boCategories.map((c, i) => ({
            ...c,
            active: c.active !== false,
            order: c.order ?? i + 1,
          }))
        : structuredClone(defaultConfig.boCategories),
      boFields: Array.isArray(parsed.boFields)
        ? parsed.boFields.map((f, i) => ({
            ...f,
            active: f.active !== false,
            order: f.order ?? i + 1,
            kind: f.kind ?? "annual_benefit",
            categoryId: f.categoryId ?? null,
          }))
        : structuredClone(defaultConfig.boFields),
      processDomains: (() => {
        const domains = parsed.processDomains?.length
          ? parsed.processDomains.map((d, i) => ({
              ...d,
              active: d.active !== false,
              order: d.order ?? i + 1,
              questions: (d.questions ?? []).map((q, qi) => ({
                ...q,
                active: q.active !== false,
                order: q.order ?? qi + 1,
              })),
            }))
          : structuredClone(defaultConfig.processDomains);
        return ensureCompellingEventInProcess(domains);
      })(),
      oppVariables: Array.isArray(parsed.oppVariables)
        ? parsed.oppVariables.map((v, i) => ({
            ...v,
            active: v.active !== false,
            order: v.order ?? i + 1,
            kind: v.kind ?? "number",
          }))
        : structuredClone(defaultConfig.oppVariables),
      oppMappingSubtypes: normalizeOppMappingSubtypes(
        parsed.oppMappingSubtypes as OppMappingSubtypeDef[] | undefined,
      ),
      oppMappingThemes: normalizeOppMappingThemes(
        (parsed as OrgConfig & { oppMappingThemes?: OppMappingThemeDef[] })
          .oppMappingThemes,
      ),
      riskMatrix: normalizeRiskMatrix(
        (parsed as OrgConfig & { riskMatrix?: RiskMatrixConfig }).riskMatrix,
      ),
      competitors: normalizeCompetitors(
        (parsed as OrgConfig & { competitors?: CompetitorDef[] }).competitors,
      ),
      compellingEvents: normalizeCompellingEvents(
        (parsed as OrgConfig & { compellingEvents?: CompellingEventDef[] })
          .compellingEvents,
      ),
      oppPhases: normalizeOppPhases(
        (parsed as OrgConfig & { oppPhases?: OppPhaseDef[] }).oppPhases,
      ),
      oppKinds: normalizeOppKinds(
        (parsed as OrgConfig & { oppKinds?: OppKindDef[] }).oppKinds,
      ),
      commercialStatuses: normalizeCommercialStatuses(
        (parsed as OrgConfig & { commercialStatuses?: CommercialStatusDef[] })
          .commercialStatuses,
      ),
      accountSizes: normalizeAccountSizes(
        (parsed as OrgConfig & { accountSizes?: AccountSizeDef[] }).accountSizes,
      ),
      kpiRules: (() => {
        const rules = normalizeKpiRules(
          (parsed as OrgConfig & { kpiRules?: KpiRulesConfig }).kpiRules,
        );
        // Migration unique : CA installé = stock facturé (Won → ligne de vente).
        const migKey = "powermap.kpi.installedSalesOnly.v1";
        try {
          if (!localStorage.getItem(migKey)) {
            localStorage.setItem(migKey, "1");
            return { ...rules, includeWonOppsInInstalled: false };
          }
        } catch {
          /* ignore */
        }
        return rules;
      })(),
    };
  } catch {
    return structuredClone(defaultConfig);
  }
}

/** Injecte la question Compelling Event dans Qualification si absente. */
function ensureCompellingEventInProcess(
  domains: ProcessDomainDef[],
): ProcessDomainDef[] {
  return domains.map((d) => {
    if (d.id !== "dom-qualification" && d.id !== "dom-target-qualified") {
      return d;
    }
    const hasCe = d.questions.some(
      (q) =>
        q.id === "q-qual-ce" ||
        q.id === "q-tq-ce" ||
        /compelling event/i.test(q.label) ||
        /événement.?d.?achat|pourquoi.*maintenant/i.test(q.label),
    );
    if (hasCe) {
      return {
        ...d,
        questions: d.questions.map((q) =>
          q.id === "q-qual-ce" || q.id === "q-tq-ce"
            ? {
                ...q,
                label: "Identification d’un compelling event",
              }
            : q,
        ),
      };
    }
    return {
      ...d,
      questions: [
        ...d.questions.map((q) =>
          q.order >= 2 ? { ...q, order: q.order + 1 } : q,
        ),
        {
          id: "q-qual-ce",
          label: "Identification d’un compelling event",
          active: true,
          order: 2,
        },
      ],
    };
  });
}

function persist(config: OrgConfig) {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

type ConfigContextValue = {
  config: OrgConfig;
  /** Raccourci : dimensions d’offre actives. */
  catalogFeatures: CatalogFeatures;
  updateCatalogFeatures: (patch: Partial<CatalogFeatures>) => void;
  activeSolutions: SolutionDef[];
  activeContactTypes: ContactTypeDef[];
  activePersonae: PersonaDef[];
  activeSectors: SectorDef[];
  solutionLabel: (id: string) => string;
  contactTypeLabel: (id: string) => string;
  contactTypeColor: (id: string) => string;
  personaLabel: (id: string) => string;
  addSolution: (name: string, code?: string) => void;
  updateSolution: (id: string, patch: Partial<SolutionDef>) => void;
  removeSolution: (id: string) => void;
  addSolutionModule: (solutionId: string, label: string) => void;
  updateSolutionModule: (
    solutionId: string,
    moduleId: string,
    patch: Partial<SolutionModuleDef>,
  ) => void;
  removeSolutionModule: (solutionId: string, moduleId: string) => void;
  swapSolutionModuleOrder: (
    solutionId: string,
    aId: string,
    bId: string,
  ) => void;
  activeOppVariables: OppVariableDef[];
  addOppVariable: (label: string, kind: OppVariableKind) => void;
  updateOppVariable: (id: string, patch: Partial<OppVariableDef>) => void;
  removeOppVariable: (id: string) => void;
  swapOppVariableOrder: (aId: string, bId: string) => void;
  activeOppMappingSubtypes: OppMappingSubtypeDef[];
  activeOppMappingThemes: OppMappingThemeDef[];
  addOppMappingSubtype: (
    category: OppMappingCategory,
    label: string,
    theme?: string,
  ) => string | null;
  updateOppMappingSubtype: (
    id: string,
    patch: Partial<OppMappingSubtypeDef>,
  ) => void;
  removeOppMappingSubtype: (id: string) => void;
  addOppMappingTheme: (label: string) => string | null;
  updateOppMappingTheme: (
    id: string,
    patch: Partial<OppMappingThemeDef>,
  ) => void;
  removeOppMappingTheme: (id: string) => void;
  addContactType: (label: string, color?: string) => void;
  updateContactType: (id: string, patch: Partial<ContactTypeDef>) => void;
  removeContactType: (id: string) => void;
  addPersona: (name: string) => void;
  updatePersona: (id: string, patch: Partial<PersonaDef>) => void;
  removePersona: (id: string) => void;
  addSector: (name: string) => void;
  updateSector: (id: string, patch: Partial<SectorDef>) => void;
  removeSector: (id: string) => void;
  activeBoFields: BoFieldDef[];
  activeBoCategories: BoCategoryDef[];
  addBoCategory: (label: string) => void;
  updateBoCategory: (id: string, patch: Partial<BoCategoryDef>) => void;
  removeBoCategory: (id: string) => void;
  addBoField: (
    label: string,
    kind: BoFieldKind,
    categoryId?: string | null,
    defaultValue?: number,
  ) => void;
  updateBoField: (id: string, patch: Partial<BoFieldDef>) => void;
  removeBoField: (id: string) => void;
  activeProcessDomains: ProcessDomainDef[];
  addProcessDomain: (label: string) => void;
  updateProcessDomain: (id: string, patch: Partial<ProcessDomainDef>) => void;
  removeProcessDomain: (id: string) => void;
  swapProcessDomainOrder: (aId: string, bId: string) => void;
  addProcessQuestion: (domainId: string, label: string) => void;
  updateProcessQuestion: (
    domainId: string,
    questionId: string,
    patch: Partial<ProcessQuestionDef>,
  ) => void;
  removeProcessQuestion: (domainId: string, questionId: string) => void;
  swapProcessQuestionOrder: (
    domainId: string,
    aId: string,
    bId: string,
  ) => void;
  updateRiskMatrix: (patch: Partial<RiskMatrixConfig>) => void;
  updateOrgProfile: (patch: Partial<Pick<OrgProfile, "name" | "description">>) => void;
  addOrgUsp: (label: string) => void;
  updateOrgUsp: (id: string, patch: Partial<UspDef>) => void;
  removeOrgUsp: (id: string) => void;
  addCompetitor: (name: string) => void;
  updateCompetitor: (id: string, patch: Partial<CompetitorDef>) => void;
  removeCompetitor: (id: string) => void;
  addCompetitorFeature: (competitorId: string, label: string) => void;
  updateCompetitorFeature: (
    competitorId: string,
    featureId: string,
    patch: Partial<CompetitorFeatureDef>,
  ) => void;
  removeCompetitorFeature: (competitorId: string, featureId: string) => void;
  addModuleUsp: (solutionId: string, moduleId: string, label: string) => void;
  updateModuleUsp: (
    solutionId: string,
    moduleId: string,
    uspId: string,
    patch: Partial<UspDef>,
  ) => void;
  removeModuleUsp: (
    solutionId: string,
    moduleId: string,
    uspId: string,
  ) => void;
  activeCompellingEvents: CompellingEventDef[];
  addCompellingEvent: (label: string, description?: string) => void;
  updateCompellingEvent: (
    id: string,
    patch: Partial<CompellingEventDef>,
  ) => void;
  removeCompellingEvent: (id: string) => void;
  salesTaxonomy: SalesTaxonomy;
  kpiClassifier: KpiClassifier;
  activeOppPhases: OppPhaseDef[];
  activeOppKinds: OppKindDef[];
  activeCommercialStatuses: CommercialStatusDef[];
  activeAccountSizes: AccountSizeDef[];
  phaseLabel: (id: string) => string;
  kindLabel: (id: string) => string;
  statusLabel: (id: string) => string;
  sizeLabel: (id: string) => string;
  addOppPhase: (label: string, kpiRole?: OppPhaseKpiRole) => void;
  updateOppPhase: (id: string, patch: Partial<OppPhaseDef>) => void;
  removeOppPhase: (id: string) => void;
  moveOppPhase: (id: string, direction: -1 | 1) => void;
  addOppKind: (label: string, targetMode?: OppKindTargetMode) => void;
  updateOppKind: (id: string, patch: Partial<OppKindDef>) => void;
  removeOppKind: (id: string) => void;
  addCommercialStatus: (label: string) => void;
  updateCommercialStatus: (
    id: string,
    patch: Partial<CommercialStatusDef>,
  ) => void;
  removeCommercialStatus: (id: string) => void;
  addAccountSize: (label: string, idHint?: string) => void;
  updateAccountSize: (id: string, patch: Partial<AccountSizeDef>) => void;
  removeAccountSize: (id: string) => void;
  updateKpiRules: (patch: Partial<KpiRulesConfig>) => void;
  resetConfig: () => void;
};

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const { profile, loading: authLoading } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const isAdmin = profile?.role === "admin";
  const profileIdRef = useRef(profile?.id ?? null);
  profileIdRef.current = profile?.id ?? null;
  const orgIdRef = useRef(orgId);
  orgIdRef.current = orgId;
  const canWriteRemoteRef = useRef(isAdmin);
  canWriteRemoteRef.current = isAdmin;

  const [config, setConfig] = useState<OrgConfig>(() => loadConfig());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!orgId || !supabase) return;

    let cancelled = false;
    void (async () => {
      try {
        const remote = await loadOrgConfigRemote(orgId);
        if (cancelled) return;
        if (!isRemoteOrgConfigEmpty(remote)) {
          const hydrated = hydrateOrgConfig(remote as OrgConfig);
          setConfig(hydrated);
          persist(hydrated);
          return;
        }
        // Première synchro : pousser le catalogue local (défaut / Settings) vers Supabase.
        if (canWriteRemoteRef.current) {
          const local = loadConfig();
          await upsertOrgConfigRemote(orgId, local, profileIdRef.current);
        }
      } catch (err) {
        logSyncError("loadOrgConfig", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, orgId]);

  const commit = useCallback((next: OrgConfig) => {
    setConfig(next);
    persist(next);
    const id = orgIdRef.current;
    if (!id || !supabase || !canWriteRemoteRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      pushOrgConfigRemote(id, next, profileIdRef.current);
    }, 400);
  }, []);

  const activeSolutions = useMemo(
    () =>
      [...config.solutions]
        .filter((s) => s.active)
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          ...s,
          modules: [...(s.modules ?? [])]
            .filter((m) => m.active)
            .sort((a, b) => a.order - b.order),
        })),
    [config.solutions],
  );

  const activeOppVariables = useMemo(
    () =>
      [...(config.oppVariables ?? [])]
        .filter((v) => v.active)
        .sort((a, b) => a.order - b.order),
    [config.oppVariables],
  );

  const activeOppMappingSubtypes = useMemo(
    () =>
      [...(config.oppMappingSubtypes ?? [])]
        .filter((s) => s.active)
        .sort((a, b) => a.order - b.order),
    [config.oppMappingSubtypes],
  );

  const activeOppMappingThemes = useMemo(
    () =>
      [...(config.oppMappingThemes ?? [])]
        .filter((t) => t.active !== false)
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "fr")),
    [config.oppMappingThemes],
  );

  const activeContactTypes = useMemo(
    () =>
      [...config.contactTypes]
        .filter((t) => t.active)
        .sort((a, b) => a.order - b.order),
    [config.contactTypes],
  );

  const activePersonae = useMemo(
    () =>
      [...config.personae]
        .filter((d) => d.active)
        .sort((a, b) => a.order - b.order),
    [config.personae],
  );

  const activeSectors = useMemo(
    () =>
      [...(config.sectors ?? [])]
        .filter((s) => s.active)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "fr")),
    [config.sectors],
  );

  const activeBoFields = useMemo(
    () =>
      [...(config.boFields ?? [])]
        .filter((f) => f.active)
        .sort((a, b) => a.order - b.order),
    [config.boFields],
  );

  const activeBoCategories = useMemo(
    () =>
      [...(config.boCategories ?? [])]
        .filter((c) => c.active)
        .sort((a, b) => a.order - b.order),
    [config.boCategories],
  );

  const activeProcessDomains = useMemo(
    () =>
      [...(config.processDomains ?? [])]
        .filter((d) => d.active)
        .sort((a, b) => a.order - b.order)
        .map((d) => ({
          ...d,
          questions: [...(d.questions ?? [])]
            .filter((q) => q.active)
            .sort((a, b) => a.order - b.order),
        })),
    [config.processDomains],
  );

  const solutionLabel = useCallback(
    (id: string) => config.solutions.find((s) => s.id === id)?.name ?? id,
    [config.solutions],
  );

  const contactTypeLabel = useCallback(
    (id: string) =>
      config.contactTypes.find((t) => t.id === id)?.label ?? id,
    [config.contactTypes],
  );

  const contactTypeColor = useCallback(
    (id: string) =>
      config.contactTypes.find((t) => t.id === id)?.color ?? "#6b7280",
    [config.contactTypes],
  );

  const personaLabel = useCallback(
    (id: string) => config.personae.find((d) => d.id === id)?.name ?? id,
    [config.personae],
  );

  const addSolution = useCallback(
    (name: string, code?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const rawId = trimmed
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9+\-_]/g, "");
      const id = rawId || uid("sol");
      if (
        config.solutions.some(
          (s) =>
            s.id === id ||
            s.name.trim().toLowerCase() === trimmed.toLowerCase() ||
            (code && s.code?.toLowerCase() === code.trim().toLowerCase()),
        )
      ) {
        return;
      }
      commit({
        ...config,
        solutions: [
          ...config.solutions,
          {
            id,
            name: trimmed,
            code: code?.trim() || undefined,
            description: "",
            active: true,
            order: config.solutions.length + 1,
            modules: [],
          },
        ],
      });
    },
    [commit, config],
  );

  const updateSolution = useCallback(
    (id: string, patch: Partial<SolutionDef>) => {
      commit({
        ...config,
        solutions: config.solutions.map((s) =>
          s.id === id
            ? {
                ...s,
                ...patch,
                id: s.id,
                modules: patch.modules ?? s.modules ?? [],
              }
            : s,
        ),
      });
    },
    [commit, config],
  );

  const removeSolution = useCallback(
    (id: string) => {
      commit({
        ...config,
        solutions: config.solutions.map((s) =>
          s.id === id ? { ...s, active: false } : s,
        ),
      });
    },
    [commit, config],
  );

  const addSolutionModule = useCallback(
    (solutionId: string, label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      commit({
        ...config,
        solutions: config.solutions.map((s) => {
          if (s.id !== solutionId) return s;
          const modules = s.modules ?? [];
          return {
            ...s,
            modules: [
              ...modules,
              {
                id: uid("mod"),
                label: trimmed,
                description: "",
                usps: [],
                active: true,
                order: modules.length + 1,
              },
            ],
          };
        }),
      });
    },
    [commit, config],
  );

  const updateSolutionModule = useCallback(
    (
      solutionId: string,
      moduleId: string,
      patch: Partial<SolutionModuleDef>,
    ) => {
      commit({
        ...config,
        solutions: config.solutions.map((s) => {
          if (s.id !== solutionId) return s;
          return {
            ...s,
            modules: (s.modules ?? []).map((m) =>
              m.id === moduleId ? { ...m, ...patch, id: m.id } : m,
            ),
          };
        }),
      });
    },
    [commit, config],
  );

  const removeSolutionModule = useCallback(
    (solutionId: string, moduleId: string) => {
      commit({
        ...config,
        solutions: config.solutions.map((s) => {
          if (s.id !== solutionId) return s;
          return {
            ...s,
            modules: (s.modules ?? []).map((m) =>
              m.id === moduleId ? { ...m, active: false } : m,
            ),
          };
        }),
      });
    },
    [commit, config],
  );

  const swapSolutionModuleOrder = useCallback(
    (solutionId: string, aId: string, bId: string) => {
      commit({
        ...config,
        solutions: config.solutions.map((s) => {
          if (s.id !== solutionId) return s;
          const modules = s.modules ?? [];
          const a = modules.find((m) => m.id === aId);
          const b = modules.find((m) => m.id === bId);
          if (!a || !b) return s;
          return {
            ...s,
            modules: modules.map((m) => {
              if (m.id === aId) return { ...m, order: b.order };
              if (m.id === bId) return { ...m, order: a.order };
              return m;
            }),
          };
        }),
      });
    },
    [commit, config],
  );

  const addOppVariable = useCallback(
    (label: string, kind: OppVariableKind) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const list = config.oppVariables ?? [];
      commit({
        ...config,
        oppVariables: [
          ...list,
          {
            id: uid("var"),
            label: trimmed,
            kind,
            active: true,
            order: list.length + 1,
            defaultValue: kind === "number" ? 0 : kind === "boolean" ? false : "",
          },
        ],
      });
    },
    [commit, config],
  );

  const updateOppVariable = useCallback(
    (id: string, patch: Partial<OppVariableDef>) => {
      commit({
        ...config,
        oppVariables: (config.oppVariables ?? []).map((v) =>
          v.id === id ? { ...v, ...patch, id: v.id } : v,
        ),
      });
    },
    [commit, config],
  );

  const removeOppVariable = useCallback(
    (id: string) => {
      commit({
        ...config,
        oppVariables: (config.oppVariables ?? []).map((v) =>
          v.id === id ? { ...v, active: false } : v,
        ),
      });
    },
    [commit, config],
  );

  const swapOppVariableOrder = useCallback(
    (aId: string, bId: string) => {
      const list = config.oppVariables ?? [];
      const a = list.find((v) => v.id === aId);
      const b = list.find((v) => v.id === bId);
      if (!a || !b) return;
      commit({
        ...config,
        oppVariables: list.map((v) => {
          if (v.id === aId) return { ...v, order: b.order };
          if (v.id === bId) return { ...v, order: a.order };
          return v;
        }),
      });
    },
    [commit, config],
  );

  const addOppMappingSubtype = useCallback(
    (category: OppMappingCategory, label: string, theme?: string) => {
      const trimmed = label.trim();
      if (!trimmed) return null;
      const list = config.oppMappingSubtypes ?? [];
      const id = uid("omap");
      const themeId = (theme ?? "custom").trim() || "custom";
      commit({
        ...config,
        oppMappingSubtypes: [
          ...list,
          {
            id,
            category,
            label: trimmed,
            theme: themeId,
            active: true,
            order: list.filter((s) => s.category === category).length + 1,
            bonus: 1,
            malus: 1,
            required: false,
          },
        ],
      });
      return id;
    },
    [commit, config],
  );

  const updateOppMappingSubtype = useCallback(
    (id: string, patch: Partial<OppMappingSubtypeDef>) => {
      commit({
        ...config,
        oppMappingSubtypes: (config.oppMappingSubtypes ?? []).map((s) =>
          s.id === id ? { ...s, ...patch, id: s.id } : s,
        ),
      });
    },
    [commit, config],
  );

  const removeOppMappingSubtype = useCallback(
    (id: string) => {
      commit({
        ...config,
        oppMappingSubtypes: (config.oppMappingSubtypes ?? []).map((s) =>
          s.id === id ? { ...s, active: false } : s,
        ),
      });
    },
    [commit, config],
  );

  const addOppMappingTheme = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return null;
      const list = config.oppMappingThemes ?? [];
      if (
        list.some(
          (t) => t.label.toLowerCase() === trimmed.toLowerCase() && t.active !== false,
        )
      ) {
        return null;
      }
      const id = uid("theme");
      commit({
        ...config,
        oppMappingThemes: [
          ...list,
          {
            id,
            label: trimmed,
            active: true,
            order: list.length + 1,
          },
        ],
      });
      return id;
    },
    [commit, config],
  );

  const updateOppMappingTheme = useCallback(
    (id: string, patch: Partial<OppMappingThemeDef>) => {
      commit({
        ...config,
        oppMappingThemes: (config.oppMappingThemes ?? []).map((t) =>
          t.id === id ? { ...t, ...patch, id: t.id } : t,
        ),
      });
    },
    [commit, config],
  );

  const removeOppMappingTheme = useCallback(
    (id: string) => {
      // Ne pas supprimer « custom » : fallback des cartes sans thème.
      if (id === "custom") return;
      commit({
        ...config,
        oppMappingThemes: (config.oppMappingThemes ?? []).map((t) =>
          t.id === id ? { ...t, active: false } : t,
        ),
      });
    },
    [commit, config],
  );

  const addContactType = useCallback(
    (label: string, color = "#0f766e") => {
      const trimmed = label.trim();
      if (!trimmed) return;
      commit({
        ...config,
        contactTypes: [
          ...config.contactTypes,
          {
            id: uid("role"),
            label: trimmed,
            color,
            active: true,
            order: config.contactTypes.length + 1,
          },
        ],
      });
    },
    [commit, config],
  );

  const updateContactType = useCallback(
    (id: string, patch: Partial<ContactTypeDef>) => {
      commit({
        ...config,
        contactTypes: config.contactTypes.map((t) =>
          t.id === id ? { ...t, ...patch, id: t.id } : t,
        ),
      });
    },
    [commit, config],
  );

  const removeContactType = useCallback(
    (id: string) => {
      commit({
        ...config,
        contactTypes: config.contactTypes.map((t) =>
          t.id === id ? { ...t, active: false } : t,
        ),
      });
    },
    [commit, config],
  );

  const addPersona = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const rawId = trimmed
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9+\-_]/g, "");
      const id = rawId || uid("persona");
      if (
        config.personae.some(
          (d) =>
            d.id === id ||
            d.name.trim().toLowerCase() === trimmed.toLowerCase(),
        )
      ) {
        return;
      }
      commit({
        ...config,
        personae: [
          ...config.personae,
          {
            id,
            name: trimmed,
            active: true,
            order: config.personae.length + 1,
          },
        ],
      });
    },
    [commit, config],
  );

  const updatePersona = useCallback(
    (id: string, patch: Partial<PersonaDef>) => {
      commit({
        ...config,
        personae: config.personae.map((d) =>
          d.id === id ? { ...d, ...patch, id: d.id } : d,
        ),
      });
    },
    [commit, config],
  );

  const removePersona = useCallback(
    (id: string) => {
      commit({
        ...config,
        personae: config.personae.map((d) =>
          d.id === id ? { ...d, active: false } : d,
        ),
      });
    },
    [commit, config],
  );

  const addSector = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const list = config.sectors ?? [];
      const rawId = trimmed
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9+\-_]/g, "");
      const id = rawId || uid("sec");
      if (
        list.some(
          (s) =>
            s.id === id ||
            s.name.trim().toLowerCase() === trimmed.toLowerCase(),
        )
      ) {
        return;
      }
      commit({
        ...config,
        sectors: [
          ...list,
          {
            id,
            name: trimmed,
            active: true,
            order: list.length + 1,
          },
        ],
      });
    },
    [commit, config],
  );

  const updateSector = useCallback(
    (id: string, patch: Partial<SectorDef>) => {
      commit({
        ...config,
        sectors: (config.sectors ?? []).map((s) =>
          s.id === id ? { ...s, ...patch, id: s.id } : s,
        ),
      });
    },
    [commit, config],
  );

  const removeSector = useCallback(
    (id: string) => {
      commit({
        ...config,
        sectors: (config.sectors ?? []).map((s) =>
          s.id === id ? { ...s, active: false } : s,
        ),
      });
    },
    [commit, config],
  );

  const addBoCategory = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const list = config.boCategories ?? [];
      commit({
        ...config,
        boCategories: [
          ...list,
          {
            id: uid("bocat"),
            label: trimmed,
            active: true,
            order: list.length + 1,
          },
        ],
      });
    },
    [commit, config],
  );

  const updateBoCategory = useCallback(
    (id: string, patch: Partial<BoCategoryDef>) => {
      commit({
        ...config,
        boCategories: (config.boCategories ?? []).map((c) =>
          c.id === id ? { ...c, ...patch, id: c.id } : c,
        ),
      });
    },
    [commit, config],
  );

  const removeBoCategory = useCallback(
    (id: string) => {
      commit({
        ...config,
        boCategories: (config.boCategories ?? []).map((c) =>
          c.id === id ? { ...c, active: false } : c,
        ),
        boFields: (config.boFields ?? []).map((f) =>
          f.categoryId === id ? { ...f, categoryId: null } : f,
        ),
      });
    },
    [commit, config],
  );

  const addBoField = useCallback(
    (
      label: string,
      kind: BoFieldKind,
      categoryId: string | null = null,
      defaultValue = 0,
    ) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const list = config.boFields ?? [];
      commit({
        ...config,
        boFields: [
          ...list,
          {
            id: uid("bof"),
            label: trimmed,
            kind,
            categoryId,
            active: true,
            order: list.length + 1,
            defaultValue,
          },
        ],
      });
    },
    [commit, config],
  );

  const updateBoField = useCallback(
    (id: string, patch: Partial<BoFieldDef>) => {
      commit({
        ...config,
        boFields: (config.boFields ?? []).map((f) =>
          f.id === id ? { ...f, ...patch, id: f.id } : f,
        ),
      });
    },
    [commit, config],
  );

  const removeBoField = useCallback(
    (id: string) => {
      commit({
        ...config,
        boFields: (config.boFields ?? []).map((f) =>
          f.id === id ? { ...f, active: false } : f,
        ),
      });
    },
    [commit, config],
  );

  const addProcessDomain = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const list = config.processDomains ?? [];
      commit({
        ...config,
        processDomains: [
          ...list,
          {
            id: uid("pdom"),
            label: trimmed,
            active: true,
            order: list.length + 1,
            questions: [],
          },
        ],
      });
    },
    [commit, config],
  );

  const updateProcessDomain = useCallback(
    (id: string, patch: Partial<ProcessDomainDef>) => {
      commit({
        ...config,
        processDomains: (config.processDomains ?? []).map((d) =>
          d.id === id
            ? {
                ...d,
                ...patch,
                id: d.id,
                questions: patch.questions ?? d.questions,
              }
            : d,
        ),
      });
    },
    [commit, config],
  );

  const removeProcessDomain = useCallback(
    (id: string) => {
      commit({
        ...config,
        processDomains: (config.processDomains ?? []).map((d) =>
          d.id === id ? { ...d, active: false } : d,
        ),
      });
    },
    [commit, config],
  );

  const swapProcessDomainOrder = useCallback(
    (aId: string, bId: string) => {
      const list = config.processDomains ?? [];
      const a = list.find((d) => d.id === aId);
      const b = list.find((d) => d.id === bId);
      if (!a || !b) return;
      commit({
        ...config,
        processDomains: list.map((d) => {
          if (d.id === aId) return { ...d, order: b.order };
          if (d.id === bId) return { ...d, order: a.order };
          return d;
        }),
      });
    },
    [commit, config],
  );

  const addProcessQuestion = useCallback(
    (domainId: string, label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      commit({
        ...config,
        processDomains: (config.processDomains ?? []).map((d) => {
          if (d.id !== domainId) return d;
          return {
            ...d,
            questions: [
              ...d.questions,
              {
                id: uid("pq"),
                label: trimmed,
                active: true,
                order: d.questions.length + 1,
              },
            ],
          };
        }),
      });
    },
    [commit, config],
  );

  const updateProcessQuestion = useCallback(
    (
      domainId: string,
      questionId: string,
      patch: Partial<ProcessQuestionDef>,
    ) => {
      commit({
        ...config,
        processDomains: (config.processDomains ?? []).map((d) => {
          if (d.id !== domainId) return d;
          return {
            ...d,
            questions: d.questions.map((q) =>
              q.id === questionId ? { ...q, ...patch, id: q.id } : q,
            ),
          };
        }),
      });
    },
    [commit, config],
  );

  const removeProcessQuestion = useCallback(
    (domainId: string, questionId: string) => {
      commit({
        ...config,
        processDomains: (config.processDomains ?? []).map((d) => {
          if (d.id !== domainId) return d;
          return {
            ...d,
            questions: d.questions.map((q) =>
              q.id === questionId ? { ...q, active: false } : q,
            ),
          };
        }),
      });
    },
    [commit, config],
  );

  const swapProcessQuestionOrder = useCallback(
    (domainId: string, aId: string, bId: string) => {
      commit({
        ...config,
        processDomains: (config.processDomains ?? []).map((d) => {
          if (d.id !== domainId) return d;
          const a = d.questions.find((q) => q.id === aId);
          const b = d.questions.find((q) => q.id === bId);
          if (!a || !b) return d;
          return {
            ...d,
            questions: d.questions.map((q) => {
              if (q.id === aId) return { ...q, order: b.order };
              if (q.id === bId) return { ...q, order: a.order };
              return q;
            }),
          };
        }),
      });
    },
    [commit, config],
  );

  const resetConfig = useCallback(() => {
    commit(structuredClone(defaultConfig));
  }, [commit]);

  const updateRiskMatrix = useCallback(
    (patch: Partial<RiskMatrixConfig>) => {
      const current = config.riskMatrix ?? defaultConfig.riskMatrix;
      const next = normalizeRiskMatrix({
        ...current,
        ...patch,
        pipelinePhases: patch.pipelinePhases ?? current.pipelinePhases,
        axisLabels: patch.axisLabels
          ? { ...current.axisLabels, ...patch.axisLabels }
          : current.axisLabels,
      });
      commit({ ...config, riskMatrix: next });
    },
    [commit, config],
  );

  const updateOrgProfile = useCallback(
    (patch: Partial<Pick<OrgProfile, "name" | "description">>) => {
      const current = config.orgProfile ?? defaultConfig.orgProfile;
      commit({
        ...config,
        orgProfile: normalizeOrgProfile({ ...current, ...patch }),
      });
    },
    [commit, config],
  );

  const addOrgUsp = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const current = config.orgProfile ?? defaultConfig.orgProfile;
      const usps = current.usps ?? [];
      commit({
        ...config,
        orgProfile: {
          ...current,
          usps: [
            ...usps,
            {
              id: uid("usp"),
              label: trimmed,
              description: "",
              active: true,
              order: usps.length + 1,
            },
          ],
        },
      });
    },
    [commit, config],
  );

  const updateOrgUsp = useCallback(
    (id: string, patch: Partial<UspDef>) => {
      const current = config.orgProfile ?? defaultConfig.orgProfile;
      commit({
        ...config,
        orgProfile: {
          ...current,
          usps: (current.usps ?? []).map((u) =>
            u.id === id ? { ...u, ...patch, id: u.id } : u,
          ),
        },
      });
    },
    [commit, config],
  );

  const removeOrgUsp = useCallback(
    (id: string) => {
      const current = config.orgProfile ?? defaultConfig.orgProfile;
      commit({
        ...config,
        orgProfile: {
          ...current,
          usps: (current.usps ?? []).map((u) =>
            u.id === id ? { ...u, active: false } : u,
          ),
        },
      });
    },
    [commit, config],
  );

  const addCompetitor = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const list = config.competitors ?? [];
      commit({
        ...config,
        competitors: [
          ...list,
          {
            id: uid("comp"),
            name: trimmed,
            description: "",
            active: true,
            order: list.length + 1,
            features: [],
          },
        ],
      });
    },
    [commit, config],
  );

  const updateCompetitor = useCallback(
    (id: string, patch: Partial<CompetitorDef>) => {
      commit({
        ...config,
        competitors: (config.competitors ?? []).map((c) =>
          c.id === id
            ? {
                ...c,
                ...patch,
                id: c.id,
                features: patch.features ?? c.features,
              }
            : c,
        ),
      });
    },
    [commit, config],
  );

  const removeCompetitor = useCallback(
    (id: string) => {
      commit({
        ...config,
        competitors: (config.competitors ?? []).map((c) =>
          c.id === id ? { ...c, active: false } : c,
        ),
      });
    },
    [commit, config],
  );

  const addCompetitorFeature = useCallback(
    (competitorId: string, label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      commit({
        ...config,
        competitors: (config.competitors ?? []).map((c) => {
          if (c.id !== competitorId) return c;
          const features = c.features ?? [];
          return {
            ...c,
            features: [
              ...features,
              {
                id: uid("cf"),
                label: trimmed,
                description: "",
                ourModuleId: null,
                active: true,
                order: features.length + 1,
              },
            ],
          };
        }),
      });
    },
    [commit, config],
  );

  const updateCompetitorFeature = useCallback(
    (
      competitorId: string,
      featureId: string,
      patch: Partial<CompetitorFeatureDef>,
    ) => {
      commit({
        ...config,
        competitors: (config.competitors ?? []).map((c) => {
          if (c.id !== competitorId) return c;
          return {
            ...c,
            features: (c.features ?? []).map((f) =>
              f.id === featureId ? { ...f, ...patch, id: f.id } : f,
            ),
          };
        }),
      });
    },
    [commit, config],
  );

  const removeCompetitorFeature = useCallback(
    (competitorId: string, featureId: string) => {
      commit({
        ...config,
        competitors: (config.competitors ?? []).map((c) => {
          if (c.id !== competitorId) return c;
          return {
            ...c,
            features: (c.features ?? []).map((f) =>
              f.id === featureId ? { ...f, active: false } : f,
            ),
          };
        }),
      });
    },
    [commit, config],
  );

  const addModuleUsp = useCallback(
    (solutionId: string, moduleId: string, label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      commit({
        ...config,
        solutions: config.solutions.map((s) => {
          if (s.id !== solutionId) return s;
          return {
            ...s,
            modules: (s.modules ?? []).map((m) => {
              if (m.id !== moduleId) return m;
              const usps = m.usps ?? [];
              return {
                ...m,
                usps: [
                  ...usps,
                  {
                    id: uid("usp"),
                    label: trimmed,
                    description: "",
                    active: true,
                    order: usps.length + 1,
                  },
                ],
              };
            }),
          };
        }),
      });
    },
    [commit, config],
  );

  const updateModuleUsp = useCallback(
    (
      solutionId: string,
      moduleId: string,
      uspId: string,
      patch: Partial<UspDef>,
    ) => {
      commit({
        ...config,
        solutions: config.solutions.map((s) => {
          if (s.id !== solutionId) return s;
          return {
            ...s,
            modules: (s.modules ?? []).map((m) => {
              if (m.id !== moduleId) return m;
              return {
                ...m,
                usps: (m.usps ?? []).map((u) =>
                  u.id === uspId ? { ...u, ...patch, id: u.id } : u,
                ),
              };
            }),
          };
        }),
      });
    },
    [commit, config],
  );

  const removeModuleUsp = useCallback(
    (solutionId: string, moduleId: string, uspId: string) => {
      commit({
        ...config,
        solutions: config.solutions.map((s) => {
          if (s.id !== solutionId) return s;
          return {
            ...s,
            modules: (s.modules ?? []).map((m) => {
              if (m.id !== moduleId) return m;
              return {
                ...m,
                usps: (m.usps ?? []).map((u) =>
                  u.id === uspId ? { ...u, active: false } : u,
                ),
              };
            }),
          };
        }),
      });
    },
    [commit, config],
  );

  const activeCompellingEvents = useMemo(
    () =>
      [...(config.compellingEvents ?? [])]
        .filter((c) => c.active)
        .sort((a, b) => a.order - b.order),
    [config.compellingEvents],
  );

  const addCompellingEvent = useCallback(
    (label: string, description?: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const list = config.compellingEvents ?? [];
      commit({
        ...config,
        compellingEvents: [
          ...list,
          {
            id: uid("ce"),
            label: trimmed,
            description: description?.trim() ?? "",
            active: true,
            order: list.length + 1,
          },
        ],
      });
    },
    [commit, config],
  );

  const updateCompellingEvent = useCallback(
    (id: string, patch: Partial<CompellingEventDef>) => {
      commit({
        ...config,
        compellingEvents: (config.compellingEvents ?? []).map((c) =>
          c.id === id ? { ...c, ...patch, id: c.id } : c,
        ),
      });
    },
    [commit, config],
  );

  const removeCompellingEvent = useCallback(
    (id: string) => {
      commit({
        ...config,
        compellingEvents: (config.compellingEvents ?? []).map((c) =>
          c.id === id ? { ...c, active: false } : c,
        ),
      });
    },
    [commit, config],
  );

  const salesTaxonomy = useMemo(
    () => salesTaxonomyFromConfig(config),
    [config],
  );

  const kpiClassifier = useMemo(
    () => buildKpiClassifier(salesTaxonomy),
    [salesTaxonomy],
  );

  const activeOppPhases = useMemo(
    () => activeSortedPhases(salesTaxonomy),
    [salesTaxonomy],
  );
  const activeOppKinds = useMemo(
    () => activeSortedKinds(salesTaxonomy),
    [salesTaxonomy],
  );
  const activeCommercialStatuses = useMemo(
    () => activeSortedStatuses(salesTaxonomy),
    [salesTaxonomy],
  );
  const activeAccountSizes = useMemo(
    () => activeSortedSizes(salesTaxonomy),
    [salesTaxonomy],
  );

  const phaseLabel = useCallback(
    (id: string) => phaseLabelOf(salesTaxonomy, id),
    [salesTaxonomy],
  );
  const kindLabel = useCallback(
    (id: string) => kindLabelOf(salesTaxonomy, id),
    [salesTaxonomy],
  );
  const statusLabel = useCallback(
    (id: string) => statusLabelOf(salesTaxonomy, id),
    [salesTaxonomy],
  );
  const sizeLabel = useCallback(
    (id: string) => sizeLabelOf(salesTaxonomy, id),
    [salesTaxonomy],
  );

  const addOppPhase = useCallback(
    (label: string, _kpiRole?: OppPhaseKpiRole) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const list = [...(config.oppPhases ?? [])];
      const rawId = trimmed
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9+\-_]/g, "");
      let id = rawId || uid("phase");
      if (isBuiltInOppPhaseId(id)) id = uid("phase");
      if (
        list.some(
          (p) =>
            p.id === id ||
            p.label.trim().toLowerCase() === trimmed.toLowerCase(),
        )
      ) {
        return;
      }
      const customs = list.filter((p) => !isBuiltInOppPhaseId(p.id));
      const order =
        customs.length === 0
          ? 2
          : Math.max(...customs.map((p) => p.order), 1) + 1;
      const nextPhases = normalizeOppPhases([
        ...list,
        {
          id,
          label: trimmed,
          kpiRole: "active",
          active: true,
          order: Math.min(order, 999),
        },
      ]);
      // La phase enrichit le process : domaine checklist du même libellé.
      commit({
        ...config,
        oppPhases: nextPhases,
        processDomains: ensureProcessDomainsForPhases(
          config.processDomains ?? [],
          nextPhases,
        ),
      });
    },
    [commit, config],
  );

  const updateOppPhase = useCallback(
    (id: string, patch: Partial<OppPhaseDef>) => {
      const prev = (config.oppPhases ?? []).find((p) => p.id === id);
      if (!prev) return;
      const nextLabel = patch.label?.trim() || prev.label;
      const nextActive =
        patch.active !== undefined ? patch.active : prev.active;

      const syncProcessLabel = (domains: ProcessDomainDef[]) => {
        if (nextLabel === prev.label && nextActive === prev.active) {
          return domains;
        }
        const key = prev.label.trim().toLowerCase();
        return domains.map((d) => {
          if (d.label.trim().toLowerCase() !== key) return d;
          return {
            ...d,
            label: nextLabel,
            active: nextActive === false ? false : d.active,
          };
        });
      };

      if (isBuiltInOppPhaseId(id)) {
        commit({
          ...config,
          oppPhases: normalizeOppPhases(
            (config.oppPhases ?? []).map((p) =>
              p.id === id
                ? {
                    ...p,
                    label: nextLabel,
                    active: nextActive,
                  }
                : p,
            ),
          ),
          processDomains: syncProcessLabel(config.processDomains ?? []),
        });
        return;
      }
      const nextPhases = normalizeOppPhases(
        (config.oppPhases ?? []).map((p) =>
          p.id === id
            ? {
                ...p,
                label: nextLabel,
                active: nextActive,
                kpiRole: "active",
              }
            : p,
        ),
      );
      commit({
        ...config,
        oppPhases: nextPhases,
        processDomains: ensureProcessDomainsForPhases(
          syncProcessLabel(config.processDomains ?? []),
          nextPhases,
        ),
      });
    },
    [commit, config],
  );

  const removeOppPhase = useCallback(
    (id: string) => {
      if (id === "Whitespace") return; // toujours présent
      const prev = (config.oppPhases ?? []).find((p) => p.id === id);
      const nextPhases = normalizeOppPhases(
        (config.oppPhases ?? []).map((p) =>
          p.id === id ? { ...p, active: false } : p,
        ),
      );
      const key = prev?.label.trim().toLowerCase();
      commit({
        ...config,
        oppPhases: nextPhases,
        processDomains: (config.processDomains ?? []).map((d) =>
          key && d.label.trim().toLowerCase() === key
            ? { ...d, active: false }
            : d,
        ),
      });
    },
    [commit, config],
  );

  const moveOppPhase = useCallback(
    (id: string, direction: -1 | 1) => {
      if (isBuiltInOppPhaseId(id)) return;
      const customs = [...(config.oppPhases ?? [])]
        .filter((p) => !isBuiltInOppPhaseId(p.id))
        .sort((a, b) => a.order - b.order);
      const index = customs.findIndex((p) => p.id === id);
      const swapWith = index + direction;
      if (index < 0 || swapWith < 0 || swapWith >= customs.length) return;
      const a = customs[index];
      const b = customs[swapWith];
      commit({
        ...config,
        oppPhases: normalizeOppPhases(
          (config.oppPhases ?? []).map((p) => {
            if (p.id === a.id) return { ...p, order: b.order };
            if (p.id === b.id) return { ...p, order: a.order };
            return p;
          }),
        ),
      });
    },
    [commit, config],
  );

  const addOppKind = useCallback(
    (label: string, targetMode: OppKindTargetMode = "by_phase") => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const list = config.oppKinds ?? [];
      const rawId = trimmed
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9+\-_]/g, "");
      const id = rawId || uid("kind");
      if (
        list.some(
          (k) =>
            k.id === id ||
            k.label.trim().toLowerCase() === trimmed.toLowerCase(),
        )
      ) {
        return;
      }
      commit({
        ...config,
        oppKinds: [
          ...list,
          {
            id,
            label: trimmed,
            targetMode,
            active: true,
            order: list.length + 1,
          },
        ],
      });
    },
    [commit, config],
  );

  const updateOppKind = useCallback(
    (id: string, patch: Partial<OppKindDef>) => {
      commit({
        ...config,
        oppKinds: (config.oppKinds ?? []).map((k) =>
          k.id === id ? { ...k, ...patch, id: k.id } : k,
        ),
      });
    },
    [commit, config],
  );

  const removeOppKind = useCallback(
    (id: string) => {
      commit({
        ...config,
        oppKinds: (config.oppKinds ?? []).map((k) =>
          k.id === id ? { ...k, active: false } : k,
        ),
      });
    },
    [commit, config],
  );

  const addCommercialStatus = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const list = config.commercialStatuses ?? [];
      const rawId = trimmed
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9+\-_]/g, "");
      const id = rawId || uid("status");
      if (
        list.some(
          (s) =>
            s.id === id ||
            s.label.trim().toLowerCase() === trimmed.toLowerCase(),
        )
      ) {
        return;
      }
      commit({
        ...config,
        commercialStatuses: [
          ...list,
          {
            id,
            label: trimmed,
            active: true,
            order: list.length + 1,
          },
        ],
      });
    },
    [commit, config],
  );

  const updateCommercialStatus = useCallback(
    (id: string, patch: Partial<CommercialStatusDef>) => {
      commit({
        ...config,
        commercialStatuses: (config.commercialStatuses ?? []).map((s) =>
          s.id === id ? { ...s, ...patch, id: s.id } : s,
        ),
      });
    },
    [commit, config],
  );

  const removeCommercialStatus = useCallback(
    (id: string) => {
      commit({
        ...config,
        commercialStatuses: (config.commercialStatuses ?? []).map((s) =>
          s.id === id ? { ...s, active: false } : s,
        ),
      });
    },
    [commit, config],
  );

  const addAccountSize = useCallback(
    (label: string, idHint?: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const list = config.accountSizes ?? [];
      const rawId = (idHint?.trim() || trimmed)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9+\-_]/g, "");
      const id = rawId || uid("size");
      if (
        list.some(
          (s) =>
            s.id === id ||
            s.label.trim().toLowerCase() === trimmed.toLowerCase(),
        )
      ) {
        return;
      }
      commit({
        ...config,
        accountSizes: [
          ...list,
          {
            id,
            label: trimmed,
            active: true,
            order: list.length + 1,
          },
        ],
      });
    },
    [commit, config],
  );

  const updateAccountSize = useCallback(
    (id: string, patch: Partial<AccountSizeDef>) => {
      commit({
        ...config,
        accountSizes: (config.accountSizes ?? []).map((s) =>
          s.id === id ? { ...s, ...patch, id: s.id } : s,
        ),
      });
    },
    [commit, config],
  );

  const removeAccountSize = useCallback(
    (id: string) => {
      commit({
        ...config,
        accountSizes: (config.accountSizes ?? []).map((s) =>
          s.id === id ? { ...s, active: false } : s,
        ),
      });
    },
    [commit, config],
  );

  const updateKpiRules = useCallback(
    (patch: Partial<KpiRulesConfig>) => {
      commit({
        ...config,
        kpiRules: normalizeKpiRules({
          ...normalizeKpiRules(config.kpiRules),
          ...patch,
        }),
      });
    },
    [commit, config],
  );

  const catalogFeatures = useMemo(
    () => normalizeCatalogFeatures(config.catalogFeatures),
    [config.catalogFeatures],
  );

  const updateCatalogFeatures = useCallback(
    (patch: Partial<CatalogFeatures>) => {
      commit({
        ...config,
        catalogFeatures: normalizeCatalogFeatures({
          ...normalizeCatalogFeatures(config.catalogFeatures),
          ...patch,
        }),
      });
    },
    [commit, config],
  );

  const value = useMemo(
    () => ({
      config,
      catalogFeatures,
      updateCatalogFeatures,
      activeSolutions,
      activeOppVariables,
      activeOppMappingSubtypes,
      activeOppMappingThemes,
      activeContactTypes,
      activePersonae,
      activeSectors,
      activeBoFields,
      activeBoCategories,
      activeProcessDomains,
      solutionLabel,
      contactTypeLabel,
      contactTypeColor,
      personaLabel,
      addSolution,
      updateSolution,
      removeSolution,
      addSolutionModule,
      updateSolutionModule,
      removeSolutionModule,
      swapSolutionModuleOrder,
      addOppVariable,
      updateOppVariable,
      removeOppVariable,
      swapOppVariableOrder,
      addOppMappingSubtype,
      updateOppMappingSubtype,
      removeOppMappingSubtype,
      addOppMappingTheme,
      updateOppMappingTheme,
      removeOppMappingTheme,
      addContactType,
      updateContactType,
      removeContactType,
      addPersona,
      updatePersona,
      removePersona,
      addSector,
      updateSector,
      removeSector,
      addBoCategory,
      updateBoCategory,
      removeBoCategory,
      addBoField,
      updateBoField,
      removeBoField,
      addProcessDomain,
      updateProcessDomain,
      removeProcessDomain,
      swapProcessDomainOrder,
      addProcessQuestion,
      updateProcessQuestion,
      removeProcessQuestion,
      swapProcessQuestionOrder,
      updateRiskMatrix,
      updateOrgProfile,
      addOrgUsp,
      updateOrgUsp,
      removeOrgUsp,
      addCompetitor,
      updateCompetitor,
      removeCompetitor,
      addCompetitorFeature,
      updateCompetitorFeature,
      removeCompetitorFeature,
      addModuleUsp,
      updateModuleUsp,
      removeModuleUsp,
      activeCompellingEvents,
      addCompellingEvent,
      updateCompellingEvent,
      removeCompellingEvent,
      salesTaxonomy,
      kpiClassifier,
      activeOppPhases,
      activeOppKinds,
      activeCommercialStatuses,
      activeAccountSizes,
      phaseLabel,
      kindLabel,
      statusLabel,
      sizeLabel,
      addOppPhase,
      updateOppPhase,
      removeOppPhase,
      moveOppPhase,
      addOppKind,
      updateOppKind,
      removeOppKind,
      addCommercialStatus,
      updateCommercialStatus,
      removeCommercialStatus,
      addAccountSize,
      updateAccountSize,
      removeAccountSize,
      updateKpiRules,
      resetConfig,
    }),
    [
      config,
      catalogFeatures,
      updateCatalogFeatures,
      activeSolutions,
      activeOppVariables,
      activeOppMappingSubtypes,
      activeOppMappingThemes,
      activeContactTypes,
      activePersonae,
      activeSectors,
      activeBoFields,
      activeBoCategories,
      activeProcessDomains,
      solutionLabel,
      contactTypeLabel,
      contactTypeColor,
      personaLabel,
      addSolution,
      updateSolution,
      removeSolution,
      addSolutionModule,
      updateSolutionModule,
      removeSolutionModule,
      swapSolutionModuleOrder,
      addOppVariable,
      updateOppVariable,
      removeOppVariable,
      swapOppVariableOrder,
      addOppMappingSubtype,
      updateOppMappingSubtype,
      removeOppMappingSubtype,
      addOppMappingTheme,
      updateOppMappingTheme,
      removeOppMappingTheme,
      addContactType,
      updateContactType,
      removeContactType,
      addPersona,
      updatePersona,
      removePersona,
      addSector,
      updateSector,
      removeSector,
      addBoCategory,
      updateBoCategory,
      removeBoCategory,
      addBoField,
      updateBoField,
      removeBoField,
      addProcessDomain,
      updateProcessDomain,
      removeProcessDomain,
      swapProcessDomainOrder,
      addProcessQuestion,
      updateProcessQuestion,
      removeProcessQuestion,
      swapProcessQuestionOrder,
      updateRiskMatrix,
      updateOrgProfile,
      addOrgUsp,
      updateOrgUsp,
      removeOrgUsp,
      addCompetitor,
      updateCompetitor,
      removeCompetitor,
      addCompetitorFeature,
      updateCompetitorFeature,
      removeCompetitorFeature,
      addModuleUsp,
      updateModuleUsp,
      removeModuleUsp,
      activeCompellingEvents,
      addCompellingEvent,
      updateCompellingEvent,
      removeCompellingEvent,
      salesTaxonomy,
      kpiClassifier,
      activeOppPhases,
      activeOppKinds,
      activeCommercialStatuses,
      activeAccountSizes,
      phaseLabel,
      kindLabel,
      statusLabel,
      sizeLabel,
      addOppPhase,
      updateOppPhase,
      removeOppPhase,
      moveOppPhase,
      addOppKind,
      updateOppKind,
      removeOppKind,
      addCommercialStatus,
      updateCommercialStatus,
      removeCommercialStatus,
      addAccountSize,
      updateAccountSize,
      removeAccountSize,
      updateKpiRules,
      resetConfig,
    ],
  );

  return (
    <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
  );
}

export function useOrgConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error("useOrgConfig must be used within ConfigProvider");
  }
  return ctx;
}

