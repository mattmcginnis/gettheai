import { describe, expect, it } from "vitest";
import { runModerationScan, createAiOutreachDraft } from "@/lib/repository";

describe("moderation and outreach", () => {
  it("runs a local moderation scan", async () => {
    const result = await runModerationScan();

    expect(result.scannedListings).toBeGreaterThan(0);
    expect(Array.isArray(result.flags)).toBe(true);
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
