import { NextRequest, NextResponse } from "next/server";
import { hasRole } from "@/lib/auth";
import { calculateMarketplaceMetrics } from "@/lib/analytics";
import { listMarketplaceListings } from "@/lib/repository";

export async function GET(request: NextRequest) {
  if (!hasRole(request, ["admin"])) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  const listings = await listMarketplaceListings();
  return NextResponse.json({ metrics: calculateMarketplaceMetrics(listings) });
}
