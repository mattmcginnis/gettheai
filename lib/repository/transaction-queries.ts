import { Prisma } from "@prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import type { TransactionDashboardItem, TransactionStatus } from "@/lib/types";
import { transactionInclude } from "@/lib/repository/internal/includes";
import { isLocalDefaultSellerEmail, localTransactions } from "@/lib/repository/internal/local-store";
import {
  mapListing,
  mapLocalTransactionDashboardItem,
  mapOffer,
  mapTransaction,
  mapTransactionDashboardItem,
  mapTransactionStatusToPrisma,
  mapVerificationFromPrisma
} from "@/lib/repository/internal/mappers";

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
