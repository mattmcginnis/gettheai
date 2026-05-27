import { NextRequest, NextResponse } from "next/server";
import { verifyEscrowWebhookSignature } from "@/lib/escrow";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-escrow-signature");

  if (!verifyEscrowWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid Escrow.com webhook signature." }, { status: 401 });
  }

  const event = JSON.parse(rawBody || "{}");

  return NextResponse.json({
    received: true,
    mappedStatus: mapEscrowStatus(event.status),
    auditEvent: {
      eventType: "escrow.webhook.received",
      entityType: "transaction",
      entityId: event.transaction_id ?? event.id ?? "unknown",
      metadata: event
    }
  });
}

function mapEscrowStatus(status: string | undefined) {
  const normalized = status?.toLowerCase();
  if (normalized?.includes("fund")) return "buyer_funded";
  if (normalized?.includes("release") || normalized?.includes("complete")) return "payout_complete";
  if (normalized?.includes("dispute")) return "disputed";
  return "escrow_started";
}
