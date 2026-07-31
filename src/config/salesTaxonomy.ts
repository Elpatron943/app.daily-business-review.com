import { defaultConfig } from "./defaults";
import {
  DEFAULT_KPI_RULES,
  type AccountSizeDef,
  type CommercialStatusDef,
  type KpiRulesConfig,
  type OppKindDef,
  type OppKindTargetMode,
  type OppPhaseDef,
  type OppPhaseKpiRole,
  type OrgConfig,
} from "./types";

/** Aligné sur OppAmountSource (data.ts) — évite import circulaire. */
type OppAmountSource = {
  amount: number;
  phase: string;
  solutionId: string;
  primaryAccountId: string;
  kind?: string;
  closeDate?: string;
};
export type SalesTaxonomy = {
  oppPhases: OppPhaseDef[];
  oppKinds: OppKindDef[];
  commercialStatuses: CommercialStatusDef[];
  accountSizes: AccountSizeDef[];
  kpiRules: KpiRulesConfig;
};

export function salesTaxonomyFromConfig(
  config: Pick<
    OrgConfig,
    | "oppPhases"
    | "oppKinds"
    | "commercialStatuses"
    | "accountSizes"
    | "kpiRules"
  >,
): SalesTaxonomy {
  return {
    oppPhases: config.oppPhases?.length
      ? config.oppPhases
      : defaultConfig.oppPhases,
    oppKinds: config.oppKinds?.length ? config.oppKinds : defaultConfig.oppKinds,
    commercialStatuses: config.commercialStatuses?.length
      ? config.commercialStatuses
      : defaultConfig.commercialStatuses,
    accountSizes: config.accountSizes?.length
      ? config.accountSizes
      : defaultConfig.accountSizes,
    kpiRules: { ...DEFAULT_KPI_RULES, ...(config.kpiRules ?? {}) },
  };
}

function phaseRole(
  phases: OppPhaseDef[],
  phase: string,
): OppPhaseKpiRole | null {
  const hit = phases.find((p) => p.id === phase || p.label === phase);
  return hit?.kpiRole ?? null;
}

function kindMode(
  kinds: OppKindDef[],
  kind: string | undefined,
): OppKindTargetMode {
  if (!kind) return "by_phase";
  const hit = kinds.find((k) => k.id === kind);
  return hit?.targetMode ?? (kind === "renewal" ? "renewal" : "by_phase");
}

export type KpiClassifier = {
  isWhitespacePhase: (phase: string) => boolean;
  isPipelineOpportunityPhase: (phase: string) => boolean;
  isOpenOpportunityPhase: (phase: string) => boolean;
  isWonPhase: (phase: string) => boolean;
  isLostPhase: (phase: string) => boolean;
  isRenewalOpportunity: (o: { kind?: string }) => boolean;
  isWhitespaceTargetOpp: (o: OppAmountSource) => boolean;
  isPipelineTargetOpp: (o: OppAmountSource) => boolean;
  isOpenRenewalOpp: (o: OppAmountSource) => boolean;
  isWonInstalledOpp: (o: OppAmountSource, year?: number) => boolean;
};

export function buildKpiClassifier(
  taxonomy: SalesTaxonomy = salesTaxonomyFromConfig(defaultConfig),
): KpiClassifier {
  const { oppPhases: phases, oppKinds: kinds, kpiRules: rules } = taxonomy;

  const roleOf = (phase: string) => phaseRole(phases, phase);
  const modeOf = (kind?: string) => kindMode(kinds, kind);

  const isWhitespacePhase = (phase: string) => {
    const r = roleOf(phase);
    if (r) return r === "whitespace";
    return phase === "Whitespace";
  };

  const isWonPhase = (phase: string) => {
    const r = roleOf(phase);
    if (r) return r === "won";
    return phase === "Closed Won";
  };

  const isLostPhase = (phase: string) => {
    const r = roleOf(phase);
    if (r) return r === "lost";
    return phase === "Closed Lost";
  };

  const isPipelineOpportunityPhase = (phase: string) => {
    const r = roleOf(phase);
    if (r) return r === "active";
    return (
      !isWhitespacePhase(phase) && !isWonPhase(phase) && !isLostPhase(phase)
    );
  };

  const isOpenOpportunityPhase = (phase: string) =>
    !isWonPhase(phase) && !isLostPhase(phase);

  const isRenewalOpportunity = (o: { kind?: string }) =>
    modeOf(o.kind) === "renewal";

  const isWhitespaceTargetOpp = (o: OppAmountSource) => {
    if (modeOf(o.kind) === "none") return false;
    if (modeOf(o.kind) === "renewal") return false;
    return isWhitespacePhase(o.phase);
  };

  const isPipelineTargetOpp = (o: OppAmountSource) => {
    if (modeOf(o.kind) === "none") return false;
    if (modeOf(o.kind) === "renewal") return false;
    return isPipelineOpportunityPhase(o.phase);
  };

  const isOpenRenewalOpp = (o: OppAmountSource) =>
    isRenewalOpportunity(o) && isOpenOpportunityPhase(o.phase);

  const isWonInstalledOpp = (
    o: OppAmountSource,
    year = new Date().getFullYear(),
  ) => {
    if (!isWonPhase(o.phase)) return false;
    if (!rules.wonCalendarYearOnly) return true;
    if (!o.closeDate) return true;
    const d = new Date(`${o.closeDate}T12:00:00`);
    if (Number.isNaN(d.getTime())) return true;
    return d.getFullYear() === year;
  };

  return {
    isWhitespacePhase,
    isPipelineOpportunityPhase,
    isOpenOpportunityPhase,
    isWonPhase,
    isLostPhase,
    isRenewalOpportunity,
    isWhitespaceTargetOpp,
    isPipelineTargetOpp,
    isOpenRenewalOpp,
    isWonInstalledOpp,
  };
}

export const defaultKpiClassifier = buildKpiClassifier(
  salesTaxonomyFromConfig(defaultConfig),
);

export function activeSortedPhases(taxonomy: SalesTaxonomy): OppPhaseDef[] {
  return [...taxonomy.oppPhases]
    .filter((p) => p.active)
    .sort((a, b) => a.order - b.order);
}

export function activeSortedKinds(taxonomy: SalesTaxonomy): OppKindDef[] {
  return [...taxonomy.oppKinds]
    .filter((k) => k.active)
    .sort((a, b) => a.order - b.order);
}

export function activeSortedStatuses(
  taxonomy: SalesTaxonomy,
): CommercialStatusDef[] {
  return [...taxonomy.commercialStatuses]
    .filter((s) => s.active)
    .sort((a, b) => a.order - b.order);
}

export function activeSortedSizes(taxonomy: SalesTaxonomy): AccountSizeDef[] {
  return [...taxonomy.accountSizes]
    .filter((s) => s.active)
    .sort((a, b) => a.order - b.order);
}

export function phaseLabelOf(taxonomy: SalesTaxonomy, id: string): string {
  return (
    taxonomy.oppPhases.find((p) => p.id === id)?.label ??
    id
  );
}

export function kindLabelOf(taxonomy: SalesTaxonomy, id: string): string {
  return taxonomy.oppKinds.find((k) => k.id === id)?.label ?? id;
}

export function statusLabelOf(taxonomy: SalesTaxonomy, id: string): string {
  return (
    taxonomy.commercialStatuses.find((s) => s.id === id)?.label ?? id
  );
}

export function sizeLabelOf(taxonomy: SalesTaxonomy, id: string): string {
  return taxonomy.accountSizes.find((s) => s.id === id)?.label ?? id;
}
