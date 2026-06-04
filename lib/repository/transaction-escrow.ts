import { Prisma, TransactionStatus as PrismaTransactionStatus } from "@prisma/client";
import { addDays } from "date-fns";
import { EscrowApiError, type EscrowHandoff, createEscrowHandoff, fetchEscrowTransaction } from "@/lib/escrow";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { calculateCommission } from "@/lib/transactions";
import type { Transaction } from "@/lib/types";
import { transactionInclude } from "@/lib/repository/internal/includes";
import { getSellerEmailForListing, localTransactions } from "@/lib/repository/internal/local-store";
import { mapEscrowStatus, mapListing, mapTransaction } from "@/lib/repository/internal/mappers";
import { ensureUser } from "@/lib/repository/internal/prisma";
import { centsToDollars, dollarsToCents } from "@/lib/repository/internal/utils";
import { getMarketplaceListing } from "@/lib/repository/marketplace";

export async function createTransactionRecord(input: {
  listingId: string;
  buyerEmail: string;
  offerId?: string;
  amount?: number;
}) {
  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  const amount = input.amount ?? listing.price;
  const commission = calculateCommission(amount);
  const sellerEmail = await getSellerEmailForListing(listing);
  let handoff: EscrowHandoff | null = null;
  let handoffError: Error | null = null;
  try {
    handoff = await createEscrowHandoff({
      listing,
      buyerEmail: input.buyerEmail,
      sellerEmail,
      amount
    });
  } catch (error) {
    handoffError = error instanceof Error ? error : new Error("Escrow.com handoff failed.");
    if (isDatabaseConfigured()) {
      const metadata: Record<string, unknown> = {
        listingId: listing.id,
        buyerEmail: input.buyerEmail,
        amount,
        message: handoffError.message
      };

      if (error instanceof EscrowApiError) {
        metadata.status = error.status;
        metadata.details = error.details;
      }

      await getPrisma().auditEvent.create({
        data: {
          eventType: "escrow.handoff.failed",
          entityType: "domain_listing",
          entityId: listing.id,
          metadata: metadata as Prisma.InputJsonValue
        }
      });
    }

    if (!isDatabaseConfigured()) {
      throw handoffError;
    }
  }

  const now = new Date().toISOString();
  const transaction: Transaction = {
    id: `txn_${Date.now()}`,
    listingId: listing.id,
    offerId: input.offerId,
    buyerEmail: input.buyerEmail,
    sellerId: listing.seller.id,
    escrowProvider: "escrow.com",
    escrowId: handoff?.escrowId,
    escrowUrl: handoff?.escrowUrl,
    amount,
    commission,
    status: handoff ? "escrow_started" : "initiated",
    statusTimeline: [
      { status: "initiated", label: "GetThe created the transaction record.", at: now },
      handoff
        ? {
            status: "escrow_started" as const,
            label: handoff.mode === "api" ? "Escrow.com API transaction created." : "Buyer is handed off to Escrow.com.",
            at: now
          }
        : {
            status: "initiated" as const,
            label: `Escrow.com handoff failed and needs admin recovery: ${handoffError?.message ?? "unknown error"}`,
            at: now
          }
    ],
    transferChecklist: [
      {
        label: "Buyer funds Escrow.com transaction",
        done: false,
        owner: "buyer",
        dueAt: addDays(new Date(), 2).toISOString()
      },
      {
        label: "Seller unlocks domain and obtains transfer code",
        done: false,
        owner: "seller",
        dueAt: addDays(new Date(), 4).toISOString()
      },
      {
        label: "Buyer confirms registrar transfer",
        done: false,
        owner: "buyer",
        dueAt: addDays(new Date(), 7).toISOString()
      },
      {
        label: "GetThe records transfer verification",
        done: false,
        owner: "admin",
        dueAt: addDays(new Date(), 8).toISOString()
      },
      {
        label: "Escrow.com releases seller payout",
        done: false,
        owner: "escrow",
        dueAt: addDays(new Date(), 10).toISOString()
      }
    ]
  };

  if (!isDatabaseConfigured()) {
    localTransactions.unshift({
      transaction,
      listing,
      sellerEmail,
      createdAt: now,
      updatedAt: now
    });
    return transaction;
  }

  const prisma = getPrisma();
  const buyer = await ensureUser(input.buyerEmail, "BUYER");
  const row = await prisma.transaction.create({
    data: {
      listingId: listing.id,
      offerId: input.offerId,
      buyerId: buyer.id,
      sellerId: listing.seller.id,
      escrowProvider: "escrow.com",
      escrowId: handoff?.escrowId,
      escrowUrl: handoff?.escrowUrl,
      amountCents: dollarsToCents(amount),
      commissionCents: dollarsToCents(commission),
      status: handoff ? "ESCROW_STARTED" : "INITIATED",
      statusTimeline: transaction.statusTimeline,
      transferChecklist: transaction.transferChecklist,
      payoutState: "pending"
    },
    include: transactionInclude()
  });

  return mapTransaction(row);
}

export async function updateTransactionFromEscrowEvent(event: {
  id?: string;
  transaction_id?: string;
  status?: string;
  [key: string]: unknown;
}) {
  const escrowId = String(event.transaction_id ?? event.id ?? "unknown");
  const mappedStatus = mapEscrowStatus(event.status);
  const timelineEntry = {
    status: mappedStatus,
    label: `Escrow.com reported ${event.status ?? "status update"}.`,
    at: new Date().toISOString()
  };
  const auditEvent = {
    eventType: "escrow.webhook.received",
    entityType: "transaction",
    entityId: escrowId,
    metadata: event
  };

  if (!isDatabaseConfigured()) {
    return {
      received: true,
      mappedStatus,
      auditEvent,
      updated: false,
      mode: "local"
    };
  }

  const prisma = getPrisma();
  const existing = await prisma.transaction.findFirst({
    where: {
      OR: [{ id: escrowId }, { escrowId }]
    }
  });

  await prisma.auditEvent.create({
    data: {
      ...auditEvent,
      metadata: auditEvent.metadata as Prisma.InputJsonValue
    }
  });

  if (!existing) {
    return {
      received: true,
      mappedStatus,
      auditEvent,
      updated: false,
      mode: "database"
    };
  }

  const currentTimeline = Array.isArray(existing.statusTimeline) ? existing.statusTimeline : [];
  const updated = await prisma.transaction.update({
    where: { id: existing.id },
    data: {
      status: mappedStatus.toUpperCase() as PrismaTransactionStatus,
      statusTimeline: [...currentTimeline, timelineEntry] as unknown as Prisma.InputJsonValue,
      payoutState: mappedStatus === "payout_complete" ? "complete" : existing.payoutState
    },
    include: transactionInclude()
  });

  return {
    received: true,
    mappedStatus,
    auditEvent,
    updated: true,
    transaction: mapTransaction(updated)
  };
}

export async function syncTransactionEscrowStatus(input: { transactionId: string; actorEmail?: string }) {
  if (!isDatabaseConfigured()) {
    return {
      synced: false,
      mode: "local",
      reason: "DATABASE_URL is not configured."
    };
  }

  const prisma = getPrisma();
  const transaction = await prisma.transaction.findFirst({
    where: {
      OR: [{ id: input.transactionId }, { escrowId: input.transactionId }]
    }
  });

  if (!transaction) {
    throw new Error("Transaction not found.");
  }

  const providerPayload = await fetchEscrowTransaction(transaction.escrowId ?? transaction.id);
  const result = await updateTransactionFromEscrowEvent({
    ...(providerPayload as Record<string, unknown>),
    id: transaction.escrowId ?? transaction.id,
    transaction_id: transaction.escrowId ?? transaction.id
  });
  const actor = input.actorEmail ? await ensureUser(input.actorEmail, "ADMIN") : null;

  await prisma.auditEvent.create({
    data: {
      actorId: actor?.id,
      eventType: "escrow.status.synced",
      entityType: "transaction",
      entityId: transaction.id,
      metadata: {
        transactionId: transaction.id,
        escrowId: transaction.escrowId,
        providerPayload
      } as Prisma.InputJsonValue
    }
  });

  return {
    synced: true,
    result
  };
}

export async function retryTransactionEscrowHandoff(input: { transactionId: string; actorEmail?: string; note?: string }) {
  if (!isDatabaseConfigured()) {
    return {
      action: "transaction_handoff_retry",
      transactionId: input.transactionId,
      recovered: true,
      mode: "local"
    };
  }

  const prisma = getPrisma();
  const transaction = await prisma.transaction.findFirst({
    where: {
      OR: [{ id: input.transactionId }, { escrowId: input.transactionId }]
    },
    include: transactionInclude()
  });

  if (!transaction) {
    throw new Error("Transaction not found.");
  }

  const listing = mapListing(transaction.listing);
  const amount = centsToDollars(transaction.amountCents);
  const handoff = await createEscrowHandoff({
    listing,
    buyerEmail: transaction.buyer.email,
    sellerEmail: `${listing.seller.slug}@seller.getthe.com`,
    amount
  });
  const timeline = Array.isArray(transaction.statusTimeline)
    ? (transaction.statusTimeline as Transaction["statusTimeline"])
    : [];
  const now = new Date().toISOString();
  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      escrowId: handoff.escrowId,
      escrowUrl: handoff.escrowUrl,
      status: "ESCROW_STARTED",
      statusTimeline: [
        ...timeline,
        {
          status: "escrow_started",
          label: handoff.mode === "api"
            ? "Admin recreated Escrow.com API transaction."
            : "Admin recreated Escrow.com handoff link.",
          at: now
        }
      ] as Prisma.InputJsonValue,
      updatedAt: new Date()
    },
    include: transactionInclude()
  });
  const actor = input.actorEmail ? await ensureUser(input.actorEmail, "ADMIN") : null;

  await prisma.auditEvent.create({
    data: {
      actorId: actor?.id,
      eventType: "escrow.handoff.retried",
      entityType: "transaction",
      entityId: transaction.id,
      metadata: {
        oldEscrowId: transaction.escrowId,
        newEscrowId: handoff.escrowId,
        note: input.note,
        retriedAt: now
      } as Prisma.InputJsonValue
    }
  });

  return {
    action: "transaction_handoff_retry",
    recovered: true,
    transaction: mapTransaction(updated),
    mode: "database"
  };
}
