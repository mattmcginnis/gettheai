import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createListingDraft,
  getAuctionState,
  getMarketplaceListing,
  listAuctionBids,
  listTransactionDashboard,
  placeBid,
  settleAuction,
  settleDueAuctions
} from "@/lib/repository";
import type { VerificationTier } from "@/lib/types";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalPostmarkToken = process.env.POSTMARK_SERVER_TOKEN;

const SELLER = "auction-seller@getthe.com";

async function createAuction(
  domain: string,
  opts: { price?: number; minimumOffer?: number; bidIncrement?: number; reservePrice?: number; endsInMs?: number } = {}
) {
  return createListingDraft({
    domain,
    price: opts.price ?? 2000,
    minimumOffer: opts.minimumOffer ?? 500,
    category: "tech",
    sellerEmail: SELLER,
    auction: {
      endsAt: new Date(Date.now() + (opts.endsInMs ?? 60_000)).toISOString(),
      reservePrice: opts.reservePrice,
      bidIncrement: opts.bidIncrement ?? 100
    }
  });
}

function bid(listingId: string, buyerEmail: string, amount: number, tier: VerificationTier = "two_factor") {
  return placeBid({ listingId, buyerEmail, amount, buyerVerificationTier: tier });
}

describe("auction repository (local mode)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTMARK_SERVER_TOKEN;
  });

  afterEach(() => {
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    else delete process.env.DATABASE_URL;
    if (originalPostmarkToken) process.env.POSTMARK_SERVER_TOKEN = originalPostmarkToken;
    else delete process.env.POSTMARK_SERVER_TOKEN;
  });

  it("accepts a first bid at or above the starting bid and tracks state", async () => {
    const listing = await createAuction("auc-first.com", { minimumOffer: 500, bidIncrement: 100 });
    const { auction } = await bid(listing.id, "buyer-a@example.com", 600);

    expect(auction.highestBid).toBe(600);
    expect(auction.highestBidderEmail).toBe("buyer-a@example.com");
    expect(auction.bidCount).toBe(1);
    expect(auction.open).toBe(true);
    expect(auction.minimumNextBid).toBe(700);
  });

  it("enforces the minimum next bid increment", async () => {
    const listing = await createAuction("auc-increment.com", { minimumOffer: 500, bidIncrement: 100 });
    await bid(listing.id, "buyer-a@example.com", 600);
    await expect(bid(listing.id, "buyer-b@example.com", 650)).rejects.toThrow(/Minimum next bid is 700/);
  });

  it("gates bids by buyer verification tier", async () => {
    const listing = await createAuction("auc-verify.com", { minimumOffer: 500 });
    await expect(bid(listing.id, "buyer-low@example.com", 600, "email")).rejects.toThrow(/verification/);
  });

  it("updates a buyer's single live bid when they raise (one live offer per buyer)", async () => {
    const listing = await createAuction("auc-raise.com", { minimumOffer: 500, bidIncrement: 100 });
    await bid(listing.id, "buyer-a@example.com", 600);
    const { auction } = await bid(listing.id, "buyer-a@example.com", 700);

    expect(auction.highestBid).toBe(700);
    expect(auction.bidCount).toBe(1);
    expect(auction.bidderCount).toBe(1);
  });

  it("handles an outbid by another buyer", async () => {
    const listing = await createAuction("auc-outbid.com", { minimumOffer: 500, bidIncrement: 100 });
    await bid(listing.id, "buyer-a@example.com", 600);
    const { auction } = await bid(listing.id, "buyer-b@example.com", 800);

    expect(auction.highestBid).toBe(800);
    expect(auction.highestBidderEmail).toBe("buyer-b@example.com");
    expect(auction.bidCount).toBe(2);
    expect(auction.bidderCount).toBe(2);
  });

  it("rejects bids after the auction has ended", async () => {
    const listing = await createAuction("auc-ended.com", { endsInMs: -1_000 });
    await expect(bid(listing.id, "buyer-a@example.com", 600)).rejects.toThrow(/ended/);
  });

  it("settles a reserve-met auction: winner accepted, losers expired, listing sold, transaction created", async () => {
    const listing = await createAuction("auc-settle-win.com", { minimumOffer: 500, bidIncrement: 100, reservePrice: 700 });
    await bid(listing.id, "buyer-a@example.com", 600);
    await bid(listing.id, "buyer-b@example.com", 800);

    const settled = await settleAuction(listing.id, new Date(Date.now() + 120_000));

    expect(settled.settled).toBe(true);
    expect(settled.winnerEmail).toBe("buyer-b@example.com");
    expect(settled.reserveMet).toBe(true);
    expect(settled.open).toBe(false);

    const bids = await listAuctionBids(listing.id);
    expect(bids.find((b) => b.buyerEmail === "buyer-b@example.com")?.status).toBe("accepted");
    expect(bids.find((b) => b.buyerEmail === "buyer-a@example.com")?.status).toBe("expired");

    const sold = await getMarketplaceListing(listing.id);
    expect(sold?.status).toBe("sold");

    const dashboard = await listTransactionDashboard({ email: "buyer-b@example.com", role: "buyer" });
    expect(dashboard.some((tx) => tx.domain === "auc-settle-win.com")).toBe(true);
  });

  it("settles a reserve-not-met auction with no sale: all bids expired, no winner", async () => {
    const listing = await createAuction("auc-settle-noreserve.com", { minimumOffer: 500, bidIncrement: 100, reservePrice: 5000 });
    await bid(listing.id, "buyer-a@example.com", 600);
    await bid(listing.id, "buyer-b@example.com", 800);

    const settled = await settleAuction(listing.id, new Date(Date.now() + 120_000));

    expect(settled.settled).toBe(true);
    expect(settled.winnerEmail).toBeNull();
    expect(settled.reserveMet).toBe(false);

    const bids = await listAuctionBids(listing.id);
    expect(bids.every((b) => b.status === "expired")).toBe(true);

    const listingAfter = await getMarketplaceListing(listing.id);
    expect(listingAfter?.status).not.toBe("sold");
  });

  it("is idempotent: settling an already-settled auction does not change the winner", async () => {
    const listing = await createAuction("auc-idempotent.com", { minimumOffer: 500, bidIncrement: 100 });
    await bid(listing.id, "buyer-a@example.com", 600);

    const first = await settleAuction(listing.id, new Date(Date.now() + 120_000));
    const second = await settleAuction(listing.id, new Date(Date.now() + 240_000));

    expect(first.winnerEmail).toBe("buyer-a@example.com");
    expect(second.winnerEmail).toBe("buyer-a@example.com");
    expect(second.settled).toBe(true);
  });

  it("lazily settles an ended auction on read and exposes a sweep count", async () => {
    const listing = await createAuction("auc-sweep.com", { minimumOffer: 500, endsInMs: -1_000 });
    const result = await settleDueAuctions();
    expect(typeof result.settled).toBe("number");

    // getAuctionState lazily settles a past-end, unsettled auction.
    const state = await getAuctionState(listing.id);
    expect(state.open).toBe(false);
    expect(state.settled).toBe(true);
    expect(state.winnerEmail).toBeNull();
  });
});
