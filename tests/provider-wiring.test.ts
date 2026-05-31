import { afterEach, describe, expect, it, vi } from "vitest";
import { createEscrowHandoff, EscrowApiError } from "@/lib/escrow";
import { sendMarketplaceNotification } from "@/lib/notifications";
import { storeObject } from "@/lib/storage";
import { runGuardedAiDraft } from "@/lib/ai";
import type { DomainListing } from "@/lib/types";

// Each adapter degrades to a local/no-op mode when its provider env is absent
// (covered elsewhere). These tests exercise the *configured* branch with the
// network/SDK client mocked, so the integration wiring is verified before real
// credentials are ever supplied.

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    async send() {
      return {};
    }
  },
  PutObjectCommand: class {
    constructor(public readonly input: unknown) {}
  }
}));

const jsonResponse = (data: unknown, { ok = true, status = 200 } = {}) =>
  ({ ok, status, json: async () => data }) as unknown as Response;

const sampleListing = {
  domain: "modeldock.ai",
  description: "AI operations domain",
  registrar: "dynadot"
} as unknown as DomainListing;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("provider wiring (configured branches)", () => {
  it("creates an Escrow.com transaction through the API when configured", async () => {
    vi.stubEnv("ESCROW_MODE", "api");
    vi.stubEnv("ESCROW_API_BASE_URL", "https://api.escrow.test/2017-09-01");
    vi.stubEnv("ESCROW_API_EMAIL", "ops@getthe.com");
    vi.stubEnv("ESCROW_API_KEY", "escrow-key");

    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ id: "txn_123", landing_page: "https://www.escrow.com/transaction/txn_123" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createEscrowHandoff({
      listing: sampleListing,
      buyerEmail: "buyer@example.com",
      sellerEmail: "seller@example.com",
      amount: 4200
    });

    expect(result.mode).toBe("api");
    expect(result.escrowId).toBe("txn_123");
    expect(result.escrowUrl).toContain("txn_123");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.escrow.test/2017-09-01/transaction");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit & { headers: Record<string, string> }).headers.authorization).toMatch(/^Basic /);
  });

  it("raises EscrowApiError when the Escrow.com API rejects the request", async () => {
    vi.stubEnv("ESCROW_MODE", "api");
    vi.stubEnv("ESCROW_API_BASE_URL", "https://api.escrow.test/2017-09-01");
    vi.stubEnv("ESCROW_API_EMAIL", "ops@getthe.com");
    vi.stubEnv("ESCROW_API_KEY", "escrow-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "bad request" }, { ok: false, status: 422 }))
    );

    await expect(
      createEscrowHandoff({
        listing: sampleListing,
        buyerEmail: "buyer@example.com",
        sellerEmail: "seller@example.com",
        amount: 4200
      })
    ).rejects.toBeInstanceOf(EscrowApiError);
  });

  it("sends transactional email through Postmark when the token is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "postmark-token");
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ MessageID: "msg_1", ErrorCode: 0 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMarketplaceNotification({
      to: "buyer@example.com",
      subject: "Offer received",
      textBody: "Your offer was received.",
      tag: "offer-created",
      entityType: "offer",
      entityId: "offer_123",
      recipientRole: "buyer"
    });

    expect(result.ok).toBe(true);
    expect(result.eventType).toBe("notification.sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.postmarkapp.com/email");
    expect((init as RequestInit & { headers: Record<string, string> }).headers["x-postmark-server-token"]).toBe(
      "postmark-token"
    );
  });

  it("stores objects in S3 when bucket credentials are configured", async () => {
    vi.stubEnv("S3_BUCKET", "getthe-artifacts");
    vi.stubEnv("S3_REGION", "us-east-1");
    vi.stubEnv("S3_ACCESS_KEY_ID", "access");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("S3_PUBLIC_BASE_URL", "https://cdn.getthe.com");

    const stored = await storeObject({
      key: "reports/appraisal.txt",
      bytes: new TextEncoder().encode("hello"),
      contentType: "text/plain"
    });

    expect(stored.provider).toBe("s3");
    expect(stored.url).toBe("https://cdn.getthe.com/reports/appraisal.txt");
    expect(stored.size).toBe(5);
  });

  it("routes AI drafts through the OpenAI Responses API when configured", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ model: "gpt-5-mini", output_text: "Concise draft." })
    );
    vi.stubGlobal("fetch", fetchMock);

    const draft = await runGuardedAiDraft({
      kind: "listing",
      subject: "modeldock.ai",
      context: "mid-market AI ops domain"
    });

    expect(draft.provider).toBe("openai");
    expect(draft.body).toBe("Concise draft.");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.openai.com/v1/responses");
    expect((init as RequestInit & { headers: Record<string, string> }).headers.authorization).toBe("Bearer sk-test");
  });
});
