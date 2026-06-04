import { Prisma } from "@prisma/client";
import { scanListingRisk } from "@/lib/moderation";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { adminQueue } from "@/lib/seed";
import type { AdminQueueItem } from "@/lib/types";
import { normalizeAdminQueueItem, severityRank } from "@/lib/repository/internal/admin";
import { ensureUser } from "@/lib/repository/internal/prisma";
import { listMarketplaceListings } from "@/lib/repository/marketplace";

export async function listModerationQueue(): Promise<AdminQueueItem[]> {
  if (!isDatabaseConfigured()) {
    return adminQueue;
  }

  const rows = await getPrisma().auditEvent.findMany({
    where: {
      OR: [
        { eventType: "moderation.flag.created", entityType: "admin_queue_item" },
        { eventType: { startsWith: "admin.review." }, entityType: "admin_queue_item" }
      ]
    },
    orderBy: { createdAt: "desc" },
    take: 250
  });

  const flags = new Map<string, AdminQueueItem>();
  const reviews = new Map<string, { status: AdminQueueItem["status"]; createdAt: Date }>();

  for (const row of rows) {
    if (row.eventType === "moderation.flag.created") {
      const item = normalizeAdminQueueItem(row.metadata, row.entityId, row.createdAt);
      if (!flags.has(item.id)) {
        flags.set(item.id, item);
      }
      continue;
    }

    const status: AdminQueueItem["status"] =
      row.eventType === "admin.review.approve" || row.eventType === "admin.review.reject" ? "resolved" : "reviewing";
    const existing = reviews.get(row.entityId);
    if (!existing || existing.createdAt < row.createdAt) {
      reviews.set(row.entityId, { status, createdAt: row.createdAt });
    }
  }

  return Array.from(flags.values())
    .map((item) => ({
      ...item,
      status: reviews.get(item.id)?.status ?? item.status
    }))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.createdAt.localeCompare(a.createdAt));
}

export async function recordAdminReview(input: {
  actorEmail?: string;
  queueItemId: string;
  action: "approve" | "reject" | "request_evidence" | "escalate";
  note: string;
}) {
  const review = {
    ...input,
    status: input.action === "approve" || input.action === "reject" ? "resolved" : "reviewing",
    auditEvent: {
      eventType: `admin.review.${input.action}`,
      entityType: "admin_queue_item",
      entityId: input.queueItemId,
      metadata: { note: input.note }
    }
  };

  if (isDatabaseConfigured()) {
    const actor = input.actorEmail ? await ensureUser(input.actorEmail, "ADMIN") : null;
    await getPrisma().auditEvent.create({
      data: {
        actorId: actor?.id,
        ...review.auditEvent
      }
    });
  }

  return review;
}

export async function runModerationScan(input: { actorEmail?: string } = {}) {
  const listings = await listMarketplaceListings();
  const flags = listings.flatMap(scanListingRisk);

  if (isDatabaseConfigured()) {
    const actor = input.actorEmail ? await ensureUser(input.actorEmail, "ADMIN") : null;
    const prisma = getPrisma();
    for (const flag of flags) {
      await prisma.auditEvent.create({
        data: {
          actorId: actor?.id,
          eventType: "moderation.flag.created",
          entityType: "admin_queue_item",
          entityId: flag.id,
          metadata: flag as unknown as Prisma.InputJsonValue
        }
      });
    }
  }

  return {
    scannedListings: listings.length,
    flags
  };
}
