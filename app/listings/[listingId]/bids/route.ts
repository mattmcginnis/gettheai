import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendMarketplaceNotification } from "@/lib/notifications";
import { getAuctionState, getListingNotificationContext, placeBid } from "@/lib/repository";

const schema = z.object({
  buyerEmail: z.string().email(),
  amount: z.number().positive(),
  buyerVerificationTier: z.enum(["email", "two_factor", "escrow_intent", "kyc_review"])
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  try {
    const { listingId } = await params;
    const body = schema.parse(await request.json());

    // Capture the current high bidder so we can notify them if they get outbid.
    const previous = await getAuctionState(listingId).catch(() => null);
    const previousHighBidder = previous?.highestBidderEmail ?? null;

    const { bid, auction } = await placeBid({ listingId, ...body });
    const listing = await getListingNotificationContext(listingId);
    const buyerEmail = body.buyerEmail.toLowerCase();
    const highBid = (auction.highestBid ?? body.amount).toLocaleString("en-US");

    await sendMarketplaceNotification({
      to: buyerEmail,
      subject: `Bid placed on ${listing.domain}`,
      textBody: `Your $${body.amount.toLocaleString("en-US")} bid on ${listing.domain} is in. Current high bid: $${highBid}.`,
      tag: "auction-bid-placed",
      entityType: "listing",
      entityId: listing.listingId,
      recipientRole: "buyer",
      metadata: { listingId: listing.listingId, amount: body.amount }
    });
    await sendMarketplaceNotification({
      to: listing.sellerEmail,
      subject: `New bid on ${listing.domain}`,
      textBody: `${buyerEmail} bid $${body.amount.toLocaleString("en-US")} on ${listing.domain}.`,
      tag: "auction-seller-bid",
      entityType: "listing",
      entityId: listing.listingId,
      recipientRole: "seller",
      metadata: { listingId: listing.listingId, amount: body.amount, buyerEmail }
    });

    if (previousHighBidder && previousHighBidder !== buyerEmail) {
      await sendMarketplaceNotification({
        to: previousHighBidder,
        subject: `You've been outbid on ${listing.domain}`,
        textBody: `A higher bid was placed on ${listing.domain}. Current high bid: $${highBid}.`,
        tag: "auction-outbid",
        entityType: "listing",
        entityId: listing.listingId,
        recipientRole: "buyer",
        metadata: { listingId: listing.listingId }
      });
    }

    return NextResponse.json({ bid, auction }, { status: 201 });
  } catch (error) {
    const status =
      typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode: number }).statusCode)
        : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid bid request." },
      { status }
    );
  }
}
