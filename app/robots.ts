import type { MetadataRoute } from "next";

import { CANONICAL_DOMAIN } from "@/lib/constants";

// Canonical site origin. Defaults to the primary marketplace domain; override
// per-environment with NEXT_PUBLIC_SITE_URL (e.g. a staging/preview origin).
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return `https://${CANONICAL_DOMAIN}`;
}

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep crawlers out of authenticated, transactional, and internal
        // surfaces. Only public marketing/listing pages should be indexed.
        disallow: [
          "/account",
          "/admin",
          "/api",
          "/auth",
          "/buyer",
          "/imports",
          "/inquiries",
          "/intelligence",
          "/offers",
          "/seller",
          "/search-alerts",
          "/security",
          "/storage",
          "/support",
          "/transactions",
          "/watchlist",
          "/webhooks",
          "/sign-in",
          "/sign-up"
        ]
      }
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl
  };
}
