import { APPRAISAL_DISCLAIMER, APPRAISAL_MODEL_VERSION } from "@/lib/constants";
import type { AdminQueueItem, ComparableSale, DomainListing, SellerProfile } from "@/lib/types";

export const sellers: SellerProfile[] = [
  {
    id: "seller-1",
    publicName: "Northstar Domains",
    slug: "northstar-domains",
    verified: true,
    transactionCount: 42,
    avgResponseHours: 3
  },
  {
    id: "seller-2",
    publicName: "Civic Names",
    slug: "civic-names",
    verified: true,
    transactionCount: 18,
    avgResponseHours: 5
  },
  {
    id: "seller-3",
    publicName: "Applied AI Holdings",
    slug: "applied-ai-holdings",
    verified: true,
    transactionCount: 27,
    avgResponseHours: 2
  }
];

export const comparableSales: ComparableSale[] = [
  { domain: "atlasdata.com", price: 8800, date: "2025-11-18", venue: "NameBio", tld: "com" },
  { domain: "ledgerworks.com", price: 6400, date: "2025-09-04", venue: "Sedo", tld: "com" },
  { domain: "civicbase.org", price: 3900, date: "2025-07-22", venue: "Private", tld: "org" },
  { domain: "modelstack.ai", price: 14500, date: "2025-12-10", venue: "NameBio", tld: "ai" },
  { domain: "trustflow.com", price: 7200, date: "2025-08-01", venue: "Afternic", tld: "com" },
  { domain: "grantbridge.org", price: 5200, date: "2025-05-14", venue: "Sedo", tld: "org" },
  { domain: "agentforge.ai", price: 18000, date: "2026-01-16", venue: "Private", tld: "ai" },
  { domain: "signaldesk.com", price: 9400, date: "2025-10-03", venue: "NameBio", tld: "com" }
];

export const listings: DomainListing[] = [
  {
    id: "dom-1",
    domain: "atlasforge.com",
    tld: "com",
    registrar: "Namecheap",
    seller: sellers[0],
    status: "active",
    listingType: "buy_now_and_offer",
    price: 8800,
    minimumOffer: 6500,
    commissionRate: 0.07,
    ownershipVerified: true,
    description:
      "A sturdy two-word .com for infrastructure, developer tooling, data products, or operations software.",
    category: "SaaS",
    trafficMonthly: 380,
    domainAgeYears: 9,
    seoTitle: "AtlasForge.com is for sale",
    seoDescription: "Buy AtlasForge.com through Escrow.com with GetThe transaction tracking.",
    brandSignals: ["two-word .com", "infrastructure", "developer tools", "memorable"],
    createdAt: "2026-03-10T10:00:00.000Z",
    appraisal: {
      domain: "atlasforge.com",
      lowEstimate: 6400,
      highEstimate: 11200,
      confidence: 82,
      comparableSales: comparableSales.filter((sale) => sale.tld === "com").slice(0, 3),
      keywordSignals: ["atlas", "forge", "infrastructure", "build"],
      brandabilityNotes:
        "Clear builder energy with broad B2B reach; .com extension supports startup buyer trust.",
      generatedSummary:
        "AtlasForge.com sits in the report's mid-tier sweet spot with strong .com liquidity and a buyer-friendly software angle.",
      modelVersion: APPRAISAL_MODEL_VERSION,
      disclaimer: APPRAISAL_DISCLAIMER
    }
  },
  {
    id: "dom-2",
    domain: "civicledger.org",
    tld: "org",
    registrar: "Porkbun",
    seller: sellers[1],
    status: "active",
    listingType: "buy_now_and_offer",
    price: 4200,
    minimumOffer: 2800,
    commissionRate: 0.07,
    ownershipVerified: true,
    description:
      "A credible .org for transparency tooling, civic technology, nonprofit finance, or open data initiatives.",
    category: "Civic Tech",
    trafficMonthly: 145,
    domainAgeYears: 6,
    seoTitle: "CivicLedger.org is for sale",
    seoDescription: "Secure CivicLedger.org through Escrow.com with GetThe marketplace tracking.",
    brandSignals: ["mission-driven", "transparent", "nonprofit", "finance"],
    createdAt: "2026-03-12T11:30:00.000Z",
    appraisal: {
      domain: "civicledger.org",
      lowEstimate: 2700,
      highEstimate: 6200,
      confidence: 76,
      comparableSales: comparableSales.filter((sale) => sale.tld === "org"),
      keywordSignals: ["civic", "ledger", "transparency", "public benefit"],
      brandabilityNotes:
        "The .org extension reinforces mission credibility and makes the name natural for trust-focused civic products.",
      generatedSummary:
        "CivicLedger.org is a focused .org listing with a strong buyer narrative for transparency and public-sector tooling.",
      modelVersion: APPRAISAL_MODEL_VERSION,
      disclaimer: APPRAISAL_DISCLAIMER
    }
  },
  {
    id: "dom-3",
    domain: "modeldock.ai",
    tld: "ai",
    registrar: "101domain",
    seller: sellers[2],
    status: "active",
    listingType: "buy_now_and_offer",
    price: 12900,
    minimumOffer: 9500,
    commissionRate: 0.07,
    ownershipVerified: true,
    description:
      "An AI-native name for model deployment, evaluation, observability, or managed inference workflows.",
    category: "AI Infrastructure",
    trafficMonthly: 520,
    domainAgeYears: 3,
    seoTitle: "ModelDock.ai is for sale",
    seoDescription: "Buy ModelDock.ai with Escrow.com handoff and GetThe AI appraisal data.",
    brandSignals: ["AI-native", "model ops", "short", "technical"],
    createdAt: "2026-03-14T08:15:00.000Z",
    appraisal: {
      domain: "modeldock.ai",
      lowEstimate: 9200,
      highEstimate: 18000,
      confidence: 84,
      comparableSales: comparableSales.filter((sale) => sale.tld === "ai"),
      keywordSignals: ["model", "dock", "AI infrastructure", "MLOps"],
      brandabilityNotes:
        "Directly aligned with active AI infrastructure demand; .ai extension improves category fit.",
      generatedSummary:
        "ModelDock.ai carries premium AI category demand, but buyers should still validate trademark and competitive positioning.",
      modelVersion: APPRAISAL_MODEL_VERSION,
      disclaimer: APPRAISAL_DISCLAIMER
    }
  },
  {
    id: "dom-4",
    domain: "trustrail.com",
    tld: "com",
    registrar: "Cloudflare",
    seller: sellers[0],
    status: "active",
    listingType: "buy_now",
    price: 7300,
    minimumOffer: 7300,
    commissionRate: 0.07,
    ownershipVerified: true,
    description:
      "A concise trust, compliance, or security brand with a concrete metaphor and commercial .com credibility.",
    category: "Security",
    trafficMonthly: 260,
    domainAgeYears: 8,
    seoTitle: "TrustRail.com is for sale",
    seoDescription: "Purchase TrustRail.com with transparent escrow status tracking.",
    brandSignals: ["security", "compliance", "trust", "short"],
    createdAt: "2026-03-15T14:45:00.000Z",
    appraisal: {
      domain: "trustrail.com",
      lowEstimate: 5200,
      highEstimate: 9800,
      confidence: 79,
      comparableSales: comparableSales.filter((sale) => sale.tld === "com").slice(1, 4),
      keywordSignals: ["trust", "rail", "security", "compliance"],
      brandabilityNotes:
        "Strong semantic fit for security and assurance products; short enough for enterprise recall.",
      generatedSummary:
        "TrustRail.com is priced inside the mid-tier range where GetThe can compete on lower fees and faster escrow handoff.",
      modelVersion: APPRAISAL_MODEL_VERSION,
      disclaimer: APPRAISAL_DISCLAIMER
    }
  },
  {
    id: "dom-5",
    domain: "grantbridge.org",
    tld: "org",
    registrar: "Name.com",
    seller: sellers[1],
    status: "active",
    listingType: "make_offer",
    price: 5600,
    minimumOffer: 3600,
    commissionRate: 0.07,
    ownershipVerified: true,
    description:
      "A practical nonprofit and public-sector name for grantmaking, fund administration, or applicant workflows.",
    category: "Nonprofit",
    trafficMonthly: 118,
    domainAgeYears: 5,
    seoTitle: "GrantBridge.org is for sale",
    seoDescription: "Make an offer on GrantBridge.org through the GetThe marketplace.",
    brandSignals: ["nonprofit", "grantmaking", "public benefit", "clear"],
    createdAt: "2026-03-16T09:00:00.000Z",
    appraisal: {
      domain: "grantbridge.org",
      lowEstimate: 3300,
      highEstimate: 7100,
      confidence: 73,
      comparableSales: comparableSales.filter((sale) => sale.tld === "org"),
      keywordSignals: ["grant", "bridge", "nonprofit", "funding"],
      brandabilityNotes:
        "Simple nonprofit use case with a clear value promise for connecting funders and applicants.",
      generatedSummary:
        "GrantBridge.org is a natural .org marketplace listing with focused nonprofit buyer intent.",
      modelVersion: APPRAISAL_MODEL_VERSION,
      disclaimer: APPRAISAL_DISCLAIMER
    }
  },
  {
    id: "dom-6",
    domain: "agentforge.ai",
    tld: "ai",
    registrar: "Dynadot",
    seller: sellers[2],
    status: "active",
    listingType: "buy_now_and_offer",
    price: 18500,
    minimumOffer: 14000,
    commissionRate: 0.07,
    ownershipVerified: true,
    description:
      "A direct AI-agent builder brand for orchestration, workflow automation, code agents, or model tooling.",
    category: "AI Agents",
    trafficMonthly: 740,
    domainAgeYears: 2,
    seoTitle: "AgentForge.ai is for sale",
    seoDescription: "Acquire AgentForge.ai with GetThe AI intelligence and Escrow.com handoff.",
    brandSignals: ["AI agents", "builder", "short", "category term"],
    createdAt: "2026-03-18T16:20:00.000Z",
    appraisal: {
      domain: "agentforge.ai",
      lowEstimate: 13200,
      highEstimate: 25000,
      confidence: 86,
      comparableSales: comparableSales.filter((sale) => sale.tld === "ai"),
      keywordSignals: ["agent", "forge", "AI agents", "automation"],
      brandabilityNotes:
        "High category alignment with AI-agent startups; price is above the initial target band and should receive stronger verification.",
      generatedSummary:
        "AgentForge.ai is a premium-leaning AI name that should use tiered buyer verification before offer negotiation.",
      modelVersion: APPRAISAL_MODEL_VERSION,
      disclaimer: APPRAISAL_DISCLAIMER
    }
  },
  {
    id: "dom-7",
    domain: "auctionforge.com",
    tld: "com",
    registrar: "Namecheap",
    seller: sellers[0],
    status: "active",
    listingType: "auction",
    price: 12000,
    minimumOffer: 4000,
    commissionRate: 0.07,
    ownershipVerified: true,
    description:
      "A time-boxed auction for a strong two-word .com — bidding closes at the listed end time, highest bid over reserve wins.",
    category: "SaaS",
    trafficMonthly: 420,
    domainAgeYears: 7,
    seoTitle: "AuctionForge.com is up for auction",
    seoDescription: "Bid on AuctionForge.com in a GetThe timed auction with Escrow.com transaction handoff.",
    brandSignals: ["two-word .com", "auction", "memorable"],
    createdAt: "2026-03-20T12:00:00.000Z",
    auctionEndsAt: "2027-12-31T23:59:00.000Z",
    bidIncrement: 250,
    appraisal: {
      domain: "auctionforge.com",
      lowEstimate: 7800,
      highEstimate: 16500,
      confidence: 80,
      comparableSales: comparableSales.filter((sale) => sale.tld === "com").slice(0, 3),
      keywordSignals: ["auction", "forge", "marketplace", "build"],
      brandabilityNotes:
        "Strong two-word .com with clear commercial intent; well suited to a competitive timed auction.",
      generatedSummary:
        "AuctionForge.com is a brandable two-word .com offered via timed auction to surface true market demand.",
      modelVersion: APPRAISAL_MODEL_VERSION,
      disclaimer: APPRAISAL_DISCLAIMER
    }
  }
];

export const adminQueue: AdminQueueItem[] = [
  {
    id: "queue-1",
    type: "trademark",
    title: "Review similarity flag for imported fintech listing",
    severity: "high",
    status: "open",
    createdAt: "2026-05-26T14:00:00.000Z"
  },
  {
    id: "queue-2",
    type: "ownership",
    title: "Manual DNS verification requested for 12-domain CSV import",
    severity: "medium",
    status: "reviewing",
    createdAt: "2026-05-26T16:45:00.000Z"
  },
  {
    id: "queue-3",
    type: "ai_approval",
    title: "Approve outbound buyer outreach draft for ModelDock.ai",
    severity: "low",
    status: "open",
    createdAt: "2026-05-27T08:30:00.000Z"
  }
];
