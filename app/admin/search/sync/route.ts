import { NextRequest, NextResponse } from "next/server";
import { hasRole } from "@/lib/auth";
import { listMarketplaceListings } from "@/lib/repository";
import { indexListings } from "@/lib/search-index";

export async function POST(request: NextRequest) {
  if (!hasRole(request, ["admin"])) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  try {
    const listings = await listMarketplaceListings();
    return NextResponse.json({ result: await indexListings(listings) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search sync failed." },
      { status: 500 }
    );
  }
}
