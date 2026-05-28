import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendMarketplaceNotification } from "@/lib/notifications";
import { createTransactionRecord } from "@/lib/repository";

const schema = z.object({
  listingId: z.string(),
  buyerEmail: z.string().email(),
  offerId: z.string().optional(),
  amount: z.number().positive().optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const transaction = await createTransactionRecord(body);
    await sendMarketplaceNotification({
      to: body.buyerEmail,
      subject: transaction.escrowUrl ? "GetThe Escrow.com handoff started" : "GetThe transaction needs handoff recovery",
      textBody: transaction.escrowUrl
        ? `Your transaction for listing ${body.listingId} is ready: ${transaction.escrowUrl}`
        : `Your transaction for listing ${body.listingId} was created and is awaiting Escrow.com handoff recovery.`,
      tag: "transaction-started",
      entityType: "transaction",
      entityId: transaction.id,
      recipientRole: "buyer",
      metadata: {
        listingId: body.listingId,
        escrowId: transaction.escrowId,
        amount: transaction.amount
      }
    });

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid transaction request." },
      { status: 400 }
    );
  }
}
