import { sendTransactionalEmail, type TransactionalEmail } from "@/lib/email";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface MarketplaceNotification extends TransactionalEmail {
  entityType: string;
  entityId: string;
  recipientRole?: "buyer" | "seller" | "admin" | "support";
  metadata?: Record<string, unknown>;
}

export async function sendMarketplaceNotification(message: MarketplaceNotification) {
  const result = await sendTransactionalEmail(message)
    .then((providerResult) => ({
      ok: true,
      eventType: "notification.sent",
      providerResult
    }))
    .catch((error) => ({
      ok: false,
      eventType: "notification.failed",
      providerResult: {
        error: error instanceof Error ? error.message : "Notification failed."
      }
    }));

  if (isDatabaseConfigured()) {
    await getPrisma().auditEvent.create({
      data: {
        eventType: result.eventType,
        entityType: message.entityType,
        entityId: message.entityId,
        metadata: {
          to: message.to,
          tag: message.tag,
          recipientRole: message.recipientRole,
          subject: message.subject,
          providerResult: result.providerResult,
          ...(message.metadata ?? {})
        } as Prisma.InputJsonValue
      }
    });
  }

  return result;
}
