import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  adminAddTransactionDisputeNote,
  adminCancelOffer,
  adminUpdateListingStatus,
  adminUpdateSupportCase,
  adminVerifySeller,
  createListingDraft,
  deleteSellerListing,
  retryTransactionEscrowHandoff,
  updateSellerListingDetails,
  updateSellerListingStatus,
  updateTransactionOperations
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

  it("lets sellers update their own listing status in local mode", async () => {
    const result = await updateSellerListingStatus({
      listingId: "dom-1",
      status: "archived",
      actorEmail: "seller@example.com",
      actorRole: "seller"
    });

    expect(result).toMatchObject({
      action: "seller_listing_status",
      mode: "local"
    });
    await updateSellerListingStatus({
      listingId: "dom-1",
      status: "active",
      actorEmail: "seller@example.com",
      actorRole: "seller"
    });
  });

  it("lets sellers edit and delete draft listing details in local mode", async () => {
    const listing = await createListingDraft({
      domain: "crud-example.com",
      price: 1400,
      minimumOffer: 900,
      registrar: "Namecheap",
      category: "SaaS",
      sellerEmail: "seller@example.com"
    });
    const updated = await updateSellerListingDetails({
      listingId: listing.id,
      actorEmail: "seller@example.com",
      actorRole: "seller",
      price: 1800,
      minimumOffer: 1200,
      registrar: "Cloudflare",
      category: "Developer Tools",
      listingType: "buy_now_and_offer",
      description: "A practical two-word domain for developer tooling and infrastructure teams.",
      trafficMonthly: 25,
      domainAgeYears: 2,
      seoTitle: "CrudExample.com is for sale",
      seoDescription: "Acquire CrudExample.com through GetThe with transparent escrow handoff."
    });
    const deleted = await deleteSellerListing({
      listingId: listing.id,
      actorEmail: "seller@example.com",
      actorRole: "seller"
    });

    expect(updated).toMatchObject({
      action: "seller_listing_update",
      listing: {
        price: 1800,
        registrar: "Cloudflare",
        category: "Developer Tools"
      },
      mode: "local"
    });
    expect(deleted).toMatchObject({
      action: "seller_listing_delete",
      deleted: true,
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

  it("records transaction operation updates in local mode", async () => {
    const result = await updateTransactionOperations({
      transactionId: "txn_123",
      status: "buyer_funded",
      checklistUpdates: [{ index: 0, done: true }],
      actorEmail: "admin@getthe.com",
      note: "Buyer funding verified."
    });

    expect(result).toMatchObject({
      action: "transaction_operations",
      transactionId: "txn_123",
      status: "buyer_funded",
      checklistUpdates: [{ index: 0, done: true }],
      mode: "local"
    });
  });

  it("records escrow handoff retry actions in local mode", async () => {
    const result = await retryTransactionEscrowHandoff({
      transactionId: "txn_123",
      actorEmail: "admin@getthe.com",
      note: "Escrow link expired."
    });

    expect(result).toMatchObject({
      action: "transaction_handoff_retry",
      transactionId: "txn_123",
      recovered: true,
      mode: "local"
    });
  });
});
