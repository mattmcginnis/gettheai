import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendTransactionalEmail } from "@/lib/email";
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
    await sendTransactionalEmail({
      to: body.buyerEmail,
      subject: "GetThe Escrow.com handoff started",
      textBody: `Your transaction for listing ${body.listingId} is ready: ${transaction.escrowUrl}`,
      tag: "transaction-started"
    }).catch(() => null);

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid transaction request." },
      { status: 400 }
    );
  }
}
