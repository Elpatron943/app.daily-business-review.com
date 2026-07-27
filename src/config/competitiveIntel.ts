import type { Opportunity } from "../opportunities/OpportunityContext";
import { computeProcessProgress } from "../opportunities/salesProcess";
import type { OrgConfig } from "./types";

/**
 * Snapshot structuré pour une future IA (analyse process + positionnement).
 * Ne contient que les éléments actifs / utiles au contexte.
 */
export function buildCompetitiveIntelSnapshot(
  config: OrgConfig,
  opportunity?: Opportunity | null,
) {
  const profile = config.orgProfile;
  const solutions = config.solutions
    .filter((s) => s.active)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      description: s.description,
      features: (s.modules ?? [])
        .filter((m) => m.active)
        .sort((a, b) => a.order - b.order)
        .map((m) => ({
          id: m.id,
          label: m.label,
          description: m.description,
          usps: (m.usps ?? [])
            .filter((u) => u.active)
            .sort((a, b) => a.order - b.order)
            .map((u) => ({
              id: u.id,
              label: u.label,
              description: u.description,
            })),
        })),
    }));

  const competitors = (config.competitors ?? [])
    .filter((c) => c.active)
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      features: (c.features ?? [])
        .filter((f) => f.active)
        .sort((a, b) => a.order - b.order)
        .map((f) => ({
          id: f.id,
          label: f.label,
          description: f.description,
          ourModuleId: f.ourModuleId,
        })),
    }));

  const process = opportunity
    ? computeProcessProgress(
        config.processDomains,
        opportunity.processAnswers,
      )
    : null;

  return {
    vendor: {
      name: profile?.name ?? "",
      description: profile?.description ?? "",
      usps: (profile?.usps ?? [])
        .filter((u) => u.active)
        .sort((a, b) => a.order - b.order)
        .map((u) => ({
          id: u.id,
          label: u.label,
          description: u.description,
        })),
    },
    solutions,
    competitors,
    opportunity: opportunity
      ? {
          id: opportunity.id,
          name: opportunity.name,
          amount: opportunity.amount,
          kind: opportunity.kind,
          phase: opportunity.phase,
          solutionId: opportunity.solutionId,
          moduleIds: opportunity.moduleIds,
          mappingChecks: opportunity.mappingChecks,
          stakeholders: opportunity.stakeholders ?? [],
          processOverallPct: process?.overallPct ?? 0,
          processDomains: process?.domains ?? [],
        }
      : null,
  };
}
