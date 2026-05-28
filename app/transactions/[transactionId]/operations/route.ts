import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { sendMarketplaceNotification } from "@/lib/notifications";
import { updateTransactionOperations } from "@/lib/repository";

const schema = z.object({
  actorEmail: z.string().email().optional(),
  status: z
    .enum([
      "initiated",
      "escrow_started",
      "buyer_funded",
      "domain_transfer_started",
      "transfer_verified",
      "payout_complete",
      "closed",
      "canceled",
      "disputed"
    ])
    .optional(),
  checklistUpdates: z.array(z.object({ index: z.number().int().min(0), done: z.boolean() })).optional(),
  note: z.string().optional()
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  if (!(await hasRole(request, ["admin"]))) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  try {
    const { transactionId } = await params;
    const body = schema.parse(await request.json());
    const result = await updateTransactionOperations({ transactionId, ...body });
    const transaction = "transaction" in result ? result.transaction : null;

    if (transaction) {
      await sendMarketplaceNotification({
        to: transaction.buyerEmail,
        subject: "GetThe transaction updated",
        textBody: `Transaction ${transaction.id} is now ${transaction.status}.`,
        tag: "transaction-updated",
        entityType: "transaction",
        entityId: transaction.id,
        recipientRole: "buyer",
        metadata: {
          status: transaction.status,
          checklistUpdates: body.checklistUpdates ?? []
        }
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transaction operation failed." },
      { status: 400 }
    );
  }
}
