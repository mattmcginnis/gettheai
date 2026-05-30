-- Static invariants that complement the app-level status state machines in
-- lib/transactions.ts. Postgres CHECK constraints cannot reference a row's
-- previous value, so transition legality is enforced in app code; these
-- constraints enforce the value/shape invariants the database CAN guarantee.

-- Seller commission discount must be a sane basis-point value (0%–100%).
ALTER TABLE "SellerProfile"
  ADD CONSTRAINT "SellerProfile_commissionDiscountBps_range"
  CHECK ("commissionDiscountBps" >= 0 AND "commissionDiscountBps" <= 10000);

-- Listing commission must also be a sane basis-point value, and money columns
-- must never be negative.
ALTER TABLE "DomainListing"
  ADD CONSTRAINT "DomainListing_commissionBps_range"
  CHECK ("commissionBps" >= 0 AND "commissionBps" <= 10000);

ALTER TABLE "DomainListing"
  ADD CONSTRAINT "DomainListing_priceCents_nonnegative"
  CHECK ("priceCents" >= 0);

-- An offer must expire strictly after it was created.
ALTER TABLE "Offer"
  ADD CONSTRAINT "Offer_expiresAt_after_createdAt"
  CHECK ("expiresAt" > "createdAt");

ALTER TABLE "Offer"
  ADD CONSTRAINT "Offer_amountCents_positive"
  CHECK ("amountCents" > 0);

-- Transaction money columns must never be negative.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_amountCents_nonnegative"
  CHECK ("amountCents" >= 0);

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_commissionCents_nonnegative"
  CHECK ("commissionCents" >= 0);

-- A buyer may hold at most one *live* (PENDING or COUNTERED) offer on a given
-- listing. Terminal offers (ACCEPTED/REJECTED/EXPIRED/CANCELED) are excluded so
-- a buyer can re-offer after a prior offer closes.
CREATE UNIQUE INDEX "Offer_one_live_per_buyer_per_listing"
  ON "Offer" ("listingId", "buyerId")
  WHERE "status" IN ('PENDING', 'COUNTERED');
