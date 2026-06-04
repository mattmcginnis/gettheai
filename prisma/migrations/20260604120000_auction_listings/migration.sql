-- Auction listings: a new ListingType plus auction configuration columns on
-- DomainListing. Bids reuse the existing Offer table (a bid is a PENDING offer
-- whose expiresAt = the auction end time). reservePriceCents is never exposed to
-- buyers; only "reserve met" is surfaced through the application layer.

-- AlterEnum
ALTER TYPE "ListingType" ADD VALUE 'AUCTION';

-- AlterTable
ALTER TABLE "DomainListing"
  ADD COLUMN "auctionEndsAt" TIMESTAMP(3),
  ADD COLUMN "reservePriceCents" INTEGER,
  ADD COLUMN "bidIncrementCents" INTEGER,
  ADD COLUMN "auctionSettledAt" TIMESTAMP(3);

-- Auction money columns must be sane when present.
ALTER TABLE "DomainListing"
  ADD CONSTRAINT "DomainListing_reservePriceCents_nonnegative"
  CHECK ("reservePriceCents" IS NULL OR "reservePriceCents" >= 0);

ALTER TABLE "DomainListing"
  ADD CONSTRAINT "DomainListing_bidIncrementCents_positive"
  CHECK ("bidIncrementCents" IS NULL OR "bidIncrementCents" > 0);

-- CreateIndex (settlement sweep: open auctions past their end time)
CREATE INDEX "DomainListing_listingType_status_auctionEndsAt_idx"
  ON "DomainListing" ("listingType", "status", "auctionEndsAt");
