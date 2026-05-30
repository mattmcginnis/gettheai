import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/app/robots";
import { listings } from "@/lib/seed";

type ChangeFrequency = MetadataRoute.Sitemap[number]["changeFrequency"];

// Static marketing/entry routes that should always be indexed.
const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: ChangeFrequency }> = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/domains", priority: 0.9, changeFrequency: "hourly" },
  { path: "/appraise", priority: 0.8, changeFrequency: "weekly" },
  { path: "/sellers", priority: 0.5, changeFrequency: "weekly" },
  { path: "/legal", priority: 0.2, changeFrequency: "monthly" }
];

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority
  }));

  // Per-listing pages are the cold-start SEO surface: one indexable page per
  // ACTIVE domain.
  //
  // NOTE: this enumerates the seed catalog, which is correct in local/preview
  // and any seed-backed deployment. In DB-backed production this should be
  // swapped to enumerate live inventory via the database search layer
  // (lib/postgres-search.ts). Tracked as a Phase 1 follow-up.
  const activeListings = listings.filter((listing) => listing.status === "active");
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
