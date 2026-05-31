import type { AdminQueueItem } from "@/lib/types";

export interface AdminEntityDetail {
  entity: string;
  id: string;
  title: string;
  subtitle: string;
  primaryHref?: string;
  sections: Array<{
    title: string;
    rows: Array<{
      label: string;
      value: string;
      preformatted?: boolean;
    }>;
  }>;
}

export interface AdminOperationFilters {
  q?: string;
  kind?: "all" | "users" | "listings" | "offers" | "transactions" | "audit";
  status?: string;
}

export function normalizeAdminQueueItem(value: unknown, fallbackId: string, fallbackCreatedAt: Date): AdminQueueItem {
  const candidate = typeof value === "object" && value !== null ? (value as Partial<AdminQueueItem>) : {};
  return {
    id: typeof candidate.id === "string" ? candidate.id : fallbackId,
    type: isAdminQueueType(candidate.type) ? candidate.type : "fraud",
    title: typeof candidate.title === "string" ? candidate.title : "Moderation flag",
    severity: isSeverity(candidate.severity) ? candidate.severity : "medium",
    status: candidate.status === "reviewing" || candidate.status === "resolved" ? candidate.status : "open",
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : fallbackCreatedAt.toISOString()
  };
}

export function isAdminQueueType(value: unknown): value is AdminQueueItem["type"] {
  return value === "trademark" || value === "fraud" || value === "ownership" || value === "escrow" || value === "ai_approval";
}

export function isSeverity(value: unknown): value is AdminQueueItem["severity"] {
  return value === "low" || value === "medium" || value === "high";
}

export function severityRank(severity: AdminQueueItem["severity"]) {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

export function applyAdminOperationFilters<T extends {
  users: Array<Record<string, unknown>>;
  listings: Array<Record<string, unknown>>;
  offers: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
}>(operations: T, filters: AdminOperationFilters): T {
  const q = filters.q?.trim().toLowerCase();
  const status = filters.status?.trim().toLowerCase();
  const kind = filters.kind ?? "all";

  const matchesText = (row: Record<string, unknown>) => {
    if (!q) return true;
    return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(q));
  };
  const matchesStatus = (row: Record<string, unknown>) => {
    if (!status || status === "all") return true;
    return String(row.status ?? row.role ?? row.eventType ?? "").toLowerCase().includes(status);
  };
  const filterRows = (rows: Array<Record<string, unknown>>, rowKind: AdminOperationFilters["kind"]) => {
    if (kind !== "all" && kind !== rowKind) return [];
    return rows.filter((row) => matchesText(row) && matchesStatus(row));
  };

  return {
    ...operations,
    users: filterRows(operations.users, "users"),
    listings: filterRows(operations.listings, "listings"),
    offers: filterRows(operations.offers, "offers"),
    transactions: filterRows(operations.transactions, "transactions"),
    auditEvents: filterRows(operations.auditEvents, "audit")
  };
}

export function adminRows(values: Record<string, unknown>) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => {
      const formatted = formatAdminValue(value);
      return {
        label,
        value: formatted.value,
        preformatted: formatted.preformatted
      };
    });
}

export function formatAdminValue(value: unknown) {
  if (value instanceof Date) {
    return { value: value.toISOString(), preformatted: false };
  }

  if (typeof value === "boolean") {
    return { value: value ? "yes" : "no", preformatted: false };
  }

  if (typeof value === "object" && value !== null) {
    return { value: JSON.stringify(value, null, 2), preformatted: true };
  }

  return { value: String(value), preformatted: false };
}

export function formatAdminMoney(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}
