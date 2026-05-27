import { NextRequest, NextResponse } from "next/server";
import { listMarketplaceListings } from "@/lib/repository";
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
    sort: (params.get("sort") ?? "featured") as DomainFilters["sort"]
  };

  return NextResponse.json({
    results: await listMarketplaceListings(filters),
    filters
  });
}

function numberParam(value: string | null) {
  return value ? Number(value) : undefined;
}
