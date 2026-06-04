import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAuthContext } from "@/lib/auth";
import { createListingDraft } from "@/lib/repository";

const schema = z.object({
  domain: z.string(),
  price: z.number().positive(),
  minimumOffer: z.number().positive().optional(),
  registrar: z.string().optional(),
  category: z.string().default("General"),
  sellerId: z.string().default("seller-local"),
  listingType: z.enum(["buy_now", "make_offer", "buy_now_and_offer", "auction"]).optional(),
  auction: z
    .object({
      endsAt: z.string(),
      reservePrice: z.number().positive().optional(),
      bidIncrement: z.number().positive()
    })
    .optional()
});

export async function POST(request: NextRequest) {
  const session = await getRequestAuthContext(request);
  if (!session || (session.role !== "seller" && session.role !== "admin") || !session.twoFactorEnabled) {
    return NextResponse.json({ error: "Seller role and 2FA are required before creating listings." }, { status: 403 });
  }

  try {
    const body = schema.parse(await request.json());
    const listing = await createListingDraft({
      ...body,
      sellerEmail: session.email
    });

    return NextResponse.json(
      { listing },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid listing request." },
      { status: 400 }
    );
  }
}
