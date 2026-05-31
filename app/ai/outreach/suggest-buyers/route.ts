import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { collectBuyerMatches } from "@/lib/buyer-matching";
import { recordAnalyticsEvent } from "@/lib/repository";

const schema = z.object({
  listingId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(25).optional()
});

// Rank the buyers most likely to want a listing (saved-search + watchlist
// signals) so a seller/admin knows whom to draft approval-gated outreach to.
export async function POST(request: NextRequest) {
  if (!(await hasRole(request, ["seller", "admin"]))) {
    return NextResponse.json({ error: "Seller or admin role required." }, { status: 403 });
  }

  try {
    const input = schema.parse(await request.json());
    const matches = await collectBuyerMatches(input.listingId, { limit: input.limit ?? 10 });

    await recordAnalyticsEvent({
      eventType: "analytics.ai.buyers_suggested",
      entityType: "domain_listing",
      entityId: input.listingId,
      metadata: { count: matches.length }
    });

    return NextResponse.json({ ok: true, listingId: input.listingId, matches });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Buyer suggestion failed." },
      { status: 400 }
    );
  }
}
