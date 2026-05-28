export type Tld = "com" | "org" | "ai" | "io" | "net";

export type VerificationTier = "email" | "two_factor" | "escrow_intent" | "kyc_review";

export type ListingStatus =
  | "draft"
  | "pending_verification"
  | "active"
  | "flagged"
  | "sold"
  | "archived";

export type ListingType = "buy_now" | "make_offer" | "buy_now_and_offer";

export type OfferStatus =
  | "pending"
  | "countered"
  | "accepted"
  | "rejected"
  | "expired"
  | "canceled";

export type TransactionStatus =
  | "initiated"
  | "escrow_started"
  | "buyer_funded"
  | "domain_transfer_started"
  | "transfer_verified"
  | "payout_complete"
  | "closed"
  | "canceled"
  | "disputed";

export interface SellerProfile {
  id: string;
  publicName: string;
  slug: string;
  verified: boolean;
  transactionCount: number;
  avgResponseHours: number;
}

export interface SellerProfilePage {
  seller: SellerProfile;
  listings: DomainListing[];
  metrics: {
    activeListings: number;
    pendingListings: number;
    totalAsk: number;
    averageAsk: number;
    tlds: string[];
    categories: string[];
  };
}

export interface ComparableSale {
  domain: string;
  price: number;
  date: string;
  venue: string;
  tld: Tld;
}

export interface Appraisal {
  domain: string;
  lowEstimate: number;
  highEstimate: number;
  confidence: number;
  comparableSales: ComparableSale[];
  keywordSignals: string[];
  brandabilityNotes: string;
  generatedSummary: string;
  modelVersion: string;
  disclaimer: string;
}

export interface DomainListing {
  id: string;
  domain: string;
  tld: Tld;
  registrar: string;
  seller: SellerProfile;
  status: ListingStatus;
  listingType: ListingType;
  price: number;
  minimumOffer: number;
  commissionRate: number;
  ownershipVerified: boolean;
  description: string;
  category: string;
  trafficMonthly: number;
  domainAgeYears: number;
  seoTitle: string;
  seoDescription: string;
  brandSignals: string[];
  createdAt: string;
  appraisal: Appraisal;
}

export interface DomainFilters {
  q?: string;
  tld?: string;
  minPrice?: number;
  maxPrice?: number;
  category?: string;
  maxLength?: number;
  minTraffic?: number;
  minConfidence?: number;
  listingType?: ListingType | "any";
  sort?: "featured" | "price_asc" | "price_desc" | "newest" | "confidence";
}

export interface DomainPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface DomainFacetValue {
  value: string;
  label: string;
  count: number;
}

export interface DomainFacets {
  tlds: DomainFacetValue[];
  categories: DomainFacetValue[];
  listingTypes: DomainFacetValue[];
  priceBands: DomainFacetValue[];
}

export interface DomainSearchResult {
  results: DomainListing[];
  filters: DomainFilters;
  pagination: DomainPagination;
  facets: DomainFacets;
}

export interface Offer {
  id: string;
  listingId: string;
  buyerEmail: string;
  amount: number;
  status: OfferStatus;
  buyerVerificationTier: VerificationTier;
  expiresAt: string;
  negotiationHistory: Array<{
    actor: "buyer" | "seller" | "ai_copilot" | "admin";
    message: string;
    amount?: number;
    at: string;
  }>;
}

export interface Transaction {
  id: string;
  listingId: string;
  offerId?: string;
  buyerEmail: string;
  sellerId: string;
  escrowProvider: "escrow.com";
  escrowId?: string;
  escrowUrl?: string;
  amount: number;
  commission: number;
  status: TransactionStatus;
  statusTimeline: Array<{
    status: TransactionStatus;
    label: string;
    at: string;
  }>;
  transferChecklist: Array<{
    label: string;
    done: boolean;
  }>;
}

export interface TransactionDashboardItem {
  id: string;
  listingId: string;
  domain: string;
  buyerEmail: string;
  sellerEmail: string;
  sellerName: string;
  amount: number;
  commission: number;
  status: TransactionStatus;
  escrowId?: string;
  escrowUrl?: string;
  updatedAt: string;
  createdAt: string;
}

export interface ParkedInquiry {
  id: string;
  listingId: string;
  domain: string;
  sellerEmail: string;
  name: string;
  email: string;
  message: string;
  budget?: number;
  createdAt: string;
}

export interface AdminQueueItem {
  id: string;
  type: "trademark" | "fraud" | "ownership" | "escrow" | "ai_approval";
  title: string;
  severity: "low" | "medium" | "high";
  status: "open" | "reviewing" | "resolved";
  createdAt: string;
}

export interface WatchlistItem {
  id: string;
  userEmail: string;
  listingId: string;
  domain: string;
  createdAt: string;
}

export interface SearchAlertItem {
  id: string;
  userEmail: string;
  name: string;
  filters: DomainFilters;
  cadence: "instant" | "daily" | "weekly";
  active: boolean;
  createdAt: string;
}

export interface SupportCaseItem {
  id: string;
  requesterEmail: string;
  subject: string;
  status: "open" | "waiting_on_user" | "escalated" | "resolved";
  transactionId?: string;
  aiDraftResponses: Array<{
    title: string;
    body: string;
    provider: string;
    modelVersion: string;
  }>;
  escalationNotes?: string;
  createdAt: string;
}

export interface SellerInventoryItem {
  id: string;
  domain: string;
  status: ListingStatus;
  listingType: ListingType;
  price: number;
  minimumOffer: number;
  ownershipVerified: boolean;
  verificationStatus: string;
  offerCount: number;
  openOfferCount: number;
  updatedAt: string;
}

export interface OfferInboxItem {
  id: string;
  domain: string;
  listingId: string;
  buyerEmail: string;
  sellerEmail: string;
  sellerName: string;
  amount: number;
  status: OfferStatus;
  buyerVerificationTier: VerificationTier;
  expiresAt: string;
  updatedAt: string;
}

export interface NotificationPreferences {
  instantAlerts: boolean;
  dailyDigest: boolean;
  weeklyDigest: boolean;
  offerUpdates: boolean;
  transactionUpdates: boolean;
  supportUpdates: boolean;
}

export interface LaunchGate {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface OperationalAnalytics {
  appraisalCount: number;
  listingCount: number;
  appraisalToListingRate: number;
  searchCount: number;
  detailViewCount: number;
  searchToDetailRate: number;
  offerCount: number;
  offerRate: number;
  escrowStartedCount: number;
  escrowStartRate: number;
  completedGmv: number;
  failedHandoffCount: number;
}
