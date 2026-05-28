import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sendMarketplaceNotification } from "@/lib/notifications";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalPostmarkToken = process.env.POSTMARK_SERVER_TOKEN;

describe("marketplace notifications", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTMARK_SERVER_TOKEN;
  });

  afterEach(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }

    if (originalPostmarkToken) {
      process.env.POSTMARK_SERVER_TOKEN = originalPostmarkToken;
    } else {
      delete process.env.POSTMARK_SERVER_TOKEN;
    }
  });

  it("queues notifications locally when Postmark is not configured", async () => {
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
    expect(result.providerResult).toMatchObject({
      provider: "local",
      queued: true
    });
  });
});
