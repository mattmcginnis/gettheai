import { isEscrowApiConfigured } from "@/lib/escrow";
import { isDatabaseConfigured } from "@/lib/prisma";
import { getSearchIndexProvider } from "@/lib/search-index";
import { getStorageProvider } from "@/lib/storage";

export type LogLevel = "info" | "warn" | "error";

export function logEvent({
  level = "info",
  event,
  requestId,
  metadata
}: {
  level?: LogLevel;
  event: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    requestId,
    metadata: sanitizeLogMetadata(metadata ?? {})
  };
  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function getRuntimeDiagnostics() {
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "unset",
    database: isDatabaseConfigured() ? "configured" : "local",
    search: getSearchIndexProvider(),
    escrow: isEscrowApiConfigured() ? "api" : "handoff",
    ai: process.env.AI_PROVIDER ?? "local",
    storage: getStorageProvider(),
    rateLimitWritesPerMinute: Number(process.env.RATE_LIMIT_WRITES_PER_MINUTE ?? 120),
    localAuthFallback:
      process.env.ALLOW_LOCAL_AUTH_FALLBACK === "true" ||
      !(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY),
    productionSecretsRequired: process.env.REQUIRE_PRODUCTION_SECRETS === "true"
  };
}

function sanitizeLogMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !/(secret|token|password|key)/i.test(key))
  );
}
