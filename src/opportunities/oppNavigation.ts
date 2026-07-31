/** Origine de navigation vers une fiche opportunité (retour contextuel). */
export type OppDetailBackTarget =
  | { type: "list" }
  | { type: "account"; accountId: string }
  | { type: "dashboard" };

const OPEN_OPP_DETAIL_KEY = "powermap.openOppDetail";
const OPEN_OPP_BACK_KEY = "powermap.openOppBack";
const OPEN_ACCOUNT_KEY = "powermap.openAccountId";

export { OPEN_OPP_DETAIL_KEY, OPEN_OPP_BACK_KEY, OPEN_ACCOUNT_KEY };

export function openOpportunityDetail(
  opportunityId: string,
  back: OppDetailBackTarget = { type: "list" },
) {
  try {
    sessionStorage.setItem(OPEN_OPP_DETAIL_KEY, opportunityId);
    sessionStorage.setItem(OPEN_OPP_BACK_KEY, JSON.stringify(back));
  } catch {
    /* ignore */
  }
}

export function consumeOpenOpportunityDetail(): string | null {
  try {
    const id = sessionStorage.getItem(OPEN_OPP_DETAIL_KEY);
    if (id) sessionStorage.removeItem(OPEN_OPP_DETAIL_KEY);
    return id;
  } catch {
    return null;
  }
}

export function consumeOppDetailBackTarget(): OppDetailBackTarget {
  try {
    const raw = sessionStorage.getItem(OPEN_OPP_BACK_KEY);
    sessionStorage.removeItem(OPEN_OPP_BACK_KEY);
    if (!raw) return { type: "list" };
    const parsed = JSON.parse(raw) as OppDetailBackTarget;
    if (parsed?.type === "account" && parsed.accountId) return parsed;
    if (parsed?.type === "dashboard") return parsed;
    return { type: "list" };
  } catch {
    return { type: "list" };
  }
}

export function peekOppDetailBackTarget(): OppDetailBackTarget {
  try {
    const raw = sessionStorage.getItem(OPEN_OPP_BACK_KEY);
    if (!raw) return { type: "list" };
    const parsed = JSON.parse(raw) as OppDetailBackTarget;
    if (parsed?.type === "account" && parsed.accountId) return parsed;
    if (parsed?.type === "dashboard") return parsed;
    return { type: "list" };
  } catch {
    return { type: "list" };
  }
}

/** Rouvrir une fiche entreprise après retour depuis une opp. */
export function requestOpenAccount(accountId: string) {
  try {
    sessionStorage.setItem(OPEN_ACCOUNT_KEY, accountId);
  } catch {
    /* ignore */
  }
}

export function consumeOpenAccountId(): string | null {
  try {
    const id = sessionStorage.getItem(OPEN_ACCOUNT_KEY);
    if (id) sessionStorage.removeItem(OPEN_ACCOUNT_KEY);
    return id;
  } catch {
    return null;
  }
}

export function oppDetailBackLabel(
  back: OppDetailBackTarget,
  accountName?: string | null,
): string {
  if (back.type === "account") {
    return accountName
      ? `← Retour à ${accountName}`
      : "← Retour à l’entreprise";
  }
  if (back.type === "dashboard") return "← Retour au dashboard";
  return "← Retour aux opportunités";
}
