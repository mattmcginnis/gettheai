import { describe, expect, it } from "vitest";
import { createMockSession, hasRole, validatePassword, validateTwoFactorCode } from "@/lib/auth";

describe("auth scaffolding", () => {
  it("enforces a stronger password policy", () => {
    expect(validatePassword("short").valid).toBe(false);
    expect(validatePassword("Marketplace2026").valid).toBe(true);
  });

  it("validates six-digit 2FA codes", () => {
    expect(validateTwoFactorCode("123456")).toBe(true);
    expect(validateTwoFactorCode("abc")).toBe(false);
  });

  it("upgrades sellers to two-factor verification", () => {
    const session = createMockSession({
      email: "seller@getthe.com",
      role: "seller",
      twoFactorCode: "123456"
    });

    expect(session.verificationTier).toBe("two_factor");
    expect(session.twoFactorEnabled).toBe(true);
  });

  it("rejects seller role headers without 2FA once local fallback is explicit", async () => {
    const originalFallback = process.env.ALLOW_LOCAL_AUTH_FALLBACK;
    process.env.ALLOW_LOCAL_AUTH_FALLBACK = "true";

    const request = new Request("https://getthe.local/seller", {
      headers: {
        "x-getthe-role": "buyer"
      }
    });

    await expect(hasRole(request, ["seller"])).resolves.toBe(false);

    if (originalFallback) {
      process.env.ALLOW_LOCAL_AUTH_FALLBACK = originalFallback;
    } else {
      delete process.env.ALLOW_LOCAL_AUTH_FALLBACK;
    }
  });
});
