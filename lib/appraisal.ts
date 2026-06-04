import {
  APPRAISAL_DISCLAIMER,
  APPRAISAL_MODEL_VERSION
} from "@/lib/constants";
import { getComparableSource } from "@/lib/comparables";
import { listings } from "@/lib/seed";
import type { Appraisal, ComparableSale, Tld } from "@/lib/types";

const VALID_DOMAIN = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,}$/i;

const tldMultipliers: Record<string, number> = {
  com: 1.35,
  ai: 1.5,
  org: 0.82,
  io: 0.95,
  net: 0.62
};

const strongKeywords = [
  "agent",
  "ai",
  "business",
  "atlas",
  "bridge",
  "cars",
  "civic",
  "cloud",
  "credit",
  "data",
  "finance",
  "forge",
  "grant",
  "health",
  "homes",
  "insurance",
  "jobs",
  "ledger",
  "loans",
  "model",
  "realestate",
  "security",
  "shop",
  "travel",
  "trust"
];

type PremiumGenericProfile = {
  readonly lowEstimate: number;
  readonly highEstimate: number;
  readonly confidence: number;
  readonly signal: string;
};

const premiumDotComGenerics: Record<string, PremiumGenericProfile> = {
  business: {
    lowEstimate: 5_000_000,
    highEstimate: 25_000_000,
    confidence: 88,
    signal: "category-defining commercial generic"
  },
  insurance: {
    lowEstimate: 8_000_000,
    highEstimate: 45_000_000,
    confidence: 88,
    signal: "category-defining insurance generic"
  },
  hotels: {
    lowEstimate: 3_000_000,
    highEstimate: 20_000_000,
    confidence: 84,
    signal: "category-defining travel generic"
  },
  cars: {
    lowEstimate: 2_500_000,
    highEstimate: 18_000_000,
    confidence: 84,
    signal: "category-defining automotive generic"
  },
  loans: {
    lowEstimate: 2_000_000,
    highEstimate: 15_000_000,
    confidence: 83,
    signal: "category-defining lending generic"
  },
  credit: {
    lowEstimate: 1_500_000,
    highEstimate: 12_000_000,
    confidence: 82,
    signal: "premium financial generic"
  },
  travel: {
    lowEstimate: 1_500_000,
    highEstimate: 12_000_000,
    confidence: 82,
    signal: "premium travel generic"
  },
  jobs: {
    lowEstimate: 1_000_000,
    highEstimate: 9_000_000,
    confidence: 81,
    signal: "premium employment generic"
  },
  health: {
    lowEstimate: 900_000,
    highEstimate: 8_000_000,
    confidence: 80,
    signal: "premium health generic"
  },
  shop: {
    lowEstimate: 750_000,
    highEstimate: 6_000_000,
    confidence: 79,
    signal: "premium commerce generic"
  }
};

export function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function isValidDomain(domain: string) {
  return VALID_DOMAIN.test(normalizeDomain(domain));
}

export function getTld(domain: string): Tld {
  const tld = normalizeDomain(domain).split(".").pop() ?? "com";
  if (["com", "org", "ai", "io", "net"].includes(tld)) {
    return tld as Tld;
  }

  return "com";
}

export function getSecondLevel(domain: string) {
  return normalizeDomain(domain).split(".").at(-2) ?? normalizeDomain(domain);
}

function getKeywordSignals(secondLevel: string) {
  const lower = secondLevel.toLowerCase();
  return strongKeywords.filter((keyword) => lower.includes(keyword));
}

function comparableScore(domain: string, tld: Tld): ComparableSale[] {
  const secondLevel = getSecondLevel(domain);
  const signals = getKeywordSignals(secondLevel);
  const scored = getComparableSource().all().map((sale) => {
    const saleSecondLevel = getSecondLevel(sale.domain);
    const sharedSignal = signals.some((signal) => saleSecondLevel.includes(signal));
    const tldBoost = sale.tld === tld ? 2 : 0;
    const lengthBoost = Math.max(0, 12 - Math.abs(saleSecondLevel.length - secondLevel.length)) / 8;
    return { sale, score: (sharedSignal ? 4 : 0) + tldBoost + lengthBoost };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ sale }) => sale);
}

function getPremiumGenericProfile(secondLevel: string, tld: Tld): PremiumGenericProfile | null {
  if (tld !== "com") {
    return null;
  }

  return premiumDotComGenerics[secondLevel.toLowerCase()] ?? null;
}

function uniqueSignals(signals: string[]) {
  return Array.from(new Set(signals));
}

export function appraiseDomain(rawDomain: string): Appraisal {
  const domain = normalizeDomain(rawDomain);

  if (!isValidDomain(domain)) {
    throw new Error("Enter a valid domain like example.com.");
  }

  const existing = listings.find((listing) => listing.domain === domain);
  if (existing) {
    return existing.appraisal;
  }

  const secondLevel = getSecondLevel(domain);
  const tld = getTld(domain);
  const signals = getKeywordSignals(secondLevel);
  const length = secondLevel.length;
  const lengthScore = Math.max(0, 18 - length) * 170;
  const keywordScore = signals.length * 850;
  const hyphenPenalty = secondLevel.includes("-") ? 0.72 : 1;
  const numericPenalty = /\d/.test(secondLevel) ? 0.78 : 1;
  const base = 1150 + lengthScore + keywordScore;
  const multiplier = tldMultipliers[tld] ?? 0.55;
  const midpoint = Math.round(base * multiplier * hyphenPenalty * numericPenalty);
  let lowEstimate = Math.max(350, Math.round(midpoint * 0.62));
  let highEstimate = Math.max(lowEstimate + 500, Math.round(midpoint * 1.55));
  const comparable = comparableScore(domain, tld);
  let confidence = Math.min(
    91,
    56 + comparable.length * 6 + signals.length * 5 + (["com", "ai", "org"].includes(tld) ? 8 : 0)
  );
  const premiumProfile = getPremiumGenericProfile(secondLevel, tld);

  if (premiumProfile && hyphenPenalty === 1 && numericPenalty === 1) {
    lowEstimate = Math.max(lowEstimate, premiumProfile.lowEstimate);
    highEstimate = Math.max(highEstimate, premiumProfile.highEstimate);
    confidence = Math.max(confidence, premiumProfile.confidence);
  }

  const readableSignals = premiumProfile
    ? uniqueSignals([premiumProfile.signal, "exact-match .com", ...signals])
    : signals.length ? signals : ["brandable", tld, `${length} characters`];

  return {
    domain,
    lowEstimate,
    highEstimate,
    confidence,
    comparableSales: comparable,
    keywordSignals: readableSignals,
    brandabilityNotes: buildBrandabilityNotes(domain, tld, signals, length, premiumProfile),
    generatedSummary: buildSummary(domain, lowEstimate, highEstimate, confidence, premiumProfile),
    modelVersion: APPRAISAL_MODEL_VERSION,
    disclaimer: APPRAISAL_DISCLAIMER
  };
}

function buildBrandabilityNotes(
  domain: string,
  tld: Tld,
  signals: string[],
  length: number,
  premiumProfile: PremiumGenericProfile | null = null
) {
  const extensionNote =
    tld === "com"
      ? ".com gives the name the broadest resale audience."
      : tld === "ai"
        ? ".ai improves category fit for model, agent, and automation buyers."
        : tld === "org"
          ? ".org is strongest when the buyer has a mission, civic, education, or community angle."
          : `.${tld} has a narrower buyer pool than .com.`;
  const keywordNote = signals.length
    ? `Recognized buyer-intent signals: ${signals.join(", ")}.`
    : "No dominant high-intent keyword was detected, so brand narrative matters more.";
  const lengthNote =
    length <= 10
      ? "The second-level name is short enough for strong recall."
      : "The name is longer, so exact buyer fit matters more than broad liquidity.";
  const premiumNote = premiumProfile
    ? ` This is an exact-match premium generic, so valuation should be anchored to strategic buyer demand and historical top-tier generic sales rather than ordinary brandable comps.`
    : "";

  return `${extensionNote} ${keywordNote} ${lengthNote}${premiumNote}`;
}

function buildSummary(
  domain: string,
  lowEstimate: number,
  highEstimate: number,
  confidence: number,
  premiumProfile: PremiumGenericProfile | null = null
) {
  const bandLabel = premiumProfile ? "premium strategic-buyer band" : "mid-market band";

  return `${domain} appraises in the ${formatMoney(lowEstimate)}-${formatMoney(
    highEstimate
  )} ${bandLabel} with ${confidence}% confidence. Treat this as a pricing signal, then validate buyer fit, trademarks, and comparable sales before listing.`;
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}
