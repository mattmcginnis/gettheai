import { Prisma, TransactionStatus as PrismaTransactionStatus } from "@prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import type { OperationalAnalytics } from "@/lib/types";
import { getLocalListings, localOffers } from "@/lib/repository/internal/local-store";
import { centsToDollars, rate } from "@/lib/repository/internal/utils";

export async function recordAnalyticsEvent(input: {
  eventType:
    | "analytics.appraisal.completed"
    | "analytics.search.performed"
    | "analytics.listing.viewed"
    | "analytics.parking.viewed"
    | "analytics.ai.buyers_suggested";
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isDatabaseConfigured()) {
    return {
      recorded: false,
      mode: "local"
    };
  }

  await getPrisma().auditEvent.create({
    data: {
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue
    }
  });

  return {
    recorded: true,
    mode: "database"
  };
}


export async function getOperationalAnalytics(): Promise<OperationalAnalytics> {
  if (!isDatabaseConfigured()) {
    const listings = getLocalListings().filter((listing) => listing.status === "active");
    return {
      appraisalCount: listings.length,
      listingCount: listings.length,
      appraisalToListingRate: 100,
      searchCount: 0,
      detailViewCount: 0,
      searchToDetailRate: 0,
      offerCount: localOffers.length,
      offerRate: 0,
      escrowStartedCount: 0,
      escrowStartRate: 0,
      completedGmv: 0,
      failedHandoffCount: 0
    };
  }

  const prisma = getPrisma();
  const [
    appraisalCount,
    listingCount,
    searchCount,
    detailViewCount,
    offerCount,
    escrowStartedCount,
    completedTransactions,
    failedHandoffCount
  ] = await Promise.all([
    prisma.auditEvent.count({ where: { eventType: "analytics.appraisal.completed" } }),
    prisma.domainListing.count({ where: { status: "ACTIVE" } }),
    prisma.auditEvent.count({ where: { eventType: "analytics.search.performed" } }),
    prisma.auditEvent.count({ where: { eventType: "analytics.listing.viewed" } }),
    prisma.offer.count(),
    prisma.transaction.count({
      where: {
        status: {
          in: [
            PrismaTransactionStatus.ESCROW_STARTED,
            PrismaTransactionStatus.BUYER_FUNDED,
            PrismaTransactionStatus.DOMAIN_TRANSFER_STARTED,
            PrismaTransactionStatus.TRANSFER_VERIFIED,
            PrismaTransactionStatus.PAYOUT_COMPLETE,
            PrismaTransactionStatus.CLOSED
          ]
        }
      }
    }),
    prisma.transaction.findMany({
      where: {
        status: {
          in: [PrismaTransactionStatus.PAYOUT_COMPLETE, PrismaTransactionStatus.CLOSED]
        }
      },
      select: { amountCents: true }
    }),
    prisma.auditEvent.count({ where: { eventType: "escrow.handoff.failed" } })
  ]);

  return {
    appraisalCount,
    listingCount,
    appraisalToListingRate: rate(listingCount, appraisalCount),
    searchCount,
    detailViewCount,
    searchToDetailRate: rate(detailViewCount, searchCount),
    offerCount,
    offerRate: rate(offerCount, detailViewCount),
    escrowStartedCount,
    escrowStartRate: rate(escrowStartedCount, offerCount),
    completedGmv: centsToDollars(completedTransactions.reduce((sum, transaction) => sum + transaction.amountCents, 0)),
    failedHandoffCount
  };
}

