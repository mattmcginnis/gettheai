import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/app/robots";
import { listMarketplaceListings } from "@/lib/repository";

type ChangeFrequency = MetadataRoute.Sitemap[number]["changeFrequency"];

// Static marketing/entry routes that should always be indexed.
const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: ChangeFrequency }> = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/domains", priority: 0.9, changeFrequency: "hourly" },
  { path: "/appraise", priority: 0.8, changeFrequency: "weekly" },
  { path: "/sellers", priority: 0.5, changeFrequency: "weekly" },
  { path: "/legal", priority: 0.2, changeFrequency: "monthly" }
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority
  }));

  // Per-listing pages are the cold-start SEO surface: one indexable page per
  // ACTIVE domain. `listMarketplaceListings()` is DB-aware (live inventory in
  // production, seed catalog locally) and already returns only active listings,
  // so the sitemap reflects whatever is actually for sale.
  let activeListings: Awaited<ReturnType<typeof listMarketplaceListings>> = [];
  try {
    const all = await listMarketplaceListings();
    activeListings = all.filter((listing) => listing.status === "active");
  } catch {
    // A sitemap must never 500 the whole route; degrade to static entries only.
    activeListings = [];
  }

  const listingEntries: MetadataRoute.Sitemap = activeListings.flatMap((listing) => {
    const lastModified = listing.createdAt ? new Date(listing.createdAt) : now;
    return [
      {
        url: `${siteUrl}/domains/${encodeURIComponent(listing.domain)}`,
        lastModified,
        changeFrequency: "daily" as ChangeFrequency,
        priority: 0.7
      },
      {
        url: `${siteUrl}/park/${encodeURIComponent(listing.domain)}`,
        lastModified,
        changeFrequency: "weekly" as ChangeFrequency,
        priority: 0.4
      }
    ];
  });

  return [...staticEntries, ...listingEntries];
}
