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

  it("rejects invalid domains", () => {
    expect(isValidDomain("not a domain")).toBe(false);
    expect(() => appraiseDomain("not a domain")).toThrow();
  });
});
