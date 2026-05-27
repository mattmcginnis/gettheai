-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('BUYER', 'SELLER', 'ADMIN');

-- CreateEnum
CREATE TYPE "VerificationTier" AS ENUM ('EMAIL', 'TWO_FACTOR', 'ESCROW_INTENT', 'KYC_REVIEW');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'FLAGGED', 'SOLD', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('BUY_NOW', 'MAKE_OFFER', 'BUY_NOW_AND_OFFER');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('INITIATED', 'ESCROW_STARTED', 'BUYER_FUNDED', 'DOMAIN_TRANSFER_STARTED', 'TRANSFER_VERIFIED', 'PAYOUT_COMPLETE', 'CLOSED', 'CANCELED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'WAITING_ON_USER', 'ESCALATED', 'RESOLVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'BUYER',
    "verificationTier" "VerificationTier" NOT NULL DEFAULT 'EMAIL',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notificationPreferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "payoutPreference" TEXT NOT NULL DEFAULT 'escrow.com',
    "supportStatus" "SupportStatus" NOT NULL DEFAULT 'OPEN',
    "importedPortfolioMeta" JSONB NOT NULL DEFAULT '{}',
    "commissionDiscountBps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainListing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "tld" TEXT NOT NULL,
    "registrar" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "listingType" "ListingType" NOT NULL DEFAULT 'BUY_NOW_AND_OFFER',
    "priceCents" INTEGER NOT NULL,
    "minimumOfferCents" INTEGER,
    "commissionBps" INTEGER NOT NULL DEFAULT 700,
    "ownershipVerification" JSONB NOT NULL DEFAULT '{}',
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "trafficMonthly" INTEGER NOT NULL DEFAULT 0,
    "domainAgeYears" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" TEXT NOT NULL,
    "seoDescription" TEXT NOT NULL,
    "landingPageSlug" TEXT NOT NULL,
    "brandSignals" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appraisal" (
    "id" TEXT NOT NULL,
    "listingId" TEXT,
    "domain" TEXT NOT NULL,
    "lowEstimateCents" INTEGER NOT NULL,
    "highEstimateCents" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "comparableSales" JSONB NOT NULL,
    "keywordSignals" JSONB NOT NULL,
    "brandabilityNotes" TEXT NOT NULL,
    "generatedSummary" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "disclaimerAccepted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appraisal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "buyerVerificationTier" "VerificationTier" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "negotiationHistory" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "offerId" TEXT,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "escrowProvider" TEXT NOT NULL DEFAULT 'escrow.com',
    "escrowId" TEXT,
    "escrowUrl" TEXT,
    "amountCents" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'INITIATED',
    "statusTimeline" JSONB NOT NULL DEFAULT '[]',
    "transferChecklist" JSONB NOT NULL DEFAULT '[]',
    "payoutState" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "cadence" TEXT NOT NULL DEFAULT 'weekly',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCase" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
    "transactionId" TEXT,
    "aiDraftResponses" JSONB NOT NULL DEFAULT '[]',
    "escalationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SellerProfile_userId_key" ON "SellerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerProfile_slug_key" ON "SellerProfile"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "DomainListing_domain_key" ON "DomainListing"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "DomainListing_landingPageSlug_key" ON "DomainListing"("landingPageSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Appraisal_listingId_key" ON "Appraisal"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_offerId_key" ON "Transaction"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_listingId_key" ON "Watchlist"("userId", "listingId");

-- AddForeignKey
ALTER TABLE "SellerProfile" ADD CONSTRAINT "SellerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainListing" ADD CONSTRAINT "DomainListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appraisal" ADD CONSTRAINT "Appraisal_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "DomainListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "DomainListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "DomainListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "DomainListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchAlert" ADD CONSTRAINT "SearchAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
