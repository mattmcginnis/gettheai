import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createOfferRecord } from "@/lib/repository";
import { sendMarketplaceNotification } from "@/lib/notifications";

const schema = z.object({
  listingId: z.string(),
  buyerEmail: z.string().email(),
  amount: z.number().positive(),
  buyerVerificationTier: z.enum(["email", "two_factor", "escrow_intent", "kyc_review"])
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const offer = await createOfferRecord(body);
    await sendMarketplaceNotification({
      to: body.buyerEmail,
      subject: "GetThe offer received",
      textBody: `Your offer for listing ${body.listingId} was recorded and is pending seller review.`,
      tag: "offer-created",
      entityType: "offer",
      entityId: offer.id,
      recipientRole: "buyer",
      metadata: {
        listingId: body.listingId,
        amount: body.amount
      }
    });

    return NextResponse.json(
      { offer },
      { status: 201 }
    );
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid offer request." },
      { status }
    );
  }
}
