import { NextRequest, NextResponse } from "next/server";
import {
  verifyEscrowWebhookReplay,
  verifyEscrowWebhookSignature,
  verifyEscrowWebhookTimestamp
} from "@/lib/escrow";
import { sendMarketplaceNotification } from "@/lib/notifications";
import { updateTransactionFromEscrowEvent } from "@/lib/repository";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-escrow-signature");
  const timestamp = request.headers.get("x-escrow-timestamp");

  if (!verifyEscrowWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid Escrow.com webhook signature." }, { status: 401 });
  }

  if (!verifyEscrowWebhookTimestamp(timestamp)) {
    return NextResponse.json({ error: "Stale Escrow.com webhook rejected." }, { status: 401 });
  }

  if (!verifyEscrowWebhookReplay(signature)) {
    return NextResponse.json({ error: "Duplicate Escrow.com webhook rejected." }, { status: 409 });
  }

  const event = JSON.parse(rawBody || "{}");
  const result = await updateTransactionFromEscrowEvent(event);

  if ("transaction" in result && result.transaction?.buyerEmail) {
    await sendMarketplaceNotification({
      to: result.transaction.buyerEmail,
      subject: "GetThe Escrow.com status updated",
      textBody: `Escrow.com reported ${event.status ?? "a status update"} for transaction ${result.transaction.id}.`,
      tag: "escrow-status-updated",
      entityType: "transaction",
      entityId: result.transaction.id,
      recipientRole: "buyer",
      metadata: {
        escrowId: result.transaction.escrowId,
        mappedStatus: result.mappedStatus
      }
    });
  }

  return NextResponse.json(result);
}
