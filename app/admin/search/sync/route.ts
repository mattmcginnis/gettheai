import { NextRequest, NextResponse } from "next/server";
import { hasRole } from "@/lib/auth";
import { listAllMarketplaceListingsForIndexing } from "@/lib/repository";
import { indexListings } from "@/lib/search-index";

export async function POST(request: NextRequest) {
  if (!(await hasRole(request, ["admin"]))) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  try {
    const listings = await listAllMarketplaceListingsForIndexing();
    return NextResponse.json({ result: await indexListings(listings) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search sync failed." },
      { status: 500 }
    );
  }
}
