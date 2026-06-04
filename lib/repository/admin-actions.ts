import { OfferStatus as PrismaOfferStatus, Prisma, TransactionStatus as PrismaTransactionStatus } from "@prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import type { SupportCaseItem, VerificationTier } from "@/lib/types";
import { offerInclude, transactionInclude } from "@/lib/repository/internal/includes";
import { mapOffer, mapSupportCase, mapSupportStatusToPrisma, mapTransaction, mapVerificationFromPrisma, mapVerificationToPrisma } from "@/lib/repository/internal/mappers";
import { createAdminAudit, ensureUser, getPrismaOfferById } from "@/lib/repository/internal/prisma";
import { appendJsonArray } from "@/lib/repository/internal/utils";

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
