import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLaunchGates } from "@/lib/beta-checklist";

const originalEnv = {
  CRON_SECRET: process.env.CRON_SECRET,
  DATABASE_URL: process.env.DATABASE_URL,
  LEGAL_DOCS_APPROVED: process.env.LEGAL_DOCS_APPROVED,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN
};

describe("launch readiness gates", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    process.env.DATABASE_URL = "postgres://getthe.local/test";
    process.env.LEGAL_DOCS_APPROVED = "true";
    process.env.NEXT_PUBLIC_APP_URL = "https://getthe.com";
    process.env.POSTMARK_SERVER_TOKEN = "postmark-token";
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key as keyof typeof originalEnv];
      } else {
        process.env[key as keyof typeof originalEnv] = value;
      }
    }
  });

  it("surfaces production automation gates", () => {
    const gates = getLaunchGates();

    expect(gates.some((gate) => gate.id === "scheduled-alerts" && gate.status === "pass")).toBe(true);
    expect(gates.some((gate) => gate.id === "legal-docs" && gate.status === "pass")).toBe(true);
    expect(gates.some((gate) => gate.id === "app-url" && gate.status === "pass")).toBe(true);
    expect(gates.find((gate) => gate.id === "database")).toMatchObject({
      owner: "engineering",
      envVars: ["DATABASE_URL"]
    });
  });
});
