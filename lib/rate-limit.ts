import { checkRateLimit, type RateLimitResult } from "@/lib/security";

// Durable, pluggable rate limiting.
//
// The synchronous in-memory limiter in lib/security.ts is correct for local
// development and as a cheap first gate, but its Map lives in a single process.
// On Vercel/serverless each invocation can land on a fresh instance, so the
// in-memory counter does not enforce a shared limit across instances. This
// module adds a backend-pluggable async limiter so production deployments can
// count against shared storage.
//
// Backends (RATE_LIMIT_BACKEND):
//   - "memory"   (default) — wraps the in-memory limiter; per-instance only.
//   - "postgres"           — fixed-window counter persisted via Prisma.
//
// IMPORTANT: the Postgres backend uses Prisma and therefore only runs in the
// Node.js runtime (API route handlers, jobs). Next.js Edge middleware cannot
// import Prisma; for durable limiting *in middleware*, plug an Edge-compatible
// HTTP store (e.g. Upstash Redis REST) into the RateLimitStore seam below.

export type RateLimitBackend = "memory" | "postgres";

export interface RateLimitRequest {
  key: string;
  limit?: number;
  windowMs?: number;
}

export interface RateLimitStore {
  hit(request: Required<RateLimitRequest>): Promise<RateLimitResult>;
}

const DEFAULT_LIMIT = 120;
const DEFAULT_WINDOW_MS = 60_000;

class MemoryRateLimitStore implements RateLimitStore {
  async hit({ key, limit, windowMs }: Required<RateLimitRequest>): Promise<RateLimitResult> {
    return checkRateLimit({ key, limit, windowMs });
  }
}

class PostgresRateLimitStore implements RateLimitStore {
  async hit({ key, limit, windowMs }: Required<RateLimitRequest>): Promise<RateLimitResult> {
    const { getPrisma } = await import("@/lib/prisma");
    const prisma = getPrisma();
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const resetAt = windowStart.getTime() + windowMs;

    // Upsert the bucket for this (key, windowStart) pair and atomically
    // increment. Distinct windows are distinct rows, so an expired window never
    // blocks a new one and stale rows can be swept on a schedule.
    const counter = await prisma.rateLimitCounter.upsert({
      where: { key_windowStart: { key, windowStart } },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } }
    });

    return {
      allowed: counter.count <= limit,
      remaining: Math.max(0, limit - counter.count),
      resetAt
    };
  }
}

let cachedStore: RateLimitStore | null = null;
let cachedBackend: RateLimitBackend | null = null;

export function getRateLimitBackend(): RateLimitBackend {
  return process.env.RATE_LIMIT_BACKEND === "postgres" ? "postgres" : "memory";
}

export function getRateLimitStore(): RateLimitStore {
  const backend = getRateLimitBackend();
  if (cachedStore && cachedBackend === backend) {
    return cachedStore;
  }

  cachedBackend = backend;
  cachedStore = backend === "postgres" ? new PostgresRateLimitStore() : new MemoryRateLimitStore();
  return cachedStore;
}

// Async durable rate-limit check for Node-runtime contexts (API routes, jobs).
export async function enforceRateLimit(request: RateLimitRequest): Promise<RateLimitResult> {
  return getRateLimitStore().hit({
    key: request.key,
    limit: request.limit ?? Number(process.env.RATE_LIMIT_WRITES_PER_MINUTE ?? DEFAULT_LIMIT),
    windowMs: request.windowMs ?? DEFAULT_WINDOW_MS
  });
}

// Test seam: reset the memoized store between cases that flip RATE_LIMIT_BACKEND.
export function resetRateLimitStoreForTesting() {
  cachedStore = null;
  cachedBackend = null;
}
