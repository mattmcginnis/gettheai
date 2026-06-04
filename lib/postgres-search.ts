import { Prisma, type PrismaClient } from "@prisma/client";
import type { DomainFacets, DomainFilters, ListingType } from "@/lib/types";

export interface PostgresSearchOptions {
  page?: number;
  limit?: number;
}

export interface PostgresListingSearchResult {
  ids: string[];
  total: number;
  facets: DomainFacets;
}

const priceBands = [
  { value: "under_5k", label: "Under $5K" },
  { value: "5k_10k", label: "$5K-$10K" },
  { value: "10k_25k", label: "$10K-$25K" },
  { value: "25k_plus", label: "$25K+" }
];

export async function searchPostgresListingIds(prisma: PrismaClient, filters: DomainFilters = {}) {
  const result = await searchPostgresListings(prisma, filters);
  return result.ids;
}

export async function searchPostgresListings(
  prisma: PrismaClient,
  filters: DomainFilters = {},
  options: PostgresSearchOptions = {}
): Promise<PostgresListingSearchResult> {
  const conditions = buildConditions(filters);
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const limit = options.limit ? Math.max(1, Math.trunc(options.limit)) : null;
  const offset = limit ? (page - 1) * limit : 0;
  const limitSql = limit ? Prisma.sql`LIMIT ${limit} OFFSET ${offset}` : Prisma.empty;

  const [rows, totalRows, tldRows, categoryRows, listingTypeRows, priceBandRows] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT l."id"
      FROM "DomainListing" l
      LEFT JOIN "Appraisal" a ON a."listingId" = l."id"
      WHERE ${joinSql(conditions, Prisma.sql` AND `)}
      ORDER BY ${postgresSort(filters.sort)}
      ${limitSql}
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS count
      FROM "DomainListing" l
      LEFT JOIN "Appraisal" a ON a."listingId" = l."id"
      WHERE ${joinSql(conditions, Prisma.sql` AND `)}
    `),
    prisma.$queryRaw<Array<{ value: string; count: bigint }>>(Prisma.sql`
      SELECT l."tld" AS value, COUNT(*) AS count
      FROM "DomainListing" l
      LEFT JOIN "Appraisal" a ON a."listingId" = l."id"
      WHERE ${joinSql(conditions, Prisma.sql` AND `)}
      GROUP BY l."tld"
      ORDER BY count DESC, value ASC
    `),
    prisma.$queryRaw<Array<{ value: string; count: bigint }>>(Prisma.sql`
      SELECT l."category" AS value, COUNT(*) AS count
      FROM "DomainListing" l
      LEFT JOIN "Appraisal" a ON a."listingId" = l."id"
      WHERE ${joinSql(conditions, Prisma.sql` AND `)}
      GROUP BY l."category"
      ORDER BY count DESC, value ASC
    `),
    prisma.$queryRaw<Array<{ value: string; count: bigint }>>(Prisma.sql`
      SELECT LOWER(l."listingType"::text) AS value, COUNT(*) AS count
      FROM "DomainListing" l
      LEFT JOIN "Appraisal" a ON a."listingId" = l."id"
      WHERE ${joinSql(conditions, Prisma.sql` AND `)}
      GROUP BY l."listingType"
      ORDER BY count DESC, value ASC
    `),
    prisma.$queryRaw<Array<{ value: string; count: bigint }>>(Prisma.sql`
      SELECT
        CASE
          WHEN l."priceCents" < 500000 THEN 'under_5k'
          WHEN l."priceCents" < 1000000 THEN '5k_10k'
          WHEN l."priceCents" < 2500000 THEN '10k_25k'
          ELSE '25k_plus'
        END AS value,
        COUNT(*) AS count
      FROM "DomainListing" l
      LEFT JOIN "Appraisal" a ON a."listingId" = l."id"
      WHERE ${joinSql(conditions, Prisma.sql` AND `)}
      GROUP BY value
      ORDER BY MIN(l."priceCents") ASC
    `)
  ]);

  return {
    ids: rows.map((row) => row.id),
    total: Number(totalRows[0]?.count ?? 0),
    facets: {
      tlds: tldRows.map((row) => ({ value: row.value, label: `.${row.value}`, count: Number(row.count) })),
      categories: categoryRows.map((row) => ({ value: row.value, label: row.value, count: Number(row.count) })),
      listingTypes: listingTypeRows.map((row) => ({
        value: row.value,
        label: row.value.replaceAll("_", " "),
        count: Number(row.count)
      })),
      priceBands: priceBands.map((band) => {
        const count = priceBandRows.find((row) => row.value === band.value)?.count ?? 0;
        return { ...band, count: Number(count) };
      })
    }
  };
}

function buildConditions(filters: DomainFilters = {}) {
  const conditions: Prisma.Sql[] = [Prisma.sql`l."status" = 'ACTIVE'::"ListingStatus"`];
  const query = filters.q?.trim().toLowerCase();

  if (query) {
    const pattern = `%${escapePostgresLikePattern(query)}%`;
    conditions.push(Prisma.sql`(
      LOWER(l."domain" || ' ' || l."category" || ' ' || l."description" || ' ' || l."seoTitle" || ' ' || l."seoDescription" || ' ' || COALESCE(l."registrar", '')) LIKE ${pattern} ESCAPE '\'
      OR LOWER(COALESCE(a."domain", '') || ' ' || COALESCE(a."brandabilityNotes", '') || ' ' || COALESCE(a."generatedSummary", '')) LIKE ${pattern} ESCAPE '\'
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(l."brandSignals") = 'array' THEN l."brandSignals"
            ELSE '[]'::jsonb
          END
        ) AS signal(value)
        WHERE LOWER(signal.value) LIKE ${pattern} ESCAPE '\'
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(a."keywordSignals") = 'array' THEN a."keywordSignals"
            ELSE '[]'::jsonb
          END
        ) AS keyword(value)
        WHERE LOWER(keyword.value) LIKE ${pattern} ESCAPE '\'
      )
    )`);
  }

  if (filters.tld && filters.tld !== "any") {
    conditions.push(Prisma.sql`l."tld" = ${filters.tld.toLowerCase()}`);
  }

  if (filters.category && filters.category !== "any") {
    conditions.push(Prisma.sql`l."category" = ${filters.category}`);
  }

  if (isFiniteNumber(filters.minPrice)) {
    conditions.push(Prisma.sql`l."priceCents" >= ${dollarsToCents(filters.minPrice)}`);
  }

  if (isFiniteNumber(filters.maxPrice)) {
    conditions.push(Prisma.sql`l."priceCents" <= ${dollarsToCents(filters.maxPrice)}`);
  }

  if (isFiniteNumber(filters.maxLength)) {
    conditions.push(Prisma.sql`length(split_part(l."domain", '.', 1)) <= ${filters.maxLength}`);
  }

  if (isFiniteNumber(filters.minTraffic)) {
    conditions.push(Prisma.sql`l."trafficMonthly" >= ${filters.minTraffic}`);
  }

  if (isFiniteNumber(filters.minConfidence)) {
    conditions.push(Prisma.sql`COALESCE(a."confidence", 0) >= ${filters.minConfidence}`);
  }

  const listingType = toPrismaListingType(filters.listingType);
  if (listingType) {
    conditions.push(Prisma.sql`l."listingType" = ${listingType}::"ListingType"`);
  }
  return conditions;
}

export function escapePostgresLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function postgresSort(sort: DomainFilters["sort"]) {
  if (sort === "price_asc") {
    return Prisma.sql`l."priceCents" ASC, l."createdAt" DESC, l."id" ASC`;
  }

  if (sort === "price_desc") {
    return Prisma.sql`l."priceCents" DESC, l."createdAt" DESC, l."id" ASC`;
  }

  if (sort === "newest") {
    return Prisma.sql`l."createdAt" DESC, l."id" ASC`;
  }

  if (sort === "confidence") {
    return Prisma.sql`COALESCE(a."confidence", 0) DESC, l."trafficMonthly" DESC, l."createdAt" DESC, l."id" ASC`;
  }

  return Prisma.sql`(
    COALESCE(a."confidence", 0)::numeric
    + (l."trafficMonthly"::numeric / 20)
    + CASE
      WHEN l."status" = 'ACTIVE'::"ListingStatus" OR l."ownershipVerification" ? 'verifiedAt' THEN 10
      ELSE 0
    END
  ) DESC, l."createdAt" DESC, l."id" ASC`;
}

function joinSql(parts: Prisma.Sql[], separator: Prisma.Sql) {
  return parts.reduce((sql, part, index) => (index === 0 ? part : Prisma.sql`${sql}${separator}${part}`));
}

function toPrismaListingType(value: DomainFilters["listingType"]) {
  const types: Record<ListingType, "BUY_NOW" | "MAKE_OFFER" | "BUY_NOW_AND_OFFER" | "AUCTION"> = {
    buy_now: "BUY_NOW",
    make_offer: "MAKE_OFFER",
    buy_now_and_offer: "BUY_NOW_AND_OFFER",
    auction: "AUCTION"
  };

  return value && value !== "any" ? types[value] : null;
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function dollarsToCents(amount: number) {
  return Math.round(amount * 100);
}
