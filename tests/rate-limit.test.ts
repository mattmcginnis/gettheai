import { afterEach, describe, expect, it, vi } from "vitest";
import { enforceRateLimit, getRateLimitBackend, resetRateLimitStoreForTesting } from "@/lib/rate-limit";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  resetRateLimitStoreForTesting();
});

describe("durable rate limiting", () => {
  it("defaults to the in-memory backend", () => {
    expect(getRateLimitBackend()).toBe("memory");
  });

  it("selects the postgres backend when configured", () => {
    vi.stubEnv("RATE_LIMIT_BACKEND", "postgres");
    resetRateLimitStoreForTesting();
    expect(getRateLimitBackend()).toBe("postgres");
  });

  it("blocks once the in-memory window limit is exceeded", async () => {
    const key = `unit-${Date.now()}`;
    const first = await enforceRateLimit({ key, limit: 1 });
    const second = await enforceRateLimit({ key, limit: 1 });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.remaining).toBe(0);
  });

  it("counts against shared storage in the postgres backend", async () => {
    vi.stubEnv("RATE_LIMIT_BACKEND", "postgres");
    resetRateLimitStoreForTesting();

    const counts: number[] = [];
    const upsert = vi.fn(async () => ({ count: (counts.push(1), counts.length) }));
    vi.doMock("@/lib/prisma", () => ({
      getPrisma: () => ({ rateLimitCounter: { upsert } })
    }));

    const { enforceRateLimit: enforce, resetRateLimitStoreForTesting: reset } = await import("@/lib/rate-limit");
    reset();

    const key = `pg-${Date.now()}`;
    const first = await enforce({ key, limit: 1 });
    const second = await enforce({ key, limit: 1 });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(upsert).toHaveBeenCalledTimes(2);

    vi.doUnmock("@/lib/prisma");
  });
});
