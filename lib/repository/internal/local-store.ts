import { isDatabaseConfigured } from "@/lib/prisma";
import { listings as seedListings } from "@/lib/seed";
import type {
  DomainListing,
  NotificationPreferences,
  OfferInboxItem,
  ParkedInquiry,
  SearchAlertItem,
  SellerProfile,
  WatchlistItem
} from "@/lib/types";
import { getPrismaListingByIdOrDomain } from "./prisma";
import type { LocalDraftListing, LocalTransactionRecord } from "./types";
import { slugify, titleize } from "./utils";

export const localDraftListings = ((globalThis as typeof globalThis & {
  __gettheLocalDraftListings?: LocalDraftListing[];
}).__gettheLocalDraftListings ??= []);

export const localListingStatusOverrides = ((globalThis as typeof globalThis & {
  __gettheLocalListingStatusOverrides?: Map<string, DomainListing["status"]>;
}).__gettheLocalListingStatusOverrides ??= new Map<string, DomainListing["status"]>());

export const localListingDetailOverrides = ((globalThis as typeof globalThis & {
  __gettheLocalListingDetailOverrides?: Map<string, Partial<DomainListing>>;
}).__gettheLocalListingDetailOverrides ??= new Map<string, Partial<DomainListing>>());

export const localOffers = ((globalThis as typeof globalThis & {
  __gettheLocalOffers?: OfferInboxItem[];
}).__gettheLocalOffers ??= []);

export const localTransactions = ((globalThis as typeof globalThis & {
  __gettheLocalTransactions?: LocalTransactionRecord[];
}).__gettheLocalTransactions ??= []);

export const localParkedInquiries = ((globalThis as typeof globalThis & {
  __gettheLocalParkedInquiries?: ParkedInquiry[];
}).__gettheLocalParkedInquiries ??= []);

export const localWatchlistItems = ((globalThis as typeof globalThis & {
  __gettheLocalWatchlistItems?: WatchlistItem[];
}).__gettheLocalWatchlistItems ??= []);

export const localSearchAlerts = ((globalThis as typeof globalThis & {
  __gettheLocalSearchAlerts?: SearchAlertItem[];
}).__gettheLocalSearchAlerts ??= []);

export const localNotificationPreferences = ((globalThis as typeof globalThis & {
  __gettheLocalNotificationPreferences?: Map<string, NotificationPreferences>;
}).__gettheLocalNotificationPreferences ??= new Map<string, NotificationPreferences>());

export function getLocalListings() {
  return [...seedListings.map(applyLocalListingOverride), ...localDraftListings.map(applyLocalListingOverride)].filter(
    (listing): listing is DomainListing => Boolean(listing)
  );
}

export function getLocalListingsForSeller(input: { email: string; role?: "seller" | "admin" | "buyer" }) {
  const listings = getLocalListings();
  if (input.role === "admin" || isLocalDefaultSellerEmail(input.email)) {
    return listings;
  }

  const email = input.email.toLowerCase();
  return listings.filter((listing) => localSellerEmail(listing).toLowerCase() === email);
}

export function applyLocalListingOverride(listing: DomainListing | null | undefined) {
  if (!listing) {
    return null;
  }

  const details = localListingDetailOverrides.get(listing.id) ?? {};
  const status = localListingStatusOverrides.get(listing.id);
  return {
    ...listing,
    ...details,
    status: status ?? details.status ?? listing.status
  };
}

export function localSellerEmail(listing: DomainListing) {
  const draftEmail = (listing as LocalDraftListing).sellerEmail;
  if (draftEmail) {
    return draftEmail;
  }

  const sellerEmails: Record<string, string> = {
    "seller-1": "northstar@getthe.com",
    "seller-2": "civic@getthe.com",
    "seller-3": "ai-holdings@getthe.com",
    "seller-local": "seller@getthe.com"
  };

  return sellerEmails[listing.seller.id] ?? `${listing.seller.slug}@seller.getthe.com`;
}

export async function getSellerEmailForListing(listing: DomainListing) {
  if (!isDatabaseConfigured()) {
    return localSellerEmail(listing);
  }

  const row = await getPrismaListingByIdOrDomain(listing.id);
  return row?.seller.email ?? `${listing.seller.slug}@seller.getthe.com`;
}

export function localSellerForEmail(email?: string): { email: string; profile: SellerProfile } {
  const normalized = (email ?? "seller@getthe.com").toLowerCase();
  if (isLocalDefaultSellerEmail(normalized)) {
    return {
      email: "seller@getthe.com",
      profile: {
        id: "seller-local",
        publicName: "GetThe Seller",
        slug: "getthe-seller",
        verified: true,
        transactionCount: 0,
        avgResponseHours: 6
      }
    };
  }

  const localPart = normalized.split("@")[0] ?? "seller";
  const slug = slugify(localPart || "seller");
  const publicName = titleize(localPart);

  return {
    email: normalized,
    profile: {
      id: `seller-${slug}`,
      publicName,
      slug,
      verified: true,
      transactionCount: 0,
      avgResponseHours: 6
    }
  };
}

export function isLocalDefaultSellerEmail(email: string) {
  return ["seller@getthe.com", "seller@getthe.local", "seller@example.com"].includes(email.toLowerCase());
}
