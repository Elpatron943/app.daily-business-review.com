import type {
  OppMappingChecks,
  OrgProfile,
  SolutionDef,
  UspDef,
} from "../config/types";

export const USP_CARD_PREFIX = "usp:";

export type OpportunityUspOption = {
  cardId: string;
  usp: UspDef;
  /** Module parent ou « Organisation ». */
  sourceLabel: string;
};

export function uspCardId(uspId: string): string {
  return `${USP_CARD_PREFIX}${uspId}`;
}

export function parseUspCardId(cardId: string): string | null {
  if (!cardId.startsWith(USP_CARD_PREFIX)) return null;
  const id = cardId.slice(USP_CARD_PREFIX.length);
  return id || null;
}

/** USP actifs rattachés à l’opp (modules sélectionnés + USP org). */
export function collectOpportunityUsps(
  opportunity: { solutionId?: string; moduleIds?: string[] },
  solutions: SolutionDef[],
  orgProfile?: OrgProfile | null,
): OpportunityUspOption[] {
  const out: OpportunityUspOption[] = [];
  const seen = new Set<string>();

  const push = (usp: UspDef, sourceLabel: string) => {
    if (!usp.active || seen.has(usp.id)) return;
    seen.add(usp.id);
    out.push({ cardId: uspCardId(usp.id), usp, sourceLabel });
  };

  for (const u of orgProfile?.usps ?? []) {
    push(u, "Organisation");
  }

  const sol =
    solutions.find((s) => s.id === opportunity.solutionId) ?? null;
  const moduleIds = new Set(opportunity.moduleIds ?? []);
  for (const m of sol?.modules ?? []) {
    if (!m.active || !moduleIds.has(m.id)) continue;
    for (const u of m.usps ?? []) {
      push(u, m.label);
    }
  }

  return out.sort(
    (a, b) =>
      a.sourceLabel.localeCompare(b.sourceLabel, "fr") ||
      a.usp.order - b.usp.order ||
      a.usp.label.localeCompare(b.usp.label, "fr"),
  );
}

/** Résout le libellé d’une carte USP (hors bibliothèque mapping). */
export function resolveUspCardLabel(
  cardId: string,
  solutions: SolutionDef[],
  orgProfile?: OrgProfile | null,
): { label: string; sourceLabel: string } | null {
  const uspId = parseUspCardId(cardId);
  if (!uspId) return null;

  for (const u of orgProfile?.usps ?? []) {
    if (u.id === uspId) {
      return { label: u.label, sourceLabel: "Organisation" };
    }
  }
  for (const s of solutions) {
    for (const m of s.modules ?? []) {
      for (const u of m.usps ?? []) {
        if (u.id === uspId) {
          return { label: u.label, sourceLabel: m.label };
        }
      }
    }
  }
  return { label: uspId, sourceLabel: "USP" };
}

/** True si le SWOT Forces (S) n’est pas aligné avec les USP catalogue actifs. */
export function mappingMissingUsps(
  checks: OppMappingChecks | undefined,
  uspOptions: Pick<OpportunityUspOption, "cardId">[],
): boolean {
  const list = checks?.signaux_positifs ?? [];
  const allowed = new Set(uspOptions.map((u) => u.cardId));
  if (
    uspOptions.some((u) => !list.some((e) => e.id === u.cardId))
  ) {
    return true;
  }
  return list.some((e) => {
    const uspId = parseUspCardId(e.id);
    return uspId !== null && !allowed.has(e.id);
  });
}

/**
 * Aligne le quadrant Forces (signaux_positifs) avec les USP catalogue actifs.
 * Préserve statut / commentaire des cartes déjà présentes.
 */
export function ensureOpportunityUspMappingChecks(
  checks: OppMappingChecks | undefined,
  uspOptions: Pick<OpportunityUspOption, "cardId">[],
): OppMappingChecks {
  const allowed = new Set(uspOptions.map((u) => u.cardId));
  const next: OppMappingChecks = { ...(checks ?? {}) };
  const list = (next.signaux_positifs ?? []).filter((e) => {
    const uspId = parseUspCardId(e.id);
    if (uspId === null) return true;
    return allowed.has(e.id);
  });
  for (const { cardId } of uspOptions) {
    if (!list.some((e) => e.id === cardId)) {
      list.push({ id: cardId, status: "open" });
    }
  }
  next.signaux_positifs = list;
  return next;
}
