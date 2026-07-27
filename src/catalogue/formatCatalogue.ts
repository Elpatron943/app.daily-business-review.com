import type { SolutionDef } from "../config/types";

export type CatalogueSummary = {
  solutionName: string;
  moduleLabels: string[];
  /** Ex. "Platform EU · Core, SSO" ou "—" */
  short: string;
};

/** Résumé catalogue pour listes, tooltips et dashboards. */
export function summarizeCatalogue(
  opportunity: { solutionId?: string; moduleIds?: string[] },
  solutions: SolutionDef[],
): CatalogueSummary {
  const sol =
    solutions.find((s) => s.id === opportunity.solutionId) ?? null;
  const solutionName = sol
    ? sol.code
      ? `${sol.name} (${sol.code})`
      : sol.name
    : "";
  const moduleLabels = (opportunity.moduleIds ?? [])
    .map((id) => sol?.modules?.find((m) => m.id === id)?.label)
    .filter((l): l is string => Boolean(l));
  if (!solutionName && moduleLabels.length === 0) {
    return { solutionName: "", moduleLabels: [], short: "—" };
  }
  const mods =
    moduleLabels.length === 0
      ? ""
      : moduleLabels.length <= 2
        ? moduleLabels.join(", ")
        : `${moduleLabels.slice(0, 2).join(", ")} +${moduleLabels.length - 2}`;
  return {
    solutionName,
    moduleLabels,
    short: mods ? `${solutionName} · ${mods}` : solutionName || "—",
  };
}
