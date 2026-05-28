import { describe, expect, it } from "vitest";
import { checkRateLimit, checkReplay, isSameOriginRequest } from "@/lib/security";

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
});
