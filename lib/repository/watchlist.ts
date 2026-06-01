import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import type { WatchlistItem } from "@/lib/types";
import { localWatchlistItems } from "@/lib/repository/internal/local-store";
import { ensureUser } from "@/lib/repository/internal/prisma";
import { getMarketplaceListing } from "@/lib/repository/marketplace";

export async function createWatchlistItem(input: {
  userEmail: string;
  listingId: string;
}): Promise<WatchlistItem> {
  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  const createdAt = new Date().toISOString();
  if (!isDatabaseConfigured()) {
    const existing = localWatchlistItems.find(
      (item) => item.userEmail.toLowerCase() === input.userEmail.toLowerCase() && item.listingId === listing.id
    );
    if (existing) {
      return existing;
    }

    const item = {
      id: `watch_${Date.now()}`,
      userEmail: input.userEmail.toLowerCase(),
      listingId: listing.id,
      domain: listing.domain,
      createdAt
    };
    localWatchlistItems.unshift(item);
    return { ...item };
  }

  const user = await ensureUser(input.userEmail, "BUYER");
  const row = await getPrisma().watchlist.upsert({
    where: {
      userId_listingId: {
        userId: user.id,
        listingId: listing.id
      }
    },
    update: {},
    create: {
      userId: user.id,
      listingId: listing.id
    },
    include: {
      user: true,
      listing: true
    }
  });

  return {
    id: row.id,
    userEmail: row.user.email,
    listingId: row.listingId,
    domain: row.listing.domain,
    createdAt: row.createdAt.toISOString()
  };
}


export async function listWatchlistItems(input: { userEmail: string }): Promise<WatchlistItem[]> {
  if (!isDatabaseConfigured()) {
    return localWatchlistItems
      .filter((item) => item.userEmail.toLowerCase() === input.userEmail.toLowerCase())
      .map((item) => ({ ...item }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const rows = await getPrisma().watchlist.findMany({
    where: {
      user: {
        email: input.userEmail.toLowerCase()
      }
    },
    include: {
      user: true,
      listing: true
    },
    orderBy: { createdAt: "desc" }
  });

  return rows.map((row) => ({
    id: row.id,
    userEmail: row.user.email,
    listingId: row.listingId,
    domain: row.listing.domain,
    createdAt: row.createdAt.toISOString()
  }));
}


export async function deleteWatchlistItem(input: { id: string; userEmail: string }) {
  if (!isDatabaseConfigured()) {
    const index = localWatchlistItems.findIndex(
      (item) => item.id === input.id && item.userEmail.toLowerCase() === input.userEmail.toLowerCase()
    );
    if (index >= 0) {
      localWatchlistItems.splice(index, 1);
    }

    return {
      action: "watchlist_delete",
      id: input.id,
      deleted: index >= 0,
      mode: "local"
    };
  }

  const row = await getPrisma().watchlist.findFirst({
    where: {
      id: input.id,
      user: {
        email: input.userEmail.toLowerCase()
      }
    }
  });

  if (!row) {
    throw new Error("Watchlist item not found.");
  }

  await getPrisma().watchlist.delete({ where: { id: row.id } });
  return {
    action: "watchlist_delete",
    id: row.id,
    deleted: true,
    mode: "database"
  };
}

