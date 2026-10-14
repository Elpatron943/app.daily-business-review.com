import { describe, expect, it } from "vitest";
import { mapStripeStatus } from "../../scripts/subscriptionSyncCore";

describe("mapStripeStatus", () => {
  it("active et essai Stripe → active", () => {
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("trialing")).toBe("active");
  });
  it("impayé → past_due", () => {
    expect(mapStripeStatus("past_due")).toBe("past_due");
    expect(mapStripeStatus("unpaid")).toBe("past_due");
  });
  it("résiliation → canceled", () => {
    expect(mapStripeStatus("canceled")).toBe("canceled");
    expect(mapStripeStatus("incomplete_expired")).toBe("canceled");
    expect(mapStripeStatus("active", true)).toBe("canceled");
  });
  it("paiement en cours ignoré", () => {
    expect(mapStripeStatus("incomplete")).toBeNull();
  });
});
