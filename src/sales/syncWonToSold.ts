import {
  isCompanyLevelSoldLine,
  soldLinePersonaIds,
  type SoldSolution,
} from "../data";
import type { Opportunity } from "../opportunities/OpportunityContext";

/**
 * Quand une opportunité passe en Won, matérialise le CA dans les lignes de vente
 * (source unique du CA installé) — évite le double comptage Won + facturé.
 */
export function buildSoldLineFromWonOpportunity(
  opportunity: Opportunity,
  existingLines: SoldSolution[],
): Omit<SoldSolution, "id" | "currency"> & { id?: string } | null {
  if (!opportunity.primaryAccountId || !opportunity.solutionId) return null;
  const amount = Math.max(0, Number(opportunity.amount) || 0);
  if (amount <= 0) return null;

  const existing = existingLines.find(
    (s) =>
      s.accountId === opportunity.primaryAccountId &&
      s.solutionId === opportunity.solutionId &&
      isCompanyLevelSoldLine(s),
  );

  const personaIds = Array.isArray(opportunity.personaIds)
    ? [...new Set(opportunity.personaIds.filter(Boolean))]
    : [];

  if (existing) {
    // Renouvellement : remplace l’ARR installé. Autres kinds : ajoute le montant gagné.
    const nextBilled =
      opportunity.kind === "renewal"
        ? amount
        : existing.billedAmount + amount;
    const existingPersonae = soldLinePersonaIds(existing);
    return {
      id: existing.id,
      solutionId: existing.solutionId,
      accountId: existing.accountId,
      personaId: existing.personaId,
      personaIds: existingPersonae,
      moduleIds:
        opportunity.moduleIds?.length
          ? [
              ...new Set([
                ...(existing.moduleIds ?? []),
                ...opportunity.moduleIds,
              ]),
            ]
          : existing.moduleIds ?? [],
      billedAmount: nextBilled,
    };
  }

  return {
    solutionId: opportunity.solutionId,
    accountId: opportunity.primaryAccountId,
    personaId: personaIds[0] ?? null,
    personaIds,
    moduleIds: opportunity.moduleIds ?? [],
    billedAmount: amount,
  };
}
