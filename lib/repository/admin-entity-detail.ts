import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { type AdminEntityDetail, adminRows, formatAdminMoney } from "@/lib/repository/internal/admin";
import { transactionInclude } from "@/lib/repository/internal/includes";
import { mapVerificationFromPrisma } from "@/lib/repository/internal/mappers";
import { getPrismaListingByIdOrDomain, getPrismaOfferById } from "@/lib/repository/internal/prisma";
import { centsToDollars } from "@/lib/repository/internal/utils";
import { getMarketplaceListing } from "@/lib/repository/marketplace";

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

