const searchProvider = (process.env.SEARCH_INDEX_PROVIDER || "postgres").toLowerCase();
const searchGroup =
  searchProvider === "meilisearch"
    ? {
        name: "search",
        required: ["SEARCH_INDEX_PROVIDER", "MEILISEARCH_HOST", "MEILISEARCH_API_KEY", "SEARCH_INDEX_NAME"],
        optional: ["TYPESENSE_HOST", "TYPESENSE_API_KEY"]
      }
    : searchProvider === "typesense"
      ? {
          name: "search",
          required: ["SEARCH_INDEX_PROVIDER", "TYPESENSE_HOST", "TYPESENSE_API_KEY", "SEARCH_INDEX_NAME"],
          optional: ["MEILISEARCH_HOST", "MEILISEARCH_API_KEY"]
        }
      : {
          name: "search",
          required: [],
          optional: ["SEARCH_INDEX_PROVIDER", "SEARCH_INDEX_NAME"]
        };

const groups = [
  {
    name: "core",
    required: ["NEXT_PUBLIC_APP_URL", "DATABASE_URL"]
  },
  {
    name: "clerk",
    required: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"],
    optional: ["CLERK_WEBHOOK_SECRET", "CLERK_DEFAULT_ROLE"]
  },
  {
    name: "escrow",
    required: ["ESCROW_API_BASE_URL", "ESCROW_API_EMAIL", "ESCROW_API_KEY", "ESCROW_MODE"],
    optional: ["ESCROW_WEBHOOK_SECRET"]
  },
  {
    name: "email",
    required: ["POSTMARK_SERVER_TOKEN", "POSTMARK_FROM_EMAIL"]
  },
  searchGroup,
  {
    name: "storage",
    required: ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
    optional: ["S3_ENDPOINT", "S3_PUBLIC_BASE_URL"]
  }
];

const strict = process.env.REQUIRE_PRODUCTION_SECRETS === "true";
const summary = groups.map((group) => {
  const missingRequired = group.required.filter((key) => !process.env[key]);
  const missingOptional = (group.optional ?? []).filter((key) => !process.env[key]);
  return {
    name: group.name,
    ok: missingRequired.length === 0,
    missingRequired,
    missingOptional
  };
});

for (const group of summary) {
  const label = group.ok ? "ok" : strict ? "missing" : "warn";
  console.log(`${label}: ${group.name}`);
  if (group.missingRequired.length) {
    console.log(`  required: ${group.missingRequired.join(", ")}`);
  }
  if (group.missingOptional.length) {
    console.log(`  optional: ${group.missingOptional.join(", ")}`);
  }
}

if (strict && summary.some((group) => !group.ok)) {
  process.exitCode = 1;
}
