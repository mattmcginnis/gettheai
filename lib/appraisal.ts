import {
  APPRAISAL_DISCLAIMER,
  APPRAISAL_MODEL_VERSION
} from "@/lib/constants";
import { comparableSales, listings } from "@/lib/seed";
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
  "atlas",
  "bridge",
  "civic",
  "cloud",
  "data",
  "forge",
  "grant",
  "ledger",
  "model",
  "security",
  "trust"
];

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
  const scored = comparableSales.map((sale) => {
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
  const lowEstimate = Math.max(350, Math.round(midpoint * 0.62));
  const highEstimate = Math.max(lowEstimate + 500, Math.round(midpoint * 1.55));
  const comparable = comparableScore(domain, tld);
  const confidence = Math.min(
    91,
    56 + comparable.length * 6 + signals.length * 5 + (["com", "ai", "org"].includes(tld) ? 8 : 0)
  );
  const readableSignals = signals.length ? signals : ["brandable", tld, `${length} characters`];

  return {
    domain,
    lowEstimate,
    highEstimate,
    confidence,
    comparableSales: comparable,
    keywordSignals: readableSignals,
    brandabilityNotes: buildBrandabilityNotes(domain, tld, signals, length),
    generatedSummary: buildSummary(domain, lowEstimate, highEstimate, confidence),
    modelVersion: APPRAISAL_MODEL_VERSION,
    disclaimer: APPRAISAL_DISCLAIMER
  };
}

function buildBrandabilityNotes(domain: string, tld: Tld, signals: string[], length: number) {
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

  return `${extensionNote} ${keywordNote} ${lengthNote}`;
}

function buildSummary(domain: string, lowEstimate: number, highEstimate: number, confidence: number) {
  return `${domain} appraises in the ${formatMoney(lowEstimate)}-${formatMoney(
    highEstimate
  )} mid-market band with ${confidence}% confidence. Treat this as a pricing signal, then validate buyer fit, trademarks, and comparable sales before listing.`;
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}
