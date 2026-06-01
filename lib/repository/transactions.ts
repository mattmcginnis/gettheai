import { Prisma, TransactionStatus as PrismaTransactionStatus } from "@prisma/client";
import { addDays } from "date-fns";
import { EscrowApiError, type EscrowHandoff, createEscrowHandoff, fetchEscrowTransaction } from "@/lib/escrow";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { assertTransactionTransition, calculateCommission } from "@/lib/transactions";
import type { Transaction, TransactionDashboardItem, TransactionStatus } from "@/lib/types";
import { transactionInclude } from "@/lib/repository/internal/includes";
import { getSellerEmailForListing, isLocalDefaultSellerEmail, localTransactions } from "@/lib/repository/internal/local-store";
import { mapEscrowStatus, mapListing, mapLocalTransactionDashboardItem, mapOffer, mapTransaction, mapTransactionDashboardItem, mapTransactionStatusToPrisma, mapVerificationFromPrisma } from "@/lib/repository/internal/mappers";
import { createAdminAudit, ensureUser } from "@/lib/repository/internal/prisma";
import { appendJsonArray, centsToDollars, dollarsToCents, mergeChecklistItem } from "@/lib/repository/internal/utils";
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


export async function getTransactionDetail(identifier: string) {
  if (!isDatabaseConfigured()) {
    return null;
  }

  const row = await getPrisma().transaction.findFirst({
    where: {
      OR: [{ id: identifier }, { escrowId: identifier }]
    },
    include: transactionInclude()
  });

  if (!row) {
    return null;
  }

  return {
    transaction: mapTransaction(row),
    listing: mapListing(row.listing),
    buyer: {
      id: row.buyer.id,
      email: row.buyer.email,
      verificationTier: mapVerificationFromPrisma(row.buyer.verificationTier),
      twoFactorEnabled: row.buyer.twoFactorEnabled
    },
    offer: row.offer ? mapOffer({ ...row.offer, buyer: row.buyer, listing: row.listing }) : null,
    payoutState: row.payoutState,
    updatedAt: row.updatedAt.toISOString()
  };
}


export async function listTransactionDashboard(input: {
  email: string;
  role: "buyer" | "seller" | "admin";
  party?: "all" | "buyer" | "seller";
  status?: TransactionStatus | "all";
  q?: string;
}): Promise<TransactionDashboardItem[]> {
  const party = input.party ?? "all";
  const status = input.status && input.status !== "all" ? input.status : undefined;
  const q = input.q?.trim().toLowerCase();

  if (!isDatabaseConfigured()) {
    const email = input.email.toLowerCase();
    return localTransactions
      .filter((record) => {
        if (input.role === "buyer" && record.transaction.buyerEmail.toLowerCase() !== email) return false;
        if (
          input.role === "seller" &&
          !isLocalDefaultSellerEmail(email) &&
          record.sellerEmail.toLowerCase() !== email
        ) {
          return false;
        }
        if (status && record.transaction.status !== status) return false;
        if (!q) return true;
        return [
          record.listing.domain,
          record.transaction.buyerEmail,
          record.sellerEmail,
          record.transaction.escrowId ?? ""
        ].some((value) => value.toLowerCase().includes(q));
      })
      .filter((record) => {
        if (input.role !== "admin" || party === "all" || !q) return true;
        return party === "buyer"
          ? record.transaction.buyerEmail.toLowerCase().includes(q)
          : record.sellerEmail.toLowerCase().includes(q);
      })
      .map((record) => mapLocalTransactionDashboardItem(record));
  }

  const where: Prisma.TransactionWhereInput = {};
  if (status) {
    where.status = mapTransactionStatusToPrisma(status);
  }

  if (input.role === "buyer") {
    where.buyer = { email: input.email.toLowerCase() };
  } else if (input.role === "seller") {
    where.listing = { seller: { email: input.email.toLowerCase() } };
  }

  if (q) {
    const qFilters =
      input.role === "admin" && party === "buyer"
        ? [{ buyer: { email: { contains: q, mode: "insensitive" as const } } }]
        : input.role === "admin" && party === "seller"
          ? [{ listing: { seller: { email: { contains: q, mode: "insensitive" as const } } } }]
          : [
              { listing: { domain: { contains: q, mode: "insensitive" as const } } },
              { buyer: { email: { contains: q, mode: "insensitive" as const } } },
              { escrowId: { contains: q, mode: "insensitive" as const } }
            ];
    where.AND = [{ OR: qFilters }];
  }

  const rows = await getPrisma().transaction.findMany({
    where,
    include: transactionInclude(),
    orderBy: { updatedAt: "desc" },
    take: 50
  });

  return rows.map(mapTransactionDashboardItem);
}


export async function updateTransactionOperations(input: {
  transactionId: string;
  actorEmail?: string;
  status?: TransactionStatus;
  checklistUpdates?: Array<{
    index: number;
    done?: boolean;
    owner?: NonNullable<Transaction["transferChecklist"][number]["owner"]>;
    dueAt?: string;
    note?: string;
  }>;
  note?: string;
}) {
  if (!isDatabaseConfigured()) {
    const record = localTransactions.find(
      (item) => item.transaction.id === input.transactionId || item.transaction.escrowId === input.transactionId
    );
    if (record) {
      if (input.status) {
        record.transaction.status = input.status;
        record.transaction.statusTimeline.push({
          status: input.status,
          label: input.note ?? `Admin updated transaction ${input.status}.`,
          at: new Date().toISOString()
        });
      }
      if (input.checklistUpdates?.length) {
        record.transaction.transferChecklist = record.transaction.transferChecklist.map((item, index) => {
          const update = input.checklistUpdates?.find((candidate) => candidate.index === index);
          return update ? mergeChecklistItem(item, update) : item;
        });
      }
      record.updatedAt = new Date().toISOString();
    }

    return {
      action: "transaction_operations",
      transaction: record?.transaction,
      transactionId: input.transactionId,
      status: input.status,
      checklistUpdates: input.checklistUpdates ?? [],
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

  const existingChecklist = Array.isArray(existing.transferChecklist) ? existing.transferChecklist : [];
  const transferChecklist = existingChecklist.map((item, index) => {
    const update = input.checklistUpdates?.find((candidate) => candidate.index === index);
    return update ? mergeChecklistItem(item as Transaction["transferChecklist"][number], update) : item;
  });
  if (input.status) {
    assertTransactionTransition(
      existing.status.toLowerCase() as Parameters<typeof assertTransactionTransition>[0],
      input.status
    );
  }
  const nextStatus = input.status ? mapTransactionStatusToPrisma(input.status) : existing.status;
  const shouldAppendTimeline = Boolean(input.status || input.note);
  const statusTimeline = shouldAppendTimeline
    ? appendJsonArray(existing.statusTimeline, {
        status: input.status ?? existing.status.toLowerCase(),
        label: input.note ?? `Admin updated transaction ${input.status ?? "operations"}.`,
        at: new Date().toISOString()
      })
    : existing.statusTimeline;

  const updated = await prisma.transaction.update({
    where: { id: existing.id },
    data: {
      status: nextStatus,
      transferChecklist: transferChecklist as unknown as Prisma.InputJsonValue,
      statusTimeline: statusTimeline as unknown as Prisma.InputJsonValue
    },
    include: transactionInclude()
  });

  await createAdminAudit({
    actorEmail: input.actorEmail,
    eventType: "admin.transaction.operations_updated",
    entityType: "transaction",
    entityId: existing.id,
    metadata: {
      status: input.status,
      checklistUpdates: input.checklistUpdates ?? [],
      note: input.note
    }
  });

  return {
    action: "transaction_operations",
    transaction: mapTransaction(updated),
    mode: "database"
  };
}

