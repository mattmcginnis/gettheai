import { prohibitedListingSignals } from "@/lib/constants";
import type { AdminQueueItem, DomainListing, Offer } from "@/lib/types";

const protectedBrandSignals = [
  "apple",
  "google",
  "microsoft",
  "openai",
  "facebook",
  "instagram",
  "tesla",
  "amazon",
  "netflix"
];

export function scanListingRisk(listing: DomainListing): AdminQueueItem[] {
  const lower = `${listing.domain} ${listing.description} ${listing.brandSignals.join(" ")}`.toLowerCase();
  const flags: AdminQueueItem[] = [];

  const matchedBrand = protectedBrandSignals.find((brand) => lower.includes(brand));
  if (matchedBrand) {
    flags.push(queueItem("trademark", `Review possible trademark issue for ${listing.domain}`, "high"));
  }

  const matchedPolicy = prohibitedListingSignals.find((signal) => lower.includes(signal.split(" ")[0]));
  if (matchedPolicy) {
    flags.push(queueItem("fraud", `Review prohibited listing signal for ${listing.domain}`, "medium"));
  }

  if (!listing.ownershipVerified) {
    flags.push(queueItem("ownership", `Ownership verification pending for ${listing.domain}`, "medium"));
  }

  if (listing.price > listing.appraisal.highEstimate * 1.75 && listing.appraisal.confidence < 75) {
    flags.push(queueItem("fraud", `Review aggressive pricing for ${listing.domain}`, "low"));
  }

  return flags;
}

export function scanOfferRisk(offer: Offer) {
  const flags: AdminQueueItem[] = [];

  if (offer.amount >= 15000 && offer.buyerVerificationTier !== "kyc_review") {
    flags.push(queueItem("fraud", `High-value offer ${offer.id} needs KYC review`, "high"));
  }

  if (offer.status === "pending" && Date.parse(offer.expiresAt) < Date.now()) {
    flags.push(queueItem("fraud", `Expired pending offer ${offer.id} needs cleanup`, "low"));
  }

  return flags;
}

function queueItem(type: AdminQueueItem["type"], title: string, severity: AdminQueueItem["severity"]): AdminQueueItem {
  return {
    id: `flag_${type}_${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 48)}`,
    type,
    title,
    severity,
    status: "open",
    createdAt: new Date().toISOString()
  };
}
