import { describe, expect, it } from "vitest";
import { appraiseDomain, isValidDomain } from "@/lib/appraisal";

describe("appraisal", () => {
  it("normalizes and appraises valid domains", () => {
    const appraisal = appraiseDomain("https://AgentForge.ai/path");

    expect(appraisal.domain).toBe("agentforge.ai");
    expect(appraisal.lowEstimate).toBeGreaterThan(0);
    expect(appraisal.highEstimate).toBeGreaterThan(appraisal.lowEstimate);
    expect(appraisal.confidence).toBeGreaterThan(50);
    expect(appraisal.disclaimer).toContain("informational");
  });

  it("calibrates category-defining .com generics above ordinary brandables", () => {
    const appraisal = appraiseDomain("business.com");

    expect(appraisal.lowEstimate).toBeGreaterThanOrEqual(5_000_000);
    expect(appraisal.highEstimate).toBeGreaterThanOrEqual(20_000_000);
    expect(appraisal.confidence).toBeGreaterThanOrEqual(85);
    expect(appraisal.keywordSignals).toContain("category-defining commercial generic");
    expect(appraisal.generatedSummary).toContain("premium strategic-buyer band");
  });

  it("keeps ordinary brandable .com appraisals out of premium generic bands", () => {
    const appraisal = appraiseDomain("brightledger.com");

    expect(appraisal.highEstimate).toBeLessThan(100_000);
    expect(appraisal.generatedSummary).toContain("mid-market band");
  });

  it("rejects invalid domains", () => {
    expect(isValidDomain("not a domain")).toBe(false);
    expect(() => appraiseDomain("not a domain")).toThrow();
  });
});
