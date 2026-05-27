import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { createWatchlistItem } from "@/lib/repository";

const schema = z.object({
  userEmail: z.string().email(),
  listingId: z.string()
});

export async function POST(request: NextRequest) {
  if (!hasRole(request, ["buyer", "seller", "admin"])) {
    return NextResponse.json({ error: "Signed-in user required." }, { status: 403 });
  }

  try {
    return NextResponse.json({ watchlistItem: await createWatchlistItem(schema.parse(await request.json())) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Watchlist update failed." },
      { status: 400 }
    );
  }
}
