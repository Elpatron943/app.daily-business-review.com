import { describe, expect, it } from "vitest";
import { buildSetPasswordUrl } from "../../scripts/selfServeProvisionCore";

describe("buildSetPasswordUrl", () => {
  it("pointe vers l'app avec le jeton et le type (vérifiés par l'app)", () => {
    const url = buildSetPasswordUrl("https://app.daily-business-review.com/", "abc123", "invite");
    expect(url).toBe("https://app.daily-business-review.com/?token_hash=abc123&type=invite");
  });

  it("encode le jeton et gère le type recovery", () => {
    const url = new URL(buildSetPasswordUrl("https://app.daily-business-review.com/", "a+b/c=", "recovery"));
    expect(url.origin).toBe("https://app.daily-business-review.com");
    expect(url.searchParams.get("token_hash")).toBe("a+b/c=");
    expect(url.searchParams.get("type")).toBe("recovery");
  });
});
