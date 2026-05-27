import { createHmac } from "node:crypto";
import type { DomainListing } from "@/lib/types";

export interface EscrowHandoffInput {
  listing: DomainListing;
  buyerEmail: string;
  sellerEmail: string;
  amount: number;
}

export interface EscrowHandoff {
  escrowId: string;
  escrowUrl: string;
  provider: "escrow.com";
  mode: "api" | "handoff";
  providerResponse?: unknown;
}

export async function createEscrowHandoff(input: EscrowHandoffInput): Promise<EscrowHandoff> {
  if (canUseEscrowApi()) {
    return createEscrowApiTransaction(input);
  }

  const escrowId = `escrow_${input.listing.domain.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}`;

  return {
    escrowId,
    escrowUrl: buildEscrowHandoffUrl(escrowId, input.listing.domain, input.amount, input.buyerEmail),
    provider: "escrow.com",
    mode: "handoff"
  };
}

export function verifyEscrowWebhookSignature(rawBody: string, signature: string | null) {
  const secret = process.env.ESCROW_WEBHOOK_SECRET;

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  if (!signature) {
    return false;
  }

  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const normalized = signature.replace(/^sha256=/, "");
  return digest.length === normalized.length && digest === normalized;
}

function canUseEscrowApi() {
  return Boolean(
    process.env.ESCROW_API_BASE_URL &&
      process.env.ESCROW_API_EMAIL &&
      process.env.ESCROW_API_KEY &&
      process.env.ESCROW_MODE !== "handoff"
  );
}

async function createEscrowApiTransaction(input: EscrowHandoffInput): Promise<EscrowHandoff> {
  const baseUrl = process.env.ESCROW_API_BASE_URL ?? "https://api.escrow.com/2017-09-01";
  const auth = Buffer.from(`${process.env.ESCROW_API_EMAIL}:${process.env.ESCROW_API_KEY}`).toString("base64");
  const body = buildEscrowPayload(input);
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/transaction`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Escrow.com transaction creation failed: ${response.status}`);
  }

  const escrowId = String(payload.id ?? payload.transaction_id ?? `escrow_${Date.now()}`);

  return {
    escrowId,
    escrowUrl: payload.landing_page ?? payload.url ?? `https://www.escrow.com/transaction/${escrowId}`,
    provider: "escrow.com",
    mode: "api",
    providerResponse: payload
  };
}

function buildEscrowPayload({ listing, buyerEmail, sellerEmail, amount }: EscrowHandoffInput) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://getthe.com";

  return {
    parties: [
      { role: "buyer", customer: buyerEmail },
      { role: "seller", customer: sellerEmail }
    ],
    currency: "usd",
    description: `The sale of ${listing.domain}`,
    items: [
      {
        title: listing.domain,
        description: listing.description,
        type: "domain_name",
        inspection_period: 259200,
        quantity: 1,
        schedule: [
          {
            amount,
            payer_customer: buyerEmail,
            beneficiary_customer: sellerEmail
          }
        ],
        extra_attributes: {
          domain: listing.domain,
          registrar: listing.registrar
        },
        additional_attributes: {
          merchant_url: `${appUrl.replace(/\/$/, "")}/domains/${listing.domain}`
        }
      }
    ]
  };
}

function buildEscrowHandoffUrl(escrowId: string, domain: string, amount: number, buyerEmail: string) {
  const params = new URLSearchParams({
    ref: escrowId,
    domain,
    amount: String(amount),
    buyer: buyerEmail,
    source: "getthe"
  });

  return `https://www.escrow.com/domain-name-holding?${params.toString()}`;
}
