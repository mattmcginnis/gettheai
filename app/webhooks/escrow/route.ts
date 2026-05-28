import { NextRequest, NextResponse } from "next/server";
import {
  verifyEscrowWebhookReplay,
  verifyEscrowWebhookSignature,
  verifyEscrowWebhookTimestamp
} from "@/lib/escrow";
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
  return NextResponse.json(await updateTransactionFromEscrowEvent(event));
}
