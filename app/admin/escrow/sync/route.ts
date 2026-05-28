import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { sendMarketplaceNotification } from "@/lib/notifications";
import { syncTransactionEscrowStatus } from "@/lib/repository";

const schema = z.object({
  transactionId: z.string().min(1),
  actorEmail: z.string().email().optional()
});

export async function POST(request: NextRequest) {
  if (!(await hasRole(request, ["admin"]))) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  try {
    const result = await syncTransactionEscrowStatus(schema.parse(await request.json()));
    const syncResult = "result" in result ? result.result : null;

    if (syncResult && "transaction" in syncResult && syncResult.transaction?.buyerEmail) {
      await sendMarketplaceNotification({
        to: syncResult.transaction.buyerEmail,
        subject: "GetThe Escrow.com status synced",
        textBody: `Escrow.com status was synced for transaction ${syncResult.transaction.id}: ${syncResult.transaction.status}.`,
        tag: "escrow-status-synced",
        entityType: "transaction",
        entityId: syncResult.transaction.id,
        recipientRole: "buyer",
        metadata: {
          escrowId: syncResult.transaction.escrowId,
          mappedStatus: syncResult.mappedStatus
        }
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Escrow status sync failed." },
      { status: 400 }
    );
  }
}
