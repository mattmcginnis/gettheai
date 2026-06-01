import { Prisma } from "@prisma/client";
import { type OwnershipVerificationMethod, verifyOwnershipChallenge } from "@/lib/ownership-verification";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { listingInclude } from "@/lib/repository/internal/includes";
import { localDraftListings } from "@/lib/repository/internal/local-store";
import { mapListing } from "@/lib/repository/internal/mappers";
import { getPrismaListingByIdOrDomain } from "@/lib/repository/internal/prisma";
import { getMarketplaceListing } from "@/lib/repository/marketplace";

export async function verifyListingOwnership(input: {
  listingId: string;
  method: OwnershipVerificationMethod;
  token?: string;
  actorEmail?: string;
  actorRole?: "seller" | "admin";
}) {
  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  if (!isDatabaseConfigured()) {
    const localDraft = localDraftListings.find((item) => item.id === input.listingId || item.domain === input.listingId);
    const verifiedAt = new Date().toISOString();

    if (localDraft) {
      localDraft.status = "active";
      localDraft.ownershipVerified = true;
      localDraft.ownershipVerification = {
        ...(localDraft.ownershipVerification ?? {
          method: input.method,
          record: `_getthe-verify.${localDraft.domain}`,
          value: input.token ?? "manual-review"
        }),
        method: input.method,
        verifiedAt,
        verifiedBy: input.actorEmail ?? "system"
      };
    }

    return {
      listing: {
        ...(localDraft ?? listing),
        status: "active",
        ownershipVerified: true
      },
      verification: {
        method: input.method,
        verifiedAt,
        mode: "local"
      }
    };
  }

  const prisma = getPrisma();
  const row = await getPrismaListingByIdOrDomain(input.listingId);
  if (!row) {
    throw new Error("Listing not found.");
  }

  const existingVerification = row.ownershipVerification as { record?: string; value?: string };
  const challenge = await verifyOwnershipChallenge({
    domain: row.domain,
    method: input.method,
    expectedRecord: existingVerification.record,
    expectedValue: existingVerification.value,
    token: input.token,
    actorRole: input.actorRole
  });
  const attemptedAt = new Date().toISOString();

  if (!challenge.verified) {
    await prisma.domainListing.update({
      where: { id: row.id },
      data: {
        ownershipVerification: {
          ...existingVerification,
          method: input.method,
          status: "failed",
          lastAttemptAt: attemptedAt,
          lastError: challenge.reason,
          evidence: challenge.evidence.slice(0, 10)
        } as Prisma.InputJsonValue
      }
    });

    await prisma.auditEvent.create({
      data: {
        eventType: "listing.ownership.verification_failed",
        entityType: "domain_listing",
        entityId: row.id,
        metadata: {
          method: input.method,
          reason: challenge.reason,
          record: challenge.record,
          attemptedAt
        } as Prisma.InputJsonValue
      }
    });

    throw new Error(challenge.reason ?? "Ownership verification failed.");
  }

  const verifiedAt = new Date().toISOString();
  const updated = await prisma.domainListing.update({
    where: { id: row.id },
    data: {
      status: "ACTIVE",
      ownershipVerification: {
        ...existingVerification,
        method: input.method,
        status: "verified",
        record: challenge.record ?? existingVerification.record,
        verifiedAt,
        verifiedBy: input.actorEmail ?? "system",
        evidence: challenge.evidence.slice(0, 10)
      } as Prisma.InputJsonValue
    },
    include: listingInclude()
  });

  await prisma.auditEvent.create({
    data: {
      eventType: "listing.ownership.verified",
      entityType: "domain_listing",
      entityId: row.id,
      metadata: {
        method: input.method,
        verifiedAt
      }
    }
  });

  return {
    listing: mapListing(updated),
    verification: {
      method: input.method,
      verifiedAt,
      mode: "database"
    }
  };
}

