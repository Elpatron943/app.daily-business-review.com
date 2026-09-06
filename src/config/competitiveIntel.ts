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
    .map((s) => {
      const features = (s.features ?? [])
        .filter((f) => f.active)
        .sort((a, b) => a.order - b.order)
        .map((f) => ({
          id: f.id,
          label: f.label,
          description: f.description,
          groupId: f.groupId,
          ourCoverage: f.ourCoverage,
        }));
      const competitorsAll = (s.competitors ?? [])
        .filter((c) => c.active)
        .sort((a, b) => a.order - b.order);
      const dealIds = opportunity?.competitorIds ?? [];
      const competitors =
        opportunity?.solutionId === s.id && dealIds.length > 0
          ? competitorsAll.filter((c) => dealIds.includes(c.id))
          : competitorsAll;
      return {
        id: s.id,
        name: s.name,
        code: s.code,
        description: s.description,
        featureGroups: (s.featureGroups ?? [])
          .filter((g) => g.active)
          .sort((a, b) => a.order - b.order)
          .map((g) => ({ id: g.id, label: g.label })),
        features,
        competitors: competitors.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          featureCoverage: c.featureCoverage ?? {},
        })),
      };
    });

  const competitorsMapped = solutions.flatMap((s) =>
    s.competitors.map((c) => ({
      ...c,
      solutionId: s.id,
      solutionName: s.name,
    })),
  );

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
    competitors: competitorsMapped,
    opportunity: opportunity
      ? {
          id: opportunity.id,
          name: opportunity.name,
          amount: opportunity.amount,
          kind: opportunity.kind,
          phase: opportunity.phase,
          solutionId: opportunity.solutionId,
          competitorIds: opportunity.competitorIds ?? [],
          mappingChecks: opportunity.mappingChecks,
          stakeholders: opportunity.stakeholders ?? [],
          processOverallPct: process?.overallPct ?? 0,
          processDomains: process?.domains ?? [],
        }
      : null,
  };
}
