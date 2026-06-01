// Barrel: public marketplace repository API, composed from domain modules.
export * from "@/lib/repository/marketplace";
export * from "@/lib/repository/listings";
export * from "@/lib/repository/offers";
export * from "@/lib/repository/transactions";
export * from "@/lib/repository/sellers";
export * from "@/lib/repository/inquiries";
export * from "@/lib/repository/watchlist";
export * from "@/lib/repository/alerts";
export * from "@/lib/repository/support";
export * from "@/lib/repository/analytics";
export * from "@/lib/repository/admin";
export * from "@/lib/repository/ai";

export type { AdminQueueItem } from "@/lib/types";
export type { AdminEntityDetail, AdminOperationFilters } from "@/lib/repository/internal/admin";
