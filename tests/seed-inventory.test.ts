import { describe, expect, it, beforeEach } from "vitest";
import { seedInventoryBatch } from "@/lib/repository";

const HEADER = "domain,price,minimumOffer,registrar,category";

describe("seedInventoryBatch (admin house-inventory seeding)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("creates, attests, and activates accepted domains in one pass", async () => {
    const csv = [
      HEADER,
      "seed-alpha-001.com,2500,1800,Namecheap,Brandable",
      "seed-beta-001.io,4200,3000,Porkbun,Tech"
    ].join("\n");

    const result = await seedInventoryBatch(csv, {
      sellerEmail: "founder@getthe.com",
      actorEmail: "admin@getthe.com"
    });

    expect(result.summary.accepted).toBe(2);
    expect(result.summary.activated).toBe(2);
    expect(result.summary.activationFailures).toBe(0);
    expect(result.summary.ownershipMethod).toBe("manual");
    expect(result.activated.map((entry) => entry.domain)).toEqual(
      expect.arrayContaining(["seed-alpha-001.com", "seed-beta-001.io"])
    );
  });

  it("routes invalid and below-floor rows to review without activating them", async () => {
    const csv = [
      HEADER,
      "not a domain,2500,,Namecheap,Brandable",
      "seed-gamma-002.com,100,,Porkbun,Tech"
    ].join("\n");

    const result = await seedInventoryBatch(csv);

    expect(result.summary.accepted).toBe(0);
    expect(result.summary.activated).toBe(0);
    expect(result.review.length).toBe(2);
  });

  it("honors autoActivate:false to stage inventory without publishing", async () => {
    const csv = [HEADER, "seed-delta-003.com,6000,4000,Cloudflare,AI"].join("\n");

    const result = await seedInventoryBatch(csv, { autoActivate: false });

    expect(result.summary.accepted).toBe(1);
    expect(result.summary.activated).toBe(0);
    expect(result.activated).toHaveLength(0);
  });
});
