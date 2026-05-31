import {
  ListingStatus as PrismaListingStatus,
  Prisma,
  SupportStatus as PrismaSupportStatus,
  TransactionStatus as PrismaTransactionStatus
} from "@prisma/client";
import { appraiseDomain, getTld } from "@/lib/appraisal";
import type {
  Appraisal,
  DomainListing,
  ListingType,
  Offer,
  OfferInboxItem,
  SellerProfile,
  SellerProfilePage,
  SupportCaseItem,
  Transaction,
  TransactionDashboardItem,
  TransactionStatus,
  VerificationTier
} from "@/lib/types";
import type { PrismaListing, PrismaOffer, PrismaTransaction } from "./includes";
import type { LocalTransactionRecord } from "./types";
import { centsToDollars, dollarsToCents } from "./utils";

export function mapListing(row: NonNullable<PrismaListing>): DomainListing {
  return {
    id: row.id,
    domain: row.domain,
    tld: getTld(row.domain),
    registrar: row.registrar ?? "Unknown",
    seller: {
      id: row.seller.id,
      publicName: row.seller.sellerProfile?.publicName ?? row.seller.displayName ?? "Verified Seller",
      slug: row.seller.sellerProfile?.slug ?? row.seller.id,
      verified: row.seller.twoFactorEnabled,
      transactionCount: 0,
      avgResponseHours: 6
    },
    status: row.status.toLowerCase() as DomainListing["status"],
    listingType: row.listingType.toLowerCase() as ListingType,
    price: centsToDollars(row.priceCents),
    minimumOffer: centsToDollars(row.minimumOfferCents ?? row.priceCents),
    commissionRate: row.commissionBps / 10000,
    ownershipVerified: row.status === "ACTIVE" || Boolean((row.ownershipVerification as { verifiedAt?: string })?.verifiedAt),
    description: row.description,
    category: row.category,
    trafficMonthly: row.trafficMonthly,
    domainAgeYears: row.domainAgeYears,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    brandSignals: Array.isArray(row.brandSignals) ? (row.brandSignals as string[]) : [],
    createdAt: row.createdAt.toISOString(),
    appraisal: row.appraisal ? mapAppraisal(row.appraisal) : appraiseDomain(row.domain)
  };
}

export function mapAppraisal(row: {
  domain: string;
  lowEstimateCents: number;
  highEstimateCents: number;
  confidence: number;
  comparableSales: unknown;
  keywordSignals: unknown;
  brandabilityNotes: string;
  generatedSummary: string;
  modelVersion: string;
}): Appraisal {
  return {
    domain: row.domain,
    lowEstimate: centsToDollars(row.lowEstimateCents),
    highEstimate: centsToDollars(row.highEstimateCents),
    confidence: row.confidence,
    comparableSales: Array.isArray(row.comparableSales) ? (row.comparableSales as Appraisal["comparableSales"]) : [],
    keywordSignals: Array.isArray(row.keywordSignals) ? (row.keywordSignals as string[]) : [],
    brandabilityNotes: row.brandabilityNotes,
    generatedSummary: row.generatedSummary,
    modelVersion: row.modelVersion,
    disclaimer: appraiseDomain(row.domain).disclaimer
  };
}

export function mapOffer(row: NonNullable<PrismaOffer>): Offer {
  return {
    id: row.id,
    listingId: row.listingId,
    buyerEmail: row.buyer.email,
    amount: centsToDollars(row.amountCents),
    status: row.status.toLowerCase() as Offer["status"],
    buyerVerificationTier: mapVerificationFromPrisma(row.buyerVerificationTier),
    expiresAt: row.expiresAt.toISOString(),
    negotiationHistory: Array.isArray(row.negotiationHistory) ? (row.negotiationHistory as Offer["negotiationHistory"]) : []
  };
}

export function mapOfferInbox(row: NonNullable<PrismaOffer>): OfferInboxItem {
  return {
    id: row.id,
    domain: row.listing.domain,
    listingId: row.listingId,
    buyerEmail: row.buyer.email,
    sellerEmail: row.listing.seller.email,
    sellerName: row.listing.seller.sellerProfile?.publicName ?? row.listing.seller.displayName ?? row.listing.seller.email,
    amount: centsToDollars(row.amountCents),
    status: row.status.toLowerCase() as Offer["status"],
    buyerVerificationTier: mapVerificationFromPrisma(row.buyerVerificationTier),
    expiresAt: row.expiresAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function mapTransaction(row: NonNullable<PrismaTransaction>): Transaction {
  return {
    id: row.id,
    listingId: row.listingId,
    offerId: row.offerId ?? undefined,
    buyerEmail: row.buyer.email,
    sellerId: row.sellerId,
    escrowProvider: "escrow.com",
    escrowId: row.escrowId ?? undefined,
    escrowUrl: row.escrowUrl ?? undefined,
    amount: centsToDollars(row.amountCents),
    commission: centsToDollars(row.commissionCents),
    status: row.status.toLowerCase() as TransactionStatus,
    statusTimeline: Array.isArray(row.statusTimeline) ? (row.statusTimeline as Transaction["statusTimeline"]) : [],
    transferChecklist: Array.isArray(row.transferChecklist) ? (row.transferChecklist as Transaction["transferChecklist"]) : []
  };
}

export function mapTransactionDashboardItem(row: NonNullable<PrismaTransaction>): TransactionDashboardItem {
  const transaction = mapTransaction(row);
  return {
    id: transaction.id,
    listingId: transaction.listingId,
    domain: row.listing.domain,
    buyerEmail: row.buyer.email,
    sellerEmail: row.listing.seller.email,
    sellerName: row.listing.seller.sellerProfile?.publicName ?? row.listing.seller.displayName ?? row.listing.seller.email,
    amount: transaction.amount,
    commission: transaction.commission,
    status: transaction.status,
    escrowId: transaction.escrowId,
    escrowUrl: transaction.escrowUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function mapLocalTransactionDashboardItem(record: LocalTransactionRecord): TransactionDashboardItem {
  return {
    id: record.transaction.id,
    listingId: record.transaction.listingId,
    domain: record.listing.domain,
    buyerEmail: record.transaction.buyerEmail,
    sellerEmail: record.sellerEmail,
    sellerName: record.listing.seller.publicName,
    amount: record.transaction.amount,
    commission: record.transaction.commission,
    status: record.transaction.status,
    escrowId: record.transaction.escrowId,
    escrowUrl: record.transaction.escrowUrl,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export function buildSellerProfilePage(seller: SellerProfile, listings: DomainListing[]): SellerProfilePage {
  const activeListings = listings.filter((listing) => listing.status === "active").length;
  const pendingListings = listings.filter((listing) => listing.status === "pending_verification").length;
  const totalAsk = listings.reduce((sum, listing) => sum + listing.price, 0);

  return {
    seller,
    listings,
    metrics: {
      activeListings,
      pendingListings,
      totalAsk,
      averageAsk: listings.length ? Math.round(totalAsk / listings.length) : 0,
      tlds: Array.from(new Set(listings.map((listing) => listing.tld))).sort(),
      categories: Array.from(new Set(listings.map((listing) => listing.category))).sort()
    }
  };
}

export function mapAppraisalToCreate(appraisal: Appraisal) {
  return {
    domain: appraisal.domain,
    lowEstimateCents: dollarsToCents(appraisal.lowEstimate),
    highEstimateCents: dollarsToCents(appraisal.highEstimate),
    confidence: appraisal.confidence,
    comparableSales: appraisal.comparableSales as unknown as Prisma.InputJsonValue,
    keywordSignals: appraisal.keywordSignals as Prisma.InputJsonValue,
    brandabilityNotes: appraisal.brandabilityNotes,
    generatedSummary: appraisal.generatedSummary,
    modelVersion: appraisal.modelVersion,
    disclaimerAccepted: false
  };
}

export function mapVerificationToPrisma(tier: VerificationTier) {
  return tier.toUpperCase() as "EMAIL" | "TWO_FACTOR" | "ESCROW_INTENT" | "KYC_REVIEW";
}

export function mapVerificationFromPrisma(tier: string): VerificationTier {
  return tier.toLowerCase() as VerificationTier;
}

export function mapListingStatusToPrisma(status: DomainListing["status"]) {
  const map = {
    draft: PrismaListingStatus.DRAFT,
    pending_verification: PrismaListingStatus.PENDING_VERIFICATION,
    active: PrismaListingStatus.ACTIVE,
    flagged: PrismaListingStatus.FLAGGED,
    sold: PrismaListingStatus.SOLD,
    archived: PrismaListingStatus.ARCHIVED
  };

  return map[status];
}

export function mapListingTypeToPrisma(listingType: ListingType) {
  const map = {
    buy_now: "BUY_NOW",
    make_offer: "MAKE_OFFER",
    buy_now_and_offer: "BUY_NOW_AND_OFFER"
  } as const;

  return map[listingType];
}

export function mapSupportStatusToPrisma(status: SupportCaseItem["status"]) {
  const map = {
    open: PrismaSupportStatus.OPEN,
    waiting_on_user: PrismaSupportStatus.WAITING_ON_USER,
    escalated: PrismaSupportStatus.ESCALATED,
    resolved: PrismaSupportStatus.RESOLVED
  };

  return map[status];
}

export function mapTransactionStatusToPrisma(status: TransactionStatus) {
  return status.toUpperCase() as PrismaTransactionStatus;
}

export function mapSupportCase(row: {
  id: string;
  requester: { email: string };
  subject: string;
  status: string;
  transactionId: string | null;
  aiDraftResponses: unknown;
  escalationNotes: string | null;
  createdAt: Date;
}): SupportCaseItem {
  return {
    id: row.id,
    requesterEmail: row.requester.email,
    subject: row.subject,
    status: row.status.toLowerCase() as SupportCaseItem["status"],
    transactionId: row.transactionId ?? undefined,
    aiDraftResponses: Array.isArray(row.aiDraftResponses)
      ? (row.aiDraftResponses as SupportCaseItem["aiDraftResponses"])
      : [],
    escalationNotes: row.escalationNotes ?? undefined,
    createdAt: row.createdAt.toISOString()
  };
}

export function mapEscrowStatus(status: string | undefined): TransactionStatus {
  const normalized = status?.toLowerCase();
  if (normalized?.includes("fund")) return "buyer_funded";
  if (normalized?.includes("transfer")) return "domain_transfer_started";
  if (normalized?.includes("verify")) return "transfer_verified";
  if (normalized?.includes("release") || normalized?.includes("complete")) return "payout_complete";
  if (normalized?.includes("cancel")) return "canceled";
  if (normalized?.includes("dispute")) return "disputed";
  return "escrow_started";
}
