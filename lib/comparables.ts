import { datasetComparables } from "@/data/comparable-sales";
import { comparableSales as seedComparables } from "@/lib/seed";
import type { ComparableSale } from "@/lib/types";

// ---------------------------------------------------------------------------
// Comparable-sales data source
//
// The appraisal engine no longer reads the seed comparables directly; it pulls
// from whichever ComparableSource is active. This is the seam the viability
// report cares about ("train on real sales data"): swap the data source without
// touching the appraisal math.
//
// Selection order:
//   1. An injected override (see setComparableSource) — for a server-only
//      NameBio/CSV/HTTP loader that must not pull Node-only modules into the
//      isomorphic appraisal chain.
//   2. COMPARABLES_PROVIDER=dataset -> the curated data/comparable-sales module.
//   3. Default -> the bundled seed comparables.
// ---------------------------------------------------------------------------

export interface ComparableSource {
  readonly name: string;
  all(): ComparableSale[];
}

const seedSource: ComparableSource = {
  name: "seed",
  all: () => seedComparables
};

const datasetSource: ComparableSource = {
  name: "dataset",
  all: () => datasetComparables
};

let override: ComparableSource | null = null;

export function getComparableSource(): ComparableSource {
  if (override) {
    return override;
  }
  if (process.env.COMPARABLES_PROVIDER === "dataset") {
    return datasetSource;
  }
  return seedSource;
}

/**
 * Inject a comparable source at runtime (e.g. a server-only loader that parses a
 * real NameBio/CSV export). Pass null to clear. Kept out of the appraisal import
 * chain so the appraisal module stays bundleable for the client.
 */
export function setComparableSource(source: ComparableSource | null): void {
  override = source;
}
