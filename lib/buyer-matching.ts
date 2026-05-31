import { isDatabaseConfigured, getPrisma } from "@/lib/prisma";
import { getMarketplaceListing } from "@/lib/repository";
import { filterAndSortListings } from "@/lib/search";
import type { DomainFilters, DomainListing, SearchAlertItem } from "@/lib/types";

// ---------------------------------------------------------------------------
// Buyer matching (the report's named differentiator, v1)
//
// For a given listing, rank the buyers most likely to want it using signals we
// already collect — saved-search alerts and watchlists — plus keyword/category
// overlap. The ranked output feeds the approval-gated AI outreach draft so the
// solo founder can prospect without manual list-building.
//
// The scoring core (`rankBuyersForListing`) is pure and fully unit-testable;
// `collectBuyerMatches` is the thin DB wrapper that gathers the live signals.
// ---------------------------------------------------------------------------

export interface AlertSignal {
  buyerEmail: string;
  filters: DomainFilters;
  cadence: SearchAlertItem["cadence"];
}

export interface WatchSignal {
  buyerEmail: string;
  listingId: string;
  category: string;
  tld: string;
  domain: string;
}

export interface BuyerSignals {
  alerts: AlertSignal[];
  watches: WatchSignal[];
}

export interface BuyerMatch {
  buyerEmail: string;
  score: number;
  reasons: string[];
}

// Scoring weights. Tuned so an explicit saved-search match or watching the exact
// domain dominates softer keyword/category affinity, but several soft signals
// can still surface a strong prospect.
const SCORE = {
  watchingTarget: 12,
  alertMatchBase: 6,
  cadence: { instant: 3, daily: 2, weekly: 1 } as Record<SearchAlertItem["cadence"], number>,
  sameCategory: 3,
  sameTld: 1,
  keywordOverlapPerToken: 2,
  keywordOverlapCap: 6
} as const;

/**
 * True if a single listing would be returned by the given saved-search filters.
 * Reuses the marketplace filter engine so alert semantics stay identical to the
 * live search experience (only ACTIVE listings can match).
 */
export function listingMatchesFilters(listing: DomainListing, filters: DomainFilters): boolean {
  return filterAndSortListings([listing], filters).length > 0;
}

function tokenize(values: Array<string | undefined>): Set<string> {
  const tokens = new Set<string>();
  for (const value of values) {
    if (!value) {
      continue;
    }
    for (const part of value.toLowerCase().split(/[^a-z0-9]+/)) {
      if (part.length >= 3) {
        tokens.add(part);
      }
    }
  }
  return tokens;
}

function domainLabel(domain: string): string {
  return domain.split(".")[0] ?? domain;
}

function listingTokens(listing: DomainListing): Set<string> {
  return tokenize([
    domainLabel(listing.domain),
    listing.category,
    ...(listing.brandSignals ?? []),
    ...(listing.appraisal?.keywordSignals ?? [])
  ]);
}

function countSharedTokens(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) {
      shared += 1;
    }
  }
  return shared;
}

/**
 * Pure ranking core. Aggregates every signal per buyer into a single score with
 * human-readable reasons, sorted strongest-first (stable by email on ties).
 */
export function rankBuyersForListing(listing: DomainListing, signals: BuyerSignals): BuyerMatch[] {
  const byBuyer = new Map<string, BuyerMatch>();
  const targetTokens = listingTokens(listing);

  const ensure = (rawEmail: string): BuyerMatch => {
    const buyerEmail = rawEmail.toLowerCase();
    let match = byBuyer.get(buyerEmail);
    if (!match) {
      match = { buyerEmail, score: 0, reasons: [] };
      byBuyer.set(buyerEmail, match);
    }
    return match;
  };

  for (const alert of signals.alerts) {
    if (!alert.buyerEmail || !listingMatchesFilters(listing, alert.filters)) {
      continue;
    }
    const match = ensure(alert.buyerEmail);
    match.score += SCORE.alertMatchBase + (SCORE.cadence[alert.cadence] ?? 0);
    match.reasons.push(`Saved-search match (${alert.cadence} alert)`);
  }

  for (const watch of signals.watches) {
    if (!watch.buyerEmail) {
      continue;
    }
    const match = ensure(watch.buyerEmail);

    if (watch.listingId === listing.id) {
      match.score += SCORE.watchingTarget;
      match.reasons.push("Watching this domain");
      continue;
    }

    // Affinity from a *different* domain the buyer watches.
    if (watch.category && watch.category === listing.category) {
      match.score += SCORE.sameCategory;
      match.reasons.push(`Watches ${watch.category} domains`);
    }
    if (watch.tld && watch.tld === listing.tld) {
      match.score += SCORE.sameTld;
      match.reasons.push(`Watches .${watch.tld} domains`);
    }
    const shared = countSharedTokens(targetTokens, tokenize([domainLabel(watch.domain)]));
    if (shared > 0) {
      match.score += Math.min(shared * SCORE.keywordOverlapPerToken, SCORE.keywordOverlapCap);
      match.reasons.push(`Keyword overlap with ${watch.domain}`);
    }
  }

  return [...byBuyer.values()]
    .filter((match) => match.score > 0)
    .map((match) => ({ ...match, reasons: dedupe(match.reasons) }))
    .sort((a, b) => b.score - a.score || a.buyerEmail.localeCompare(b.buyerEmail));
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * DB-backed collector: gathers live saved-search and watchlist signals and
 * ranks buyers for the listing. Returns [] in DB-absent local mode (there is no
 * cross-buyer signal store outside the database) and excludes the seller's own
 * account from the results.
 */
export async function collectBuyerMatches(
  listingId: string,
  options: { limit?: number } = {}
): Promise<BuyerMatch[]> {
  const listing = await getMarketplaceListing(listingId);
  if (!listing) {
    return [];
  }

  if (!isDatabaseConfigured()) {
    return [];
  }

  const prisma = getPrisma();
  const [alertRows, watchRows] = await Promise.all([
    prisma.searchAlert.findMany({
      where: { active: true },
      include: { user: true }
    }),
    prisma.watchlist.findMany({
      include: { user: true, listing: true }
    })
  ]);

  const alerts: AlertSignal[] = alertRows.map((row) => ({
    buyerEmail: row.user.email,
    filters: (row.filters as DomainFilters) ?? {},
    cadence: (row.cadence as SearchAlertItem["cadence"]) ?? "weekly"
  }));

  const watches: WatchSignal[] = watchRows.map((row) => ({
    buyerEmail: row.user.email,
    listingId: row.listingId,
    category: row.listing.category,
    tld: row.listing.tld,
    domain: row.listing.domain
  }));

  const ranked = rankBuyersForListing(listing, { alerts, watches });
  return typeof options.limit === "number" ? ranked.slice(0, options.limit) : ranked;
}
