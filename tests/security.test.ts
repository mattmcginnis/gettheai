import { describe, expect, it } from "vitest";
import {
  verifyEscrowWebhookSignature,
  verifyEscrowWebhookTimestamp
} from "@/lib/escrow";
import {
  applySecurityHeaders,
  checkRateLimit,
  checkReplay,
  getRequestId,
  isSameOriginRequest
} from "@/lib/security";

describe("private beta security controls", () => {
  it("blocks cross-origin write origins", () => {
    expect(isSameOriginRequest({ origin: "https://getthe.com", host: "getthe.com" })).toBe(true);
    expect(isSameOriginRequest({ origin: "https://evil.example", host: "getthe.com" })).toBe(false);
  });

  it("rate limits repeated keys inside the window", () => {
    const key = `test-${Date.now()}`;
    expect(checkRateLimit({ key, limit: 1 }).allowed).toBe(true);
    expect(checkRateLimit({ key, limit: 1 }).allowed).toBe(false);
  });

  it("rejects replayed webhook keys", () => {
    const key = `sig-${Date.now()}`;
    expect(checkReplay({ key }).allowed).toBe(true);
    expect(checkReplay({ key }).allowed).toBe(false);
  });

  it("adds baseline security headers", () => {
    const requestId = getRequestId(new Headers({ "x-request-id": "req_test" }));
    const response = applySecurityHeaders(new Response("ok"), requestId);

    expect(response.headers.get("x-request-id")).toBe("req_test");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  it("allows unsigned escrow webhooks only outside configured signature mode", () => {
    const originalSecret = process.env.ESCROW_WEBHOOK_SECRET;
    delete process.env.ESCROW_WEBHOOK_SECRET;

    expect(verifyEscrowWebhookSignature("{}", null)).toBe(process.env.NODE_ENV !== "production");
    expect(verifyEscrowWebhookTimestamp(null)).toBe(true);

    if (originalSecret) {
      process.env.ESCROW_WEBHOOK_SECRET = originalSecret;
    }
  });

  it("rejects stale signed escrow webhook timestamps", () => {
    const originalSecret = process.env.ESCROW_WEBHOOK_SECRET;
    const originalWindow = process.env.ESCROW_WEBHOOK_REPLAY_WINDOW_SECONDS;
    process.env.ESCROW_WEBHOOK_SECRET = "test_secret";
    process.env.ESCROW_WEBHOOK_REPLAY_WINDOW_SECONDS = "300";

    expect(verifyEscrowWebhookTimestamp(String(Date.now()))).toBe(true);
    expect(verifyEscrowWebhookTimestamp(String(Date.now() - 10 * 60 * 1000))).toBe(false);
    expect(verifyEscrowWebhookTimestamp(null)).toBe(false);

    if (originalSecret) {
      process.env.ESCROW_WEBHOOK_SECRET = originalSecret;
    } else {
      delete process.env.ESCROW_WEBHOOK_SECRET;
    }

    if (originalWindow) {
      process.env.ESCROW_WEBHOOK_REPLAY_WINDOW_SECONDS = originalWindow;
    } else {
      delete process.env.ESCROW_WEBHOOK_REPLAY_WINDOW_SECONDS;
    }
  });
});
