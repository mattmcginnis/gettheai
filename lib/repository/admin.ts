import { OfferStatus as PrismaOfferStatus, Prisma, TransactionStatus as PrismaTransactionStatus } from "@prisma/client";
import { COMMISSION_RATE } from "@/lib/constants";
import { scanListingRisk } from "@/lib/moderation";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { adminQueue, listings as seedListings } from "@/lib/seed";
import { assertListingTransition } from "@/lib/transactions";
import type { AdminQueueItem, SupportCaseItem, VerificationTier } from "@/lib/types";
import { type AdminEntityDetail, type AdminOperationFilters, adminRows, applyAdminOperationFilters, formatAdminMoney, normalizeAdminQueueItem, severityRank } from "@/lib/repository/internal/admin";
import { listingInclude, offerInclude, transactionInclude } from "@/lib/repository/internal/includes";
import { mapListing, mapListingStatusToPrisma, mapOffer, mapSupportCase, mapSupportStatusToPrisma, mapTransaction, mapVerificationFromPrisma, mapVerificationToPrisma } from "@/lib/repository/internal/mappers";
import { createAdminAudit, ensureUser, getPrismaListingByIdOrDomain, getPrismaOfferById } from "@/lib/repository/internal/prisma";
import { appendJsonArray, centsToDollars } from "@/lib/repository/internal/utils";
import { processPortfolioImport } from "@/lib/repository/listings";
import { getMarketplaceListing, listMarketplaceListings } from "@/lib/repository/marketplace";
import { listSupportCases } from "@/lib/repository/support";

export async function listModerationQueue(): Promise<AdminQueueItem[]> {
  if (!isDatabaseConfigured()) {
    return adminQueue;
  }

  const rows = await getPrisma().auditEvent.findMany({
    where: {
      OR: [
        { eventType: "moderation.flag.created", entityType: "admin_queue_item" },
        { eventType: { startsWith: "admin.review." }, entityType: "admin_queue_item" }
      ]
    },
    orderBy: { createdAt: "desc" },
    take: 250
  });

  const flags = new Map<string, AdminQueueItem>();
  const reviews = new Map<string, { status: AdminQueueItem["status"]; createdAt: Date }>();

  for (const row of rows) {
    if (row.eventType === "moderation.flag.created") {
      const item = normalizeAdminQueueItem(row.metadata, row.entityId, row.createdAt);
      if (!flags.has(item.id)) {
        flags.set(item.id, item);
      }
      continue;
    }

    const status: AdminQueueItem["status"] =
      row.eventType === "admin.review.approve" || row.eventType === "admin.review.reject" ? "resolved" : "reviewing";
    const existing = reviews.get(row.entityId);
    if (!existing || existing.createdAt < row.createdAt) {
      reviews.set(row.entityId, { status, createdAt: row.createdAt });
    }
  }

  return Array.from(flags.values())
    .map((item) => ({
      ...item,
      status: reviews.get(item.id)?.status ?? item.status
    }))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.createdAt.localeCompare(a.createdAt));
}


export async function getAdminOverview(filters: AdminOperationFilters = {}) {
  const activeListings = await listMarketplaceListings();
  const supportCases = await listSupportCases();
  const operations = await getAdminOperations(filters);
  const queue = await listModerationQueue();
  const gmv = activeListings.reduce((sum, listing) => sum + listing.price, 0);
  const commission = Math.round(gmv * COMMISSION_RATE);

  return {
    activeListings,
    gmv,
    commission,
    queue,
    supportCases,
    operations
  };
}


export async function getAdminOperations(filters: AdminOperationFilters = {}) {
  if (!isDatabaseConfigured()) {
    return applyAdminOperationFilters({
      users: [],
      listings: seedListings.slice(0, 8).map((listing) => ({
        id: listing.id,
        domain: listing.domain,
        status: listing.status,
        seller: listing.seller.publicName,
        price: listing.price,
        updatedAt: listing.createdAt
      })),
      offers: [],
      transactions: [],
      auditEvents: []
    }, filters);
  }

  const prisma = getPrisma();
  const [users, listings, offers, transactions, auditEvents] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.domainListing.findMany({ include: listingInclude(), orderBy: { updatedAt: "desc" }, take: 8 }),
    prisma.offer.findMany({ include: offerInclude(), orderBy: { updatedAt: "desc" }, take: 8 }),
    prisma.transaction.findMany({ include: transactionInclude(), orderBy: { updatedAt: "desc" }, take: 8 }),
    prisma.auditEvent.findMany({ include: { actor: true }, orderBy: { createdAt: "desc" }, take: 12 })
  ]);

  return applyAdminOperationFilters({
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase(),
      verificationTier: mapVerificationFromPrisma(user.verificationTier),
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt.toISOString()
    })),
    listings: listings.map((listing) => ({
      id: listing.id,
      domain: listing.domain,
      status: listing.status.toLowerCase(),
      seller: listing.seller.sellerProfile?.publicName ?? listing.seller.displayName ?? listing.seller.email,
      price: centsToDollars(listing.priceCents),
      updatedAt: listing.updatedAt.toISOString()
    })),
    offers: offers.map((offer) => ({
      id: offer.id,
      domain: offer.listing.domain,
      buyerEmail: offer.buyer.email,
      amount: centsToDollars(offer.amountCents),
      status: offer.status.toLowerCase(),
      updatedAt: offer.updatedAt.toISOString()
    })),
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      domain: transaction.listing.domain,
      buyerEmail: transaction.buyer.email,
      escrowId: transaction.escrowId,
      amount: centsToDollars(transaction.amountCents),
      status: transaction.status.toLowerCase(),
      updatedAt: transaction.updatedAt.toISOString()
    })),
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      actorEmail: event.actor?.email,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      createdAt: event.createdAt.toISOString()
    }))
  }, filters);
}


export async function getAdminEntityDetail(entity: string, identifier: string): Promise<AdminEntityDetail | null> {
  if (!isDatabaseConfigured()) {
    if (entity === "listings") {
      const listing = await getMarketplaceListing(identifier);
      return listing
        ? {
            entity,
            id: listing.id,
            title: listing.domain,
            subtitle: `${listing.status} · ${formatAdminMoney(listing.price)}`,
            sections: [
              {
                title: "Listing",
                rows: adminRows({
                  domain: listing.domain,
                  tld: listing.tld,
                  status: listing.status,
                  price: formatAdminMoney(listing.price),
                  minimumOffer: formatAdminMoney(listing.minimumOffer),
                  category: listing.category,
                  ownershipVerified: listing.ownershipVerified
                })
              },
              {
                title: "AI appraisal",
                rows: adminRows({
                  confidence: `${listing.appraisal.confidence}%`,
                  lowEstimate: formatAdminMoney(listing.appraisal.lowEstimate),
                  highEstimate: formatAdminMoney(listing.appraisal.highEstimate),
                  modelVersion: listing.appraisal.modelVersion
                })
              }
            ]
          }
        : null;
    }

    return null;
  }

  const prisma = getPrisma();
  if (entity === "users") {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: identifier }, { email: identifier.toLowerCase() }]
      },
      include: {
        sellerProfile: true,
        _count: {
          select: {
            listings: true,
            buyerOffers: true,
            buyerTransactions: true,
            supportCases: true,
            watchlists: true,
            searchAlerts: true
          }
        }
      }
    });

    return user
      ? {
          entity,
          id: user.id,
          title: user.email,
          subtitle: `${user.role.toLowerCase()} · ${mapVerificationFromPrisma(user.verificationTier)}`,
          sections: [
            {
              title: "Account",
              rows: adminRows({
                email: user.email,
                displayName: user.displayName,
                role: user.role.toLowerCase(),
                verificationTier: mapVerificationFromPrisma(user.verificationTier),
                twoFactorEnabled: user.twoFactorEnabled,
                clerkUserId: user.clerkUserId,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
              })
            },
            {
              title: "Activity",
              rows: adminRows({
                listings: user._count.listings,
                offers: user._count.buyerOffers,
                transactions: user._count.buyerTransactions,
                supportCases: user._count.supportCases,
                watchlists: user._count.watchlists,
                searchAlerts: user._count.searchAlerts
              })
            },
            ...(user.sellerProfile
              ? [
                  {
                    title: "Seller profile",
                    rows: adminRows({
                      publicName: user.sellerProfile.publicName,
                      slug: user.sellerProfile.slug,
                      payoutPreference: user.sellerProfile.payoutPreference,
                      supportStatus: user.sellerProfile.supportStatus.toLowerCase(),
                      commissionDiscountBps: user.sellerProfile.commissionDiscountBps
                    })
                  }
                ]
              : [])
          ]
        }
      : null;
  }

  if (entity === "listings") {
    const listing = await getPrismaListingByIdOrDomain(identifier);
    return listing
      ? {
          entity,
          id: listing.id,
          title: listing.domain,
          subtitle: `${listing.status.toLowerCase()} · ${formatAdminMoney(centsToDollars(listing.priceCents))}`,
          sections: [
            {
              title: "Listing",
              rows: adminRows({
                domain: listing.domain,
                tld: listing.tld,
                status: listing.status.toLowerCase(),
                listingType: listing.listingType.toLowerCase(),
                registrar: listing.registrar,
                category: listing.category,
                price: formatAdminMoney(centsToDollars(listing.priceCents)),
                minimumOffer: formatAdminMoney(centsToDollars(listing.minimumOfferCents ?? listing.priceCents)),
                trafficMonthly: listing.trafficMonthly,
                domainAgeYears: listing.domainAgeYears,
                landingPageSlug: listing.landingPageSlug,
                createdAt: listing.createdAt,
                updatedAt: listing.updatedAt
              })
            },
            {
              title: "Seller",
              rows: adminRows({
                sellerId: listing.seller.id,
                sellerEmail: listing.seller.email,
                publicName: listing.seller.sellerProfile?.publicName ?? listing.seller.displayName,
                twoFactorEnabled: listing.seller.twoFactorEnabled
              })
            },
            {
              title: "Ownership and AI",
              rows: adminRows({
                ownershipVerification: listing.ownershipVerification,
                brandSignals: listing.brandSignals,
                appraisalConfidence: listing.appraisal?.confidence,
                appraisalRange: listing.appraisal
                  ? `${formatAdminMoney(centsToDollars(listing.appraisal.lowEstimateCents))} - ${formatAdminMoney(centsToDollars(listing.appraisal.highEstimateCents))}`
                  : null,
                modelVersion: listing.appraisal?.modelVersion
              })
            }
          ]
        }
      : null;
  }

  if (entity === "offers") {
    const offer = await getPrismaOfferById(identifier);
    return offer
      ? {
          entity,
          id: offer.id,
          title: `${offer.listing.domain} offer`,
          subtitle: `${offer.status.toLowerCase()} · ${formatAdminMoney(centsToDollars(offer.amountCents))}`,
          sections: [
            {
              title: "Offer",
              rows: adminRows({
                id: offer.id,
                status: offer.status.toLowerCase(),
                amount: formatAdminMoney(centsToDollars(offer.amountCents)),
                buyerVerificationTier: mapVerificationFromPrisma(offer.buyerVerificationTier),
                expiresAt: offer.expiresAt,
                createdAt: offer.createdAt,
                updatedAt: offer.updatedAt
              })
            },
            {
              title: "Parties",
              rows: adminRows({
                listingId: offer.listingId,
                domain: offer.listing.domain,
                buyerEmail: offer.buyer.email,
                seller: offer.listing.seller.sellerProfile?.publicName ?? offer.listing.seller.email
              })
            },
            {
              title: "Negotiation history",
              rows: adminRows({ negotiationHistory: offer.negotiationHistory })
            }
          ]
        }
      : null;
  }

  if (entity === "transactions") {
    const transaction = await prisma.transaction.findFirst({
      where: { OR: [{ id: identifier }, { escrowId: identifier }] },
      include: transactionInclude()
    });
    return transaction
      ? {
          entity,
          id: transaction.id,
          title: `${transaction.listing.domain} transaction`,
          subtitle: `${transaction.status.toLowerCase()} · ${formatAdminMoney(centsToDollars(transaction.amountCents))}`,
          sections: [
            {
              title: "Transaction",
              rows: adminRows({
                id: transaction.id,
                status: transaction.status.toLowerCase(),
                amount: formatAdminMoney(centsToDollars(transaction.amountCents)),
                commission: formatAdminMoney(centsToDollars(transaction.commissionCents)),
                payoutState: transaction.payoutState,
                escrowProvider: transaction.escrowProvider,
                escrowId: transaction.escrowId,
                escrowUrl: transaction.escrowUrl,
                createdAt: transaction.createdAt,
                updatedAt: transaction.updatedAt
              })
            },
            {
              title: "Parties",
              rows: adminRows({
                listingId: transaction.listingId,
                domain: transaction.listing.domain,
                buyerEmail: transaction.buyer.email,
                sellerId: transaction.sellerId,
                offerId: transaction.offerId
              })
            },
            {
              title: "Timeline",
              rows: adminRows({
                statusTimeline: transaction.statusTimeline,
                transferChecklist: transaction.transferChecklist
              })
            }
          ],
          primaryHref: `/transactions/${transaction.id}`
        }
      : null;
  }

  if (entity === "support") {
    const supportCase = await prisma.supportCase.findUnique({
      where: { id: identifier },
      include: { requester: true }
    });
    return supportCase
      ? {
          entity,
          id: supportCase.id,
          title: supportCase.subject,
          subtitle: `${supportCase.status.toLowerCase()} · ${supportCase.requester.email}`,
          sections: [
            {
              title: "Support case",
              rows: adminRows({
                id: supportCase.id,
                subject: supportCase.subject,
                status: supportCase.status.toLowerCase(),
                requesterEmail: supportCase.requester.email,
                transactionId: supportCase.transactionId,
                escalationNotes: supportCase.escalationNotes,
                createdAt: supportCase.createdAt,
                updatedAt: supportCase.updatedAt
              })
            },
            {
              title: "AI drafts",
              rows: adminRows({ aiDraftResponses: supportCase.aiDraftResponses })
            }
          ]
        }
      : null;
  }

  if (entity === "audit") {
    const event = await prisma.auditEvent.findUnique({
      where: { id: identifier },
      include: { actor: true }
    });
    return event
      ? {
          entity,
          id: event.id,
          title: event.eventType,
          subtitle: `${event.entityType} · ${event.actor?.email ?? "system"}`,
          sections: [
            {
              title: "Audit event",
              rows: adminRows({
                id: event.id,
                eventType: event.eventType,
                entityType: event.entityType,
                entityId: event.entityId,
                actorEmail: event.actor?.email,
                createdAt: event.createdAt
              })
            },
            {
              title: "Metadata",
              rows: adminRows({ metadata: event.metadata })
            }
          ]
        }
      : null;
  }

  return null;
}


export async function recordAdminReview(input: {
  actorEmail?: string;
  queueItemId: string;
  action: "approve" | "reject" | "request_evidence" | "escalate";
  note: string;
}) {
  const review = {
    ...input,
    status: input.action === "approve" || input.action === "reject" ? "resolved" : "reviewing",
    auditEvent: {
      eventType: `admin.review.${input.action}`,
      entityType: "admin_queue_item",
      entityId: input.queueItemId,
      metadata: { note: input.note }
    }
  };

  if (isDatabaseConfigured()) {
    const actor = input.actorEmail ? await ensureUser(input.actorEmail, "ADMIN") : null;
    await getPrisma().auditEvent.create({
      data: {
        actorId: actor?.id,
        ...review.auditEvent
      }
    });
  }

  return review;
}


export async function runModerationScan(input: { actorEmail?: string } = {}) {
  const listings = await listMarketplaceListings();
  const flags = listings.flatMap(scanListingRisk);

  if (isDatabaseConfigured()) {
    const actor = input.actorEmail ? await ensureUser(input.actorEmail, "ADMIN") : null;
    const prisma = getPrisma();
    for (const flag of flags) {
      await prisma.auditEvent.create({
        data: {
          actorId: actor?.id,
          eventType: "moderation.flag.created",
          entityType: "admin_queue_item",
          entityId: flag.id,
          metadata: flag as unknown as Prisma.InputJsonValue
        }
      });
    }
  }

  return {
    scannedListings: listings.length,
    flags
  };
}


export async function adminUpdateListingStatus(input: {
  listingId: string;
  status: "active" | "flagged" | "archived";
  actorEmail?: string;
  note?: string;
}) {
  if (!isDatabaseConfigured()) {
    return {
      action: "listing_status",
      listingId: input.listingId,
      status: input.status,
      note: input.note,
      mode: "local"
    };
  }

  const prisma = getPrisma();
  const listing = await getPrismaListingByIdOrDomain(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  assertListingTransition(
    listing.status.toLowerCase() as Parameters<typeof assertListingTransition>[0],
    input.status
  );
  const updated = await prisma.domainListing.update({
    where: { id: listing.id },
    data: {
      status: mapListingStatusToPrisma(input.status)
    },
    include: listingInclude()
  });

  await createAdminAudit({
    actorEmail: input.actorEmail,
    eventType: "admin.listing.status.updated",
    entityType: "domain_listing",
    entityId: listing.id,
    metadata: {
      domain: listing.domain,
      from: listing.status.toLowerCase(),
      to: input.status,
      note: input.note
    }
  });

  return {
    action: "listing_status",
    listing: mapListing(updated),
    mode: "database"
  };
}

// First-class admin seeding flow for the report's "seed 50-100 domains" mandate:
// bulk-create + auto-appraise (via processPortfolioImport) -> ownership-attest ->
// activate, in one call. House inventory is owned by the operator, so ownership is
// admin-attested (recorded in the activation audit note) rather than DNS-challenged;
// the attestation method is captured so a real verifyOwnershipChallenge can be
// swapped in for third-party consignment later.


export async function seedInventoryBatch(
  csv: string,
  options: {
    sellerEmail?: string;
    actorEmail?: string;
    autoActivate?: boolean;
    ownershipMethod?: "dns_txt" | "nameserver" | "registrar" | "manual";
  } = {}
) {
  const ownershipMethod = options.ownershipMethod ?? "manual";
  const importResult = await processPortfolioImport(csv, {
    sellerEmail: options.sellerEmail,
    actorEmail: options.actorEmail
  });

  const autoActivate = options.autoActivate ?? true;
  const activated: Array<{ listingId: string; domain: string }> = [];
  const activationFailures: Array<{ listingId?: string; domain: string; reason: string }> = [];

  if (autoActivate) {
    for (const item of importResult.accepted) {
      if (!item.listingId) {
        activationFailures.push({ domain: item.domain, reason: "missing_listing_id" });
        continue;
      }
      try {
        await adminUpdateListingStatus({
          listingId: item.listingId,
          status: "active",
          actorEmail: options.actorEmail ?? options.sellerEmail,
          note: `Seeded house inventory; ownership ${ownershipMethod}-attested by admin.`
        });
        activated.push({ listingId: item.listingId, domain: item.domain });
      } catch (error) {
        activationFailures.push({
          listingId: item.listingId,
          domain: item.domain,
          reason: error instanceof Error ? error.message : "activation_failed"
        });
      }
    }
  }

  return {
    summary: {
      ...importResult.summary,
      activated: activated.length,
      activationFailures: activationFailures.length,
      ownershipMethod
    },
    accepted: importResult.accepted,
    activated,
    review: importResult.review,
    activationFailures
  };
}


export async function adminVerifySeller(input: {
  sellerEmail: string;
  verificationTier: VerificationTier;
  twoFactorEnabled?: boolean;
  actorEmail?: string;
  note?: string;
}) {
  const twoFactorEnabled = input.twoFactorEnabled ?? input.verificationTier !== "email";

  if (!isDatabaseConfigured()) {
    return {
      action: "seller_verification",
      sellerEmail: input.sellerEmail.toLowerCase(),
      verificationTier: input.verificationTier,
      twoFactorEnabled,
      note: input.note,
      mode: "local"
    };
  }

  const prisma = getPrisma();
  const seller = await ensureUser(input.sellerEmail, "SELLER", input.verificationTier);
  const updatedSeller = await prisma.user.update({
    where: { id: seller.id },
    data: {
      role: "SELLER",
      verificationTier: mapVerificationToPrisma(input.verificationTier),
      twoFactorEnabled
    }
  });

  await prisma.sellerProfile.upsert({
    where: { userId: updatedSeller.id },
    update: {
      supportStatus: "OPEN"
    },
    create: {
      userId: updatedSeller.id,
      publicName: updatedSeller.displayName ?? updatedSeller.email.split("@")[0],
      slug: `${(updatedSeller.displayName ?? updatedSeller.email.split("@")[0]).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${updatedSeller.id.slice(-6)}`,
      supportStatus: "OPEN"
    }
  });

  await createAdminAudit({
    actorEmail: input.actorEmail,
    eventType: "admin.seller.verified",
    entityType: "user",
    entityId: updatedSeller.id,
    metadata: {
      sellerEmail: updatedSeller.email,
      verificationTier: input.verificationTier,
      twoFactorEnabled,
      note: input.note
    }
  });

  return {
    action: "seller_verification",
    seller: {
      id: updatedSeller.id,
      email: updatedSeller.email,
      role: updatedSeller.role.toLowerCase(),
      verificationTier: mapVerificationFromPrisma(updatedSeller.verificationTier),
      twoFactorEnabled: updatedSeller.twoFactorEnabled
    },
    mode: "database"
  };
}


export async function adminCancelOffer(input: { offerId: string; actorEmail?: string; note: string }) {
  if (!isDatabaseConfigured()) {
    return {
      action: "offer_cancel",
      offerId: input.offerId,
      status: "canceled",
      note: input.note,
      mode: "local"
    };
  }

  const existing = await getPrismaOfferById(input.offerId);
  if (!existing) {
    throw new Error("Offer not found.");
  }

  const history = appendJsonArray(existing.negotiationHistory, {
    actor: "admin",
    message: input.note,
    at: new Date().toISOString()
  });
  const updated = await getPrisma().offer.update({
    where: { id: existing.id },
    data: {
      status: PrismaOfferStatus.CANCELED,
      negotiationHistory: history as unknown as Prisma.InputJsonValue
    },
    include: offerInclude()
  });

  await createAdminAudit({
    actorEmail: input.actorEmail,
    eventType: "admin.offer.canceled",
    entityType: "offer",
    entityId: existing.id,
    metadata: {
      listingId: existing.listingId,
      buyerEmail: existing.buyer.email,
      note: input.note
    }
  });

  return {
    action: "offer_cancel",
    offer: mapOffer(updated),
    mode: "database"
  };
}


export async function adminUpdateSupportCase(input: {
  caseId: string;
  status: SupportCaseItem["status"];
  escalationNotes?: string;
  actorEmail?: string;
}) {
  if (!isDatabaseConfigured()) {
    return {
      action: "support_update",
      caseId: input.caseId,
      status: input.status,
      escalationNotes: input.escalationNotes,
      mode: "local"
    };
  }

  const prisma = getPrisma();
  const existing = await prisma.supportCase.findUnique({ where: { id: input.caseId } });
  if (!existing) {
    throw new Error("Support case not found.");
  }

  const updated = await prisma.supportCase.update({
    where: { id: existing.id },
    data: {
      status: mapSupportStatusToPrisma(input.status),
      escalationNotes: input.escalationNotes ?? existing.escalationNotes
    },
    include: { requester: true }
  });

  await createAdminAudit({
    actorEmail: input.actorEmail,
    eventType: "admin.support.updated",
    entityType: "support_case",
    entityId: existing.id,
    metadata: {
      from: existing.status.toLowerCase(),
      to: input.status,
      escalationNotes: input.escalationNotes
    }
  });

  return {
    action: "support_update",
    supportCase: mapSupportCase(updated),
    mode: "database"
  };
}


export async function adminAddTransactionDisputeNote(input: {
  transactionId: string;
  actorEmail?: string;
  note: string;
}) {
  if (!isDatabaseConfigured()) {
    return {
      action: "transaction_dispute",
      transactionId: input.transactionId,
      status: "disputed",
      note: input.note,
      mode: "local"
    };
  }

  const prisma = getPrisma();
  const existing = await prisma.transaction.findFirst({
    where: {
      OR: [{ id: input.transactionId }, { escrowId: input.transactionId }]
    }
  });
  if (!existing) {
    throw new Error("Transaction not found.");
  }

  const timeline = appendJsonArray(existing.statusTimeline, {
    status: "disputed",
    label: input.note,
    at: new Date().toISOString()
  });
  const updated = await prisma.transaction.update({
    where: { id: existing.id },
    data: {
      status: PrismaTransactionStatus.DISPUTED,
      statusTimeline: timeline as unknown as Prisma.InputJsonValue
    },
    include: transactionInclude()
  });

  await createAdminAudit({
    actorEmail: input.actorEmail,
    eventType: "admin.transaction.dispute_note",
    entityType: "transaction",
    entityId: existing.id,
    metadata: {
      escrowId: existing.escrowId,
      note: input.note
    }
  });

  return {
    action: "transaction_dispute",
    transaction: mapTransaction(updated),
    mode: "database"
  };
}

