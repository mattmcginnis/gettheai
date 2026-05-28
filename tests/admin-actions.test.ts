import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  adminAddTransactionDisputeNote,
  adminCancelOffer,
  adminUpdateListingStatus,
  adminUpdateSupportCase,
  adminVerifySeller
} from "@/lib/repository";

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("admin workflow fallbacks", () => {
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

  it("records listing status actions in local mode", async () => {
    const result = await adminUpdateListingStatus({
      listingId: "dom-1",
      status: "flagged",
      actorEmail: "admin@getthe.com",
      note: "Trademark review."
    });

    expect(result).toMatchObject({
      action: "listing_status",
      listingId: "dom-1",
      status: "flagged",
      mode: "local"
    });
  });

  it("records seller verification decisions in local mode", async () => {
    const result = await adminVerifySeller({
      sellerEmail: "seller@example.com",
      verificationTier: "two_factor",
      actorEmail: "admin@getthe.com"
    });

    expect(result).toMatchObject({
      action: "seller_verification",
      sellerEmail: "seller@example.com",
      verificationTier: "two_factor",
      twoFactorEnabled: true,
      mode: "local"
    });
  });

  it("records offer, support, and dispute interventions in local mode", async () => {
    const offer = await adminCancelOffer({
      offerId: "offer_123",
      actorEmail: "admin@getthe.com",
      note: "Buyer verification failed."
    });
    const support = await adminUpdateSupportCase({
      caseId: "case_123",
      status: "escalated",
      escalationNotes: "Transfer dispute needs manual review.",
      actorEmail: "admin@getthe.com"
    });
    const dispute = await adminAddTransactionDisputeNote({
      transactionId: "txn_123",
      actorEmail: "admin@getthe.com",
      note: "Registrar transfer is stalled."
    });

    expect(offer).toMatchObject({ action: "offer_cancel", status: "canceled" });
    expect(support).toMatchObject({ action: "support_update", status: "escalated" });
    expect(dispute).toMatchObject({ action: "transaction_dispute", status: "disputed" });
  });
});
