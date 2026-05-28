import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAiOutreachDraft, listModerationQueue, runModerationScan } from "@/lib/repository";

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("moderation and outreach", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("runs a local moderation scan", async () => {
    const result = await runModerationScan();
    const queue = await listModerationQueue();

    expect(result.scannedListings).toBeGreaterThan(0);
    expect(Array.isArray(result.flags)).toBe(true);
    expect(queue.length).toBeGreaterThan(0);
  });

  it("creates outreach drafts that require approval", async () => {
    const draft = await createAiOutreachDraft({
      listingId: "dom-6",
      targetCompany: "AI Infrastructure Labs",
      targetEmail: "founder@example.com",
      context: "Relevant AI tooling buyer."
    });

    expect(draft.requiresHumanApproval).toBe(true);
    expect(draft.draft.requiresHumanApproval).toBe(true);
  });
});
