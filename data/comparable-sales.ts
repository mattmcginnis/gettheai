import type { ComparableSale } from "@/lib/types";

// Swappable comparable-sales dataset used by the appraisal engine when
// COMPARABLES_PROVIDER=dataset (see lib/comparables.ts).
//
// This is the drop-in point for real sales data: replace the contents below with
// a NameBio/aftermarket export (or generate this file from a CSV in a build
// step). It is a plain TS module — not JSON and not fs-loaded — so the appraisal
// import chain stays isomorphic (appraisal exports `formatMoney`, which is used
// by client components) and bundles cleanly for both server and client.
//
// Today it ships a curated sample set so `dataset` mode is exercisable end to
// end before real data is wired in.
export const datasetComparables: ComparableSale[] = [
  { domain: "lumen.ai", price: 41000, date: "2026-01-12", venue: "GetThe private brokerage", tld: "ai" },
  { domain: "flowpay.com", price: 38500, date: "2026-02-04", venue: "Escrow.com", tld: "com" },
  { domain: "nodebridge.io", price: 18750, date: "2026-01-22", venue: "GetThe marketplace", tld: "io" },
  { domain: "vaultlink.com", price: 26900, date: "2025-12-15", venue: "Escrow.com", tld: "com" },
  { domain: "brightmint.org", price: 9200, date: "2026-02-18", venue: "GetThe marketplace", tld: "org" },
  { domain: "scalebase.io", price: 15400, date: "2026-01-30", venue: "GetThe marketplace", tld: "io" },
  { domain: "quanta.ai", price: 52250, date: "2026-02-11", venue: "GetThe private brokerage", tld: "ai" },
  { domain: "paygrid.com", price: 33750, date: "2026-01-08", venue: "Escrow.com", tld: "com" },
  { domain: "medsync.io", price: 21300, date: "2025-12-29", venue: "GetThe marketplace", tld: "io" },
  { domain: "cloudmesh.com", price: 28800, date: "2026-02-02", venue: "Escrow.com", tld: "com" },
  { domain: "getthe.ai", price: 60000, date: "2026-02-20", venue: "GetThe private brokerage", tld: "ai" },
  { domain: "finbridge.net", price: 47000, date: "2026-01-19", venue: "GetThe private brokerage", tld: "net" },
  // Additional sample sales so `dataset` mode is richer than the bundled seed.
  { domain: "agentstack.ai", price: 58000, date: "2026-03-02", venue: "Escrow.com", tld: "ai" },
  { domain: "ledgerpay.com", price: 44200, date: "2026-02-26", venue: "Escrow.com", tld: "com" },
  { domain: "carevault.io", price: 19900, date: "2026-03-05", venue: "GetThe marketplace", tld: "io" },
  { domain: "datforge.ai", price: 36500, date: "2026-02-14", venue: "GetThe private brokerage", tld: "ai" },
  { domain: "shopnest.com", price: 31200, date: "2026-01-27", venue: "Escrow.com", tld: "com" },
  { domain: "openmint.org", price: 11800, date: "2026-03-01", venue: "GetThe marketplace", tld: "org" }
];
