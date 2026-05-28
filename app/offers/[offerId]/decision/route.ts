import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { sendMarketplaceNotification } from "@/lib/notifications";
import { decideOffer } from "@/lib/repository";

const schema = z.object({
  action: z.enum(["accept", "reject", "counter"]),
  amount: z.number().positive().optional(),
  note: z.string().min(3)
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  if (!(await hasRole(request, ["seller", "admin"]))) {
    return NextResponse.json({ error: "Seller or admin role required." }, { status: 403 });
  }

  try {
    const { offerId } = await params;
    const body = schema.parse(await request.json());
    const result = await decideOffer({ offerId, ...body });
    const offer = "offer" in result ? result.offer : null;

    if (offer?.buyerEmail) {
      await sendMarketplaceNotification({
        to: offer.buyerEmail,
        subject: `GetThe offer ${offer.status.replaceAll("_", " ")}`,
        textBody: `Your offer for listing ${offer.listingId} is now ${offer.status}. Seller note: ${body.note}`,
        tag: `offer-${offer.status}`,
        entityType: "offer",
        entityId: offer.id,
        recipientRole: "buyer",
        metadata: {
          action: body.action,
          amount: offer.amount,
          transactionId: result.transaction?.id
        }
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid offer decision request." },
      { status: 400 }
    );
  }
}
