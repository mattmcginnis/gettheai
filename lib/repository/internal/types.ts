import type { DomainListing, Transaction } from "@/lib/types";

export type LocalDraftListing = DomainListing & {
  sellerEmail?: string;
  ownershipVerification?: {
    method: "dns_txt" | "nameserver" | "registrar" | "manual";
    record: string;
    value: string;
    verifiedAt?: string;
    verifiedBy?: string;
  };
};

export type LocalTransactionRecord = {
  transaction: Transaction;
  listing: DomainListing;
  sellerEmail: string;
  createdAt: string;
  updatedAt: string;
};
