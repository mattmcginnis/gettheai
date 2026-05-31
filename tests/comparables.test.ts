import { afterEach, describe, expect, it, vi } from "vitest";
import { datasetComparables } from "@/data/comparable-sales";
import { appraiseDomain } from "@/lib/appraisal";
import { getComparableSource, setComparableSource } from "@/lib/comparables";

describe("comparable sources", () => {
  afterEach(() => {
    setComparableSource(null);
    vi.unstubAllEnvs();
  });

  it("defaults to the seed source", () => {
    expect(getComparableSource().name).toBe("seed");
  });

  it("uses the dataset source when COMPARABLES_PROVIDER=dataset", () => {
    vi.stubEnv("COMPARABLES_PROVIDER", "dataset");
    const source = getComparableSource();
    expect(source.name).toBe("dataset");
    expect(source.all()).toBe(datasetComparables);
    expect(source.all().length).toBeGreaterThan(0);
  });

  it("honors an injected override ahead of the env flag", () => {
    vi.stubEnv("COMPARABLES_PROVIDER", "dataset");
    const custom = [
      { domain: "override.com", price: 1, date: "2026-01-01", venue: "test", tld: "com" as const }
    ];
    setComparableSource({ name: "custom", all: () => custom });
    expect(getComparableSource().name).toBe("custom");
    expect(getComparableSource().all()).toBe(custom);
  });

  it("appraisal pulls comparables from the active source", () => {
    setComparableSource({
      name: "single",
      all: () => [
        { domain: "agentmesh.ai", price: 99000, date: "2026-01-01", venue: "test", tld: "ai" as const }
      ]
    });

    const appraisal = appraiseDomain("agentflow.ai");
    expect(appraisal.comparableSales.length).toBeGreaterThan(0);
    expect(appraisal.comparableSales.every((sale) => sale.domain === "agentmesh.ai")).toBe(true);
  });
});
