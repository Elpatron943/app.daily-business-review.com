import { formatQuotaLabel } from "./types";
import { useAuth } from "../auth/AuthContext";

/** Bannière quotas formule — sidebar / shell. */
export default function BillingQuotaBanner() {
  const { billing, organization } = useAuth();
  const planName = organization?.plan?.name;
  if (!planName && !organization) return null;

  const { usage, canWrite, seatsFull, opportunitiesFull } = billing;

  return (
    <div
      className="billing-quota-banner"
      title={organization?.plan?.tagline || undefined}
    >
      <div className="billing-quota-plan">
        {planName ?? "Sans formule"}
        {!canWrite ? (
          <span className="billing-quota-lock"> · lecture seule</span>
        ) : null}
      </div>
      <div className="billing-quota-meters">
        <span className={seatsFull ? "billing-quota-full" : undefined}>
          {formatQuotaLabel(usage.seatsUsed, usage.seatsLimit)} sièges
        </span>
        <span aria-hidden>·</span>
        <span className={opportunitiesFull ? "billing-quota-full" : undefined}>
          {formatQuotaLabel(usage.activeOpportunities, usage.opportunitiesLimit)}{" "}
          opp.
        </span>
      </div>
    </div>
  );
}
