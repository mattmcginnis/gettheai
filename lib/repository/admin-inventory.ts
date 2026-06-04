import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { assertListingTransition } from "@/lib/transactions";
import { listingInclude } from "@/lib/repository/internal/includes";
import { mapListing, mapListingStatusToPrisma } from "@/lib/repository/internal/mappers";
import { createAdminAudit, getPrismaListingByIdOrDomain } from "@/lib/repository/internal/prisma";
import { processPortfolioImport } from "@/lib/repository/portfolio-import";

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
