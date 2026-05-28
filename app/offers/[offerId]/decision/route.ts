import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { sendMarketplaceNotification } from "@/lib/notifications";
import { decideOffer, getOfferNotificationContext } from "@/lib/repository";

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
    const context = await getOfferNotificationContext(offerId);
    const result = await decideOffer({ offerId, ...body });
    const offer = "offer" in result ? result.offer : null;
    const status = offer?.status ?? ("status" in result ? result.status : body.action);
    const buyerEmail = offer?.buyerEmail ?? context?.buyerEmail;
    const domain = context?.domain ?? offer?.listingId ?? "the listing";
    const sellerEmail = context?.sellerEmail;

    if (buyerEmail) {
      await sendMarketplaceNotification({
        to: buyerEmail,
        subject: `GetThe offer ${status}`,
        textBody: `Your offer for ${domain} is now ${status}. Seller note: ${body.note}`,
        tag: `offer-${status}`,
        entityType: "offer",
        entityId: offer?.id ?? offerId,
        recipientRole: "buyer",
        metadata: {
          action: body.action,
          amount: offer?.amount ?? result.amount,
          transactionId: result.transaction?.id
        }
      });
    }

    if (sellerEmail) {
      await sendMarketplaceNotification({
        to: sellerEmail,
        subject: `Seller action recorded for ${domain}`,
        textBody: `Your ${body.action} decision for ${domain} was recorded. Note: ${body.note}`,
        tag: `seller-offer-${body.action}`,
        entityType: "offer",
        entityId: offer?.id ?? offerId,
        recipientRole: "seller",
        metadata: {
          action: body.action,
          amount: offer?.amount ?? result.amount,
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
