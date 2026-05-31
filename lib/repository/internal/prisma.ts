import { Prisma } from "@prisma/client";
import { normalizeDomain } from "@/lib/appraisal";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import type { VerificationTier } from "@/lib/types";
import { listingInclude, offerInclude } from "./includes";
import { mapVerificationToPrisma } from "./mappers";

export async function getPrismaListingByIdOrDomain(identifier: string) {
  const prisma = getPrisma();
  return prisma.domainListing.findFirst({
    where: {
      OR: [{ id: identifier }, { domain: normalizeDomain(identifier) }]
    },
    include: listingInclude()
  });
}

export async function getPrismaOfferById(offerId: string) {
  return getPrisma().offer.findUnique({
    where: { id: offerId },
    include: offerInclude()
  });
}

export async function ensureUser(
  email: string,
  role: "BUYER" | "SELLER" | "ADMIN",
  verificationTier: VerificationTier = role === "BUYER" ? "email" : "two_factor"
) {
  const prisma = getPrisma();
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: {
      role,
      verificationTier: mapVerificationToPrisma(verificationTier),
      twoFactorEnabled: verificationTier !== "email"
    },
    create: {
      clerkUserId: `local:${email.toLowerCase()}`,
      email: email.toLowerCase(),
      displayName: email.split("@")[0],
      role,
      verificationTier: mapVerificationToPrisma(verificationTier),
      twoFactorEnabled: verificationTier !== "email"
    }
  });

  if (role === "SELLER") {
    await prisma.sellerProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        publicName: user.displayName ?? "GetThe Seller",
        slug: (user.displayName ?? "getthe-seller").toLowerCase().replace(/[^a-z0-9]+/g, "-")
      }
    });
  }

  return user;
}

export async function createAdminAudit(input: {
  actorEmail?: string;
  eventType: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
}) {
  if (!isDatabaseConfigured()) {
    return;
  }

  const actor = input.actorEmail ? await ensureUser(input.actorEmail, "ADMIN") : null;
  await getPrisma().auditEvent.create({
    data: {
      actorId: actor?.id,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata as Prisma.InputJsonValue
    }
  });
}
