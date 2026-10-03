import { formatQuotaLabel, isTrialExpired } from "./types";
import { useAuth } from "../auth/AuthContext";

function trialDaysLeft(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const end = Date.parse(trialEndsAt);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
}

/** Bannière quotas formule — sidebar / shell. */
export default function BillingQuotaBanner() {
  const { billing, organization } = useAuth();
  const planName = organization?.plan?.name;
  if (!planName && !organization) return null;

  const { usage, canWrite, seatsFull, opportunitiesFull, productLine } =
    billing;
  const daysLeft = trialDaysLeft(organization?.trial_ends_at ?? null);
  const trialExpired = isTrialExpired(organization);
  const productLabel =
    productLine === "pilotage" ? "Pilotage" : "Sales";

  let lockLabel: string | null = null;
  if (!canWrite) {
    if (organization?.subscription_status === "none") {
      lockLabel = " · en attente de paiement";
    } else if (trialExpired) {
      lockLabel = " · essai terminé";
    } else {
      lockLabel = " · lecture seule";
    }
  }

  return (
    <div
      className="billing-quota-banner"
      title={organization?.plan?.tagline || undefined}
    >
      <div className="billing-quota-plan">
        <span className="billing-quota-product">{productLabel}</span>
        {" · "}
        {planName ?? "Sans formule"}
        {organization?.subscription_status === "trialing" &&
        daysLeft != null &&
        canWrite ? (
          <span className="billing-quota-trial"> · {daysLeft} j restants</span>
        ) : null}
        {lockLabel ? (
          <span className="billing-quota-lock">{lockLabel}</span>
        ) : null}
      </div>
      <div className="billing-quota-meters">
        <span className={seatsFull ? "billing-quota-full" : undefined}>
          {formatQuotaLabel(usage.seatsUsed, usage.seatsLimit)} sièges
        </span>
        {usage.opportunitiesLimit != null ? (
          <>
            <span aria-hidden>·</span>
            <span
              className={opportunitiesFull ? "billing-quota-full" : undefined}
            >
              {formatQuotaLabel(
                usage.activeOpportunities,
                usage.opportunitiesLimit,
              )}{" "}
              opp.
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
