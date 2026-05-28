import { createHmac, timingSafeEqual } from "node:crypto";
import { checkReplay } from "@/lib/security";
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

export class EscrowApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: unknown
  ) {
    super(message);
    this.name = "EscrowApiError";
  }
}

export async function createEscrowHandoff(input: EscrowHandoffInput): Promise<EscrowHandoff> {
  if (isEscrowApiConfigured()) {
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
  const expected = Buffer.from(digest, "hex");
  const actual = Buffer.from(normalized, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyEscrowWebhookReplay(signature: string | null) {
  if (!process.env.ESCROW_WEBHOOK_SECRET) {
    return true;
  }

  const windowSeconds = Number(process.env.ESCROW_WEBHOOK_REPLAY_WINDOW_SECONDS ?? 300);
  return checkReplay({
    key: signature,
    windowMs: windowSeconds * 1000
  }).allowed;
}

export function verifyEscrowWebhookTimestamp(timestamp: string | null) {
  if (!process.env.ESCROW_WEBHOOK_SECRET) {
    return true;
  }

  if (!timestamp) {
    return false;
  }

  const parsed = parseWebhookTimestamp(timestamp);
  if (!parsed) {
    return false;
  }

  const windowSeconds = Number(process.env.ESCROW_WEBHOOK_REPLAY_WINDOW_SECONDS ?? 300);
  return Math.abs(Date.now() - parsed) <= windowSeconds * 1000;
}

export function isEscrowApiConfigured() {
  return Boolean(
    process.env.ESCROW_API_BASE_URL &&
      process.env.ESCROW_API_EMAIL &&
      process.env.ESCROW_API_KEY &&
      process.env.ESCROW_MODE !== "handoff"
  );
}

export async function fetchEscrowTransaction(escrowId: string) {
  if (!isEscrowApiConfigured()) {
    return {
      id: escrowId,
      status: "handoff_pending",
      mode: "handoff"
    };
  }

  const baseUrl = process.env.ESCROW_API_BASE_URL ?? "https://api.escrow.com/2017-09-01";
  const auth = Buffer.from(`${process.env.ESCROW_API_EMAIL}:${process.env.ESCROW_API_KEY}`).toString("base64");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/transaction/${encodeURIComponent(escrowId)}`, {
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json"
    }
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new EscrowApiError(`Escrow.com transaction lookup failed: ${response.status}`, response.status, payload);
  }

  return payload;
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
    throw new EscrowApiError(`Escrow.com transaction creation failed: ${response.status}`, response.status, payload);
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

function parseWebhookTimestamp(timestamp: string) {
  const trimmed = timestamp.trim();
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return trimmed.length <= 10 ? numeric * 1000 : numeric;
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}
