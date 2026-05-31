import type {
  DomainListing,
  NotificationPreferences,
  Offer,
  ParkedInquiry,
  SearchAlertItem,
  Transaction
} from "@/lib/types";

export const defaultSearchLimit = 12;
export const maxSearchLimit = 48;
export const defaultNotificationPreferences: NotificationPreferences = {
  instantAlerts: true,
  dailyDigest: false,
  weeklyDigest: true,
  offerUpdates: true,
  transactionUpdates: true,
  supportUpdates: true
};

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "seller";
}

export function titleize(value: string) {
  return value
    .replace(/[._+-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ") || "GetThe Seller";
}

export function isOpenOfferStatus(status: Offer["status"]) {
  return status === "pending" || status === "countered";
}

export function isListingOwnershipVerified(status: DomainListing["status"], verification: unknown) {
  return status === "active" || Boolean((verification as { verifiedAt?: string; status?: string })?.verifiedAt);
}

export function ownershipVerificationStatus(verification: unknown) {
  const status = (verification as { status?: unknown })?.status;
  return typeof status === "string" ? status : "pending";
}

export function shouldDeliverAlert(preferences: NotificationPreferences, cadence: SearchAlertItem["cadence"]) {
  if (cadence === "instant") return preferences.instantAlerts;
  if (cadence === "daily") return preferences.dailyDigest;
  return preferences.weeklyDigest;
}

export function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  const candidate = typeof value === "object" && value !== null ? (value as Partial<NotificationPreferences>) : {};
  return {
    instantAlerts: candidate.instantAlerts ?? defaultNotificationPreferences.instantAlerts,
    dailyDigest: candidate.dailyDigest ?? defaultNotificationPreferences.dailyDigest,
    weeklyDigest: candidate.weeklyDigest ?? defaultNotificationPreferences.weeklyDigest,
    offerUpdates: candidate.offerUpdates ?? defaultNotificationPreferences.offerUpdates,
    transactionUpdates: candidate.transactionUpdates ?? defaultNotificationPreferences.transactionUpdates,
    supportUpdates: candidate.supportUpdates ?? defaultNotificationPreferences.supportUpdates
  };
}

export function mergeInquiryAuditEvents(events: Array<{ eventType: string; metadata: unknown; createdAt: string }>) {
  const inquiries = new Map<string, ParkedInquiry>();

  for (const event of events) {
    const metadata = typeof event.metadata === "object" && event.metadata !== null
      ? (event.metadata as Partial<ParkedInquiry> & { inquiryId?: string })
      : {};

    if (event.eventType === "parking.inquiry.created" && typeof metadata.id === "string") {
      inquiries.set(metadata.id, normalizeInquiry(metadata, event.createdAt));
      continue;
    }

    if (event.eventType === "parking.inquiry.followup.updated" && typeof metadata.inquiryId === "string") {
      const existing = inquiries.get(metadata.inquiryId);
      if (existing) {
        inquiries.set(metadata.inquiryId, {
          ...existing,
          status: normalizeInquiryStatus(metadata.status) ?? existing.status,
          followUpNote: typeof metadata.followUpNote === "string" ? metadata.followUpNote : existing.followUpNote,
          updatedAt: typeof metadata.updatedAt === "string" ? metadata.updatedAt : event.createdAt
        });
      }
    }
  }

  return Array.from(inquiries.values());
}

export function normalizeInquiry(value: Partial<ParkedInquiry>, fallbackCreatedAt: string): ParkedInquiry {
  return {
    id: typeof value.id === "string" ? value.id : `inquiry_${fallbackCreatedAt}`,
    listingId: typeof value.listingId === "string" ? value.listingId : "unknown",
    domain: typeof value.domain === "string" ? value.domain : "unknown",
    sellerEmail: typeof value.sellerEmail === "string" ? value.sellerEmail : "seller@getthe.com",
    name: typeof value.name === "string" ? value.name : "Unknown buyer",
    email: typeof value.email === "string" ? value.email : "buyer@getthe.local",
    message: typeof value.message === "string" ? value.message : "",
    budget: typeof value.budget === "number" ? value.budget : undefined,
    status: normalizeInquiryStatus(value.status) ?? "new",
    followUpNote: typeof value.followUpNote === "string" ? value.followUpNote : undefined,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : fallbackCreatedAt,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : fallbackCreatedAt
  };
}

export function normalizeInquiryStatus(value: unknown): ParkedInquiry["status"] | null {
  return value === "new" || value === "contacted" || value === "converted" || value === "closed" ? value : null;
}

export function mergeChecklistItem(
  item: Transaction["transferChecklist"][number],
  update: {
    done?: boolean;
    owner?: NonNullable<Transaction["transferChecklist"][number]["owner"]>;
    dueAt?: string;
    note?: string;
  }
): Transaction["transferChecklist"][number] {
  return {
    ...item,
    ...(typeof update.done === "boolean" ? { done: update.done } : {}),
    ...(update.owner ? { owner: update.owner } : {}),
    ...(update.dueAt ? { dueAt: update.dueAt } : {}),
    ...(typeof update.note === "string" ? { note: update.note } : {}),
    updatedAt: new Date().toISOString()
  };
}

export function inquiryMatchesQuery(inquiry: ParkedInquiry, query: string) {
  return [inquiry.domain, inquiry.name, inquiry.email, inquiry.message, inquiry.sellerEmail]
    .some((value) => value.toLowerCase().includes(query));
}

export function rate(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

export function appendJsonArray(value: unknown, entry: unknown) {
  return [...(Array.isArray(value) ? value : []), entry];
}

export function dollarsToCents(value: number) {
  return Math.round(value * 100);
}

export function centsToDollars(value: number) {
  return Math.round(value) / 100;
}

export function cryptoSafeId() {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}`;
}
