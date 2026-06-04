import { Prisma } from "@prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { assertTransactionTransition } from "@/lib/transactions";
import type { Transaction, TransactionStatus } from "@/lib/types";
import { transactionInclude } from "@/lib/repository/internal/includes";
import { localTransactions } from "@/lib/repository/internal/local-store";
import { mapTransaction, mapTransactionStatusToPrisma } from "@/lib/repository/internal/mappers";
import { createAdminAudit } from "@/lib/repository/internal/prisma";
import { appendJsonArray, mergeChecklistItem } from "@/lib/repository/internal/utils";

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
