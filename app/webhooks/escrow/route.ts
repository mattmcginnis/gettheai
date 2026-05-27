import { NextRequest, NextResponse } from "next/server";
import { verifyEscrowWebhookSignature } from "@/lib/escrow";
import { updateTransactionFromEscrowEvent } from "@/lib/repository";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-escrow-signature");

  if (!verifyEscrowWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid Escrow.com webhook signature." }, { status: 401 });
  }

  const event = JSON.parse(rawBody || "{}");
  return NextResponse.json(await updateTransactionFromEscrowEvent(event));
}
