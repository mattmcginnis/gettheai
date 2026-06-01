import { isValidDomain } from "@/lib/appraisal";
import { parsePortfolioCsv } from "@/lib/imports";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import type { DomainListing } from "@/lib/types";
import { ensureUser } from "@/lib/repository/internal/prisma";
import { createListingDraft } from "@/lib/repository/listings";

export async function processPortfolioImport(csv: string, options: { sellerEmail?: string; actorEmail?: string } = {}) {
  const rows = parsePortfolioCsv(csv);
  const sellerEmail = (options.sellerEmail ?? "seller@getthe.com").toLowerCase();
  const acceptedCandidates = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.domain && isValidDomain(row.domain) && (row.price ?? 0) >= 500);
  const needsReview = rows
    .map((row, index) => ({ row, index }))
    .filter(({ index }) => !acceptedCandidates.some((candidate) => candidate.index === index))
    .map(({ row }) => ({
      ...row,
      reason: !row.domain || !isValidDomain(row.domain) ? "invalid_domain" : "below_mid_tier_floor_or_missing_price"
    }));
  const createdByIndex = new Map<number, DomainListing>();
  const creationFailures: Array<Record<string, unknown>> = [];

  for (const { row, index } of acceptedCandidates) {
    try {
      const listing = await createListingDraft({
        domain: row.domain,
        price: row.price ?? 500,
        minimumOffer: row.minimumOffer,
        registrar: row.registrar,
        category: row.category ?? "Imported",
        sellerEmail
      });
      createdByIndex.set(index, listing);
    } catch (error) {
      creationFailures.push({
        ...row,
        reason: error instanceof Error && /unique|duplicate/i.test(error.message) ? "duplicate_domain" : "create_failed",
        detail: error instanceof Error ? error.message : "Listing creation failed."
      });
    }
  }

  if (isDatabaseConfigured()) {
    const seller = await ensureUser(sellerEmail, "SELLER");
    const prisma = getPrisma();
    await prisma.sellerProfile.update({
      where: { userId: seller.id },
      data: {
        importedPortfolioMeta: {
          lastImportedAt: new Date().toISOString(),
          source: "csv",
          totalRows: rows.length,
          accepted: createdByIndex.size,
          needsReview: needsReview.length + creationFailures.length
        }
      }
    });
    await prisma.auditEvent.create({
      data: {
        actorId: seller.id,
        eventType: "portfolio.import.processed",
        entityType: "seller_profile",
        entityId: seller.id,
        metadata: {
          sellerEmail,
          totalRows: rows.length,
          accepted: createdByIndex.size,
          needsReview: needsReview.length + creationFailures.length,
          actorEmail: options.actorEmail ?? sellerEmail
        }
      }
    });
  }

  const accepted = acceptedCandidates
    .filter(({ index }) => createdByIndex.has(index))
    .map(({ row, index }) => ({
      ...row,
      listingId: createdByIndex.get(index)?.id,
      sellerEmail,
      status: "pending_verification",
      ownershipVerification: "dns_txt"
    }));

  return {
    summary: {
      total: rows.length,
      accepted: accepted.length,
      needsReview: needsReview.length + creationFailures.length
    },
    accepted,
    review: [...needsReview, ...creationFailures]
  };
}

