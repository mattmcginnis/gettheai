import { Prisma } from "@prisma/client";
import { sendMarketplaceNotification } from "@/lib/notifications";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import type { DomainFilters, NotificationPreferences, SearchAlertItem } from "@/lib/types";
import { localNotificationPreferences, localSearchAlerts } from "@/lib/repository/internal/local-store";
import { ensureUser } from "@/lib/repository/internal/prisma";
import { defaultNotificationPreferences, normalizeNotificationPreferences, shouldDeliverAlert } from "@/lib/repository/internal/utils";
import { searchMarketplaceListings } from "@/lib/repository/marketplace";

export async function createSearchAlert(input: {
  userEmail: string;
  name: string;
  filters: DomainFilters;
  cadence: SearchAlertItem["cadence"];
}): Promise<SearchAlertItem> {
  const createdAt = new Date().toISOString();
  if (!isDatabaseConfigured()) {
    const alert = {
      id: `alert_${Date.now()}`,
      userEmail: input.userEmail,
      name: input.name,
      filters: input.filters,
      cadence: input.cadence,
      active: true,
      createdAt
    };
    localSearchAlerts.unshift(alert);
    return { ...alert };
  }

  const user = await ensureUser(input.userEmail, "BUYER");
  const row = await getPrisma().searchAlert.create({
    data: {
      userId: user.id,
      name: input.name,
      filters: input.filters as Prisma.InputJsonValue,
      cadence: input.cadence,
      active: true
    },
    include: {
      user: true
    }
  });

  return {
    id: row.id,
    userEmail: row.user.email,
    name: row.name,
    filters: row.filters as DomainFilters,
    cadence: row.cadence as SearchAlertItem["cadence"],
    active: row.active,
    createdAt: row.createdAt.toISOString()
  };
}


export async function listSearchAlerts(input: { userEmail: string }): Promise<SearchAlertItem[]> {
  if (!isDatabaseConfigured()) {
    return localSearchAlerts
      .filter((alert) => alert.userEmail.toLowerCase() === input.userEmail.toLowerCase())
      .map((alert) => ({ ...alert }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const rows = await getPrisma().searchAlert.findMany({
    where: {
      user: {
        email: input.userEmail.toLowerCase()
      }
    },
    include: {
      user: true
    },
    orderBy: { updatedAt: "desc" }
  });

  return rows.map((row) => ({
    id: row.id,
    userEmail: row.user.email,
    name: row.name,
    filters: row.filters as DomainFilters,
    cadence: row.cadence as SearchAlertItem["cadence"],
    active: row.active,
    createdAt: row.createdAt.toISOString()
  }));
}


export async function updateSearchAlert(input: {
  id: string;
  userEmail: string;
  name?: string;
  cadence?: SearchAlertItem["cadence"];
  active?: boolean;
}) {
  if (!isDatabaseConfigured()) {
    const alert = localSearchAlerts.find(
      (item) => item.id === input.id && item.userEmail.toLowerCase() === input.userEmail.toLowerCase()
    );
    if (!alert) {
      throw new Error("Search alert not found.");
    }

    alert.name = input.name ?? alert.name;
    alert.cadence = input.cadence ?? alert.cadence;
    alert.active = input.active ?? alert.active;
    return { ...alert };
  }

  const existing = await getPrisma().searchAlert.findFirst({
    where: {
      id: input.id,
      user: {
        email: input.userEmail.toLowerCase()
      }
    },
    include: { user: true }
  });

  if (!existing) {
    throw new Error("Search alert not found.");
  }

  const row = await getPrisma().searchAlert.update({
    where: { id: existing.id },
    data: {
      name: input.name ?? existing.name,
      cadence: input.cadence ?? existing.cadence,
      active: input.active ?? existing.active
    },
    include: { user: true }
  });

  return {
    id: row.id,
    userEmail: row.user.email,
    name: row.name,
    filters: row.filters as DomainFilters,
    cadence: row.cadence as SearchAlertItem["cadence"],
    active: row.active,
    createdAt: row.createdAt.toISOString()
  };
}


export async function deleteSearchAlert(input: { id: string; userEmail: string }) {
  if (!isDatabaseConfigured()) {
    const index = localSearchAlerts.findIndex(
      (item) => item.id === input.id && item.userEmail.toLowerCase() === input.userEmail.toLowerCase()
    );
    if (index >= 0) {
      localSearchAlerts.splice(index, 1);
    }

    return {
      action: "search_alert_delete",
      id: input.id,
      deleted: index >= 0,
      mode: "local"
    };
  }

  const row = await getPrisma().searchAlert.findFirst({
    where: {
      id: input.id,
      user: {
        email: input.userEmail.toLowerCase()
      }
    }
  });

  if (!row) {
    throw new Error("Search alert not found.");
  }

  await getPrisma().searchAlert.delete({ where: { id: row.id } });
  return {
    action: "search_alert_delete",
    id: row.id,
    deleted: true,
    mode: "database"
  };
}


export async function getNotificationPreferences(email: string): Promise<NotificationPreferences> {
  const normalizedEmail = email.toLowerCase();
  if (!isDatabaseConfigured()) {
    return {
      ...defaultNotificationPreferences,
      ...(localNotificationPreferences.get(normalizedEmail) ?? {})
    };
  }

  const user = (await getPrisma().user.findUnique({ where: { email: normalizedEmail } })) ?? await ensureUser(normalizedEmail, "BUYER");
  return normalizeNotificationPreferences(user.notificationPreferences);
}


export async function updateNotificationPreferences(input: {
  email: string;
  preferences: Partial<NotificationPreferences>;
}): Promise<NotificationPreferences> {
  const email = input.email.toLowerCase();
  const preferences = normalizeNotificationPreferences(input.preferences);
  if (!isDatabaseConfigured()) {
    localNotificationPreferences.set(email, preferences);
    return preferences;
  }

  const user = (await getPrisma().user.findUnique({ where: { email } })) ?? await ensureUser(email, "BUYER");
  const row = await getPrisma().user.update({
    where: { id: user.id },
    data: {
      notificationPreferences: preferences as unknown as Prisma.InputJsonValue
    }
  });

  return normalizeNotificationPreferences(row.notificationPreferences);
}


export async function deliverSearchAlerts(input: {
  cadence?: SearchAlertItem["cadence"];
  actorEmail?: string;
} = {}) {
  const cadence = input.cadence ?? "weekly";
  const alerts = await listSearchAlertsForDelivery(cadence);
  const deliveries = [];

  for (const alert of alerts) {
    const preferences = await getNotificationPreferences(alert.userEmail);
    if (!shouldDeliverAlert(preferences, alert.cadence)) {
      deliveries.push({
        alertId: alert.id,
        userEmail: alert.userEmail,
        delivered: false,
        reason: "disabled"
      });
      continue;
    }

    const search = await searchMarketplaceListings(alert.filters, { page: 1, limit: 5 });
    if (!search.results.length) {
      deliveries.push({
        alertId: alert.id,
        userEmail: alert.userEmail,
        delivered: false,
        reason: "no_matches"
      });
      continue;
    }

    const topMatches = search.results.map((listing) => listing.domain).join(", ");
    const result = await sendMarketplaceNotification({
      to: alert.userEmail,
      subject: `GetThe alert: ${alert.name}`,
      textBody: `${search.pagination.total} matching domains found. Top matches: ${topMatches}.`,
      tag: `search-alert-${alert.cadence}`,
      entityType: "search_alert",
      entityId: alert.id,
      recipientRole: "buyer",
      metadata: {
        cadence: alert.cadence,
        matchCount: search.pagination.total,
        actorEmail: input.actorEmail
      }
    });

    deliveries.push({
      alertId: alert.id,
      userEmail: alert.userEmail,
      delivered: result.ok,
      reason: result.ok ? "sent" : "failed",
      matchCount: search.pagination.total
    });
  }

  return {
    cadence,
    scanned: alerts.length,
    delivered: deliveries.filter((delivery) => delivery.delivered).length,
    deliveries
  };
}


export async function listNotificationEvents(input: { recipientEmail?: string; limit?: number } = {}) {
  if (!isDatabaseConfigured()) {
    return [] as Array<{
      id: string;
      eventType: string;
      tag?: string;
      subject?: string;
      recipientEmail?: string;
      entityType: string;
      entityId: string;
      createdAt: string;
    }>;
  }

  const rows = await getPrisma().auditEvent.findMany({
    where: {
      eventType: {
        startsWith: "notification."
      }
    },
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 8
  });

  return rows
    .map((row) => {
      const metadata = row.metadata as {
        to?: unknown;
        tag?: unknown;
        subject?: unknown;
        recipientRole?: unknown;
      };
      return {
        id: row.id,
        eventType: row.eventType,
        tag: typeof metadata.tag === "string" ? metadata.tag : undefined,
        subject: typeof metadata.subject === "string" ? metadata.subject : undefined,
        recipientEmail: typeof metadata.to === "string" ? metadata.to : undefined,
        recipientRole: typeof metadata.recipientRole === "string" ? metadata.recipientRole : undefined,
        entityType: row.entityType,
        entityId: row.entityId,
        createdAt: row.createdAt.toISOString()
      };
    })
    .filter((row) => !input.recipientEmail || row.recipientEmail === input.recipientEmail);
}


async function listSearchAlertsForDelivery(cadence: SearchAlertItem["cadence"]) {
  if (!isDatabaseConfigured()) {
    return localSearchAlerts.filter((alert) => alert.active && alert.cadence === cadence);
  }

  const rows = await getPrisma().searchAlert.findMany({
    where: {
      active: true,
      cadence
    },
    include: {
      user: true
    },
    orderBy: { updatedAt: "asc" },
    take: 100
  });

  return rows.map((row) => ({
    id: row.id,
    userEmail: row.user.email,
    name: row.name,
    filters: row.filters as DomainFilters,
    cadence: row.cadence as SearchAlertItem["cadence"],
    active: row.active,
    createdAt: row.createdAt.toISOString()
  }));
}

