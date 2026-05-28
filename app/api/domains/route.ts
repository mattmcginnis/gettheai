import { NextRequest, NextResponse } from "next/server";
import { recordAnalyticsEvent, searchMarketplaceListings } from "@/lib/repository";
import type { DomainFilters } from "@/lib/types";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const filters: DomainFilters = {
    q: params.get("q") ?? undefined,
    tld: params.get("tld") ?? undefined,
    category: params.get("category") ?? undefined,
    maxPrice: numberParam(params.get("maxPrice")),
    minPrice: numberParam(params.get("minPrice")),
    maxLength: numberParam(params.get("maxLength")),
    minTraffic: numberParam(params.get("minTraffic")),
    minConfidence: numberParam(params.get("minConfidence")),
    listingType: (params.get("listingType") ?? undefined) as DomainFilters["listingType"],
    sort: (params.get("sort") ?? "featured") as DomainFilters["sort"]
  };

  const search = await searchMarketplaceListings(filters, {
    page: numberParam(params.get("page")) ?? 1,
    limit: numberParam(params.get("limit")) ?? 12
  });

  await recordAnalyticsEvent({
    eventType: "analytics.search.performed",
    entityType: "domain_search",
    entityId: filters.q ?? "all",
    metadata: {
      filters,
      total: search.pagination.total
    }
  });

  return NextResponse.json(search);
}

function numberParam(value: string | null) {
  return value ? Number(value) : undefined;
}
