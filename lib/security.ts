const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const replayCache = new Map<string, number>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// Synchronous, in-memory limiter. Correct for local development and as a cheap
// per-instance first gate. For cross-instance durable limiting in production,
// see lib/rate-limit.ts (RATE_LIMIT_BACKEND).
export function checkRateLimit({
  key,
  limit = 120,
  windowMs = 60_000
}: {
  key: string;
  limit?: number;
  windowMs?: number;
}): RateLimitResult {
  const now = Date.now();
  const existing = rateLimitBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  existing.count += 1;
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt
  };
}

export function isSameOriginRequest({
  origin,
  host
}: {
  origin: string | null;
  host: string | null;
}) {
  if (!origin || !host) {
    return true;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function checkReplay({
  key,
  windowMs = 5 * 60_000
}: {
  key: string | null;
  windowMs?: number;
}) {
  if (!key) {
    return { allowed: true };
  }

  const now = Date.now();
  for (const [cachedKey, expiresAt] of replayCache.entries()) {
    if (expiresAt <= now) {
      replayCache.delete(cachedKey);
    }
  }

  if (replayCache.has(key)) {
    return { allowed: false };
  }

  replayCache.set(key, now + windowMs);
  return { allowed: true };
}

export function getRequestId(headers: Headers) {
  return headers.get("x-request-id") ?? crypto.randomUUID();
}

export function applySecurityHeaders(response: Response, requestId: string) {
  response.headers.set("x-request-id", requestId);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  return response;
}
