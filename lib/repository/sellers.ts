import { ListingStatus as PrismaListingStatus, TransactionStatus as PrismaTransactionStatus } from "@prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import type { SellerProfilePage } from "@/lib/types";
import { listingInclude } from "@/lib/repository/internal/includes";
import { getLocalListings } from "@/lib/repository/internal/local-store";
import { buildSellerProfilePage, mapListing } from "@/lib/repository/internal/mappers";

export async function getSellerProfilePage(slug: string): Promise<SellerProfilePage | null> {
  const normalizedSlug = slug.toLowerCase();

  if (!isDatabaseConfigured()) {
    const listings = getLocalListings()
      .filter((listing) => listing.seller.slug === normalizedSlug)
      .filter((listing) => listing.status !== "archived" && listing.status !== "sold");
    const seller = listings[0]?.seller;

    return seller ? buildSellerProfilePage(seller, listings) : null;
  }

  const prisma = getPrisma();
  const profile = await prisma.sellerProfile.findUnique({
    where: { slug: normalizedSlug },
    include: { user: true }
  });

  if (!profile) {
    return null;
  }

  const [rows, completedTransactions] = await Promise.all([
    prisma.domainListing.findMany({
      where: {
        sellerId: profile.userId,
        status: {
          notIn: [PrismaListingStatus.ARCHIVED, PrismaListingStatus.SOLD]
        }
      },
      include: listingInclude(),
      orderBy: { updatedAt: "desc" },
      take: 48
    }),
    prisma.transaction.count({
      where: {
        sellerId: profile.userId,
        status: {
          in: [PrismaTransactionStatus.PAYOUT_COMPLETE, PrismaTransactionStatus.CLOSED]
        }
      }
    })
  ]);

  return buildSellerProfilePage(
    {
      id: profile.id,
      publicName: profile.publicName,
      slug: profile.slug,
      verified: profile.user.twoFactorEnabled,
      transactionCount: completedTransactions,
      avgResponseHours: 6
    },
    rows.map(mapListing)
  );
}

