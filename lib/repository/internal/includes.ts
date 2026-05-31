import { Prisma } from "@prisma/client";

export const domainListingInclude = {
  seller: {
    include: {
      sellerProfile: true
    }
  },
  appraisal: true
} satisfies Prisma.DomainListingInclude;

export const offerIncludeConfig = {
  buyer: true,
  listing: {
    include: domainListingInclude
  }
} satisfies Prisma.OfferInclude;

export const transactionIncludeConfig = {
  buyer: true,
  listing: {
    include: domainListingInclude
  },
  offer: true
} satisfies Prisma.TransactionInclude;

export type PrismaListing = Prisma.DomainListingGetPayload<{ include: typeof domainListingInclude }>;
export type PrismaOffer = Prisma.OfferGetPayload<{ include: typeof offerIncludeConfig }>;
export type PrismaTransaction = Prisma.TransactionGetPayload<{ include: typeof transactionIncludeConfig }>;

export function listingInclude() {
  return domainListingInclude;
}

export function offerInclude() {
  return offerIncludeConfig;
}

export function transactionInclude() {
  return transactionIncludeConfig;
}
