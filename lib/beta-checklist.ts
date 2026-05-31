import type { LaunchGate } from "@/lib/types";

export const betaChecklist = [
  {
    group: "Identity and access",
    items: [
      "Clerk keys configured in staging and production",
      "Seller and admin MFA enforced",
      "Local auth fallback disabled outside local development",
      "Admin pages and APIs verified behind RBAC"
    ]
  },
  {
    group: "Marketplace workflows",
    items: [
      "Seeded inventory indexed into search",
      "Seller listing creation and ownership verification tested",
      "Buyer offer, watchlist, alert, and support flows tested",
      "Transaction handoff and admin transaction operations tested"
    ]
  },
  {
    group: "Trust and compliance",
    items: [
      "Marketplace policies reviewed by counsel",
      "Trademark complaint and takedown workflow documented",
      "Escrow.com handoff/API credentials validated",
      "No buyer or seller funds stored by GetThe"
    ]
  },
  {
    group: "Operations",
    items: [
      "Postmark, search, storage, and AI provider modes verified",
      "Staging smoke test passes",
      "Runbooks are available to admins",
      "Audit events are visible from admin observability"
    ]
  }
];

export function getLaunchGates(): LaunchGate[] {
  const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  const localAuthEnabled = process.env.ALLOW_LOCAL_AUTH_FALLBACK === "true";
  const localFallbackUnsafe = localAuthEnabled && process.env.NODE_ENV === "production";
  const searchProvider = process.env.SEARCH_INDEX_PROVIDER ?? "postgres";
  const escrowMode = process.env.ESCROW_MODE ?? "handoff";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const storageConfigured = Boolean(
    process.env.S3_BUCKET || process.env.R2_BUCKET || process.env.AWS_S3_BUCKET || process.env.STORAGE_BUCKET
  );

  return [
    gate(
      "auth",
      "Production auth",
      localFallbackUnsafe ? "fail" : clerkConfigured ? "pass" : "warn",
      localFallbackUnsafe
        ? "ALLOW_LOCAL_AUTH_FALLBACK is enabled in production. The header/cookie role override is ignored at runtime, but the flag must be removed before launch."
        : clerkConfigured
          ? "Clerk keys are configured."
          : "Local auth fallback is available for development only.",
      "security",
      "Create the production Clerk app and configure publishable and secret keys.",
      ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"]
    ),
    gate(
      "seller-2fa",
      "Seller and admin 2FA",
      clerkConfigured && !localAuthEnabled ? "pass" : "warn",
      clerkConfigured && !localAuthEnabled
        ? "2FA enforcement can rely on Clerk session state."
        : "Disable local auth fallback before public launch and enforce MFA in Clerk.",
      "security",
      "Disable local auth fallback and require MFA for seller and admin roles.",
      ["ALLOW_LOCAL_AUTH_FALLBACK"]
    ),
    gate(
      "database",
      "Postgres source of truth",
      process.env.DATABASE_URL ? "pass" : "fail",
      process.env.DATABASE_URL ? "DATABASE_URL is configured." : "Set DATABASE_URL and run migrations before launch.",
      "engineering",
      "Provision Postgres, set DATABASE_URL, and apply Prisma migrations.",
      ["DATABASE_URL"]
    ),
    gate(
      "app-url",
      "Canonical app URL",
      appUrl ? "pass" : "warn",
      appUrl ? `App URL is configured as ${appUrl}.` : "Set NEXT_PUBLIC_APP_URL for canonical links, emails, and jobs.",
      "engineering",
      "Set the canonical production URL used by email links and canonical metadata.",
      ["NEXT_PUBLIC_APP_URL"]
    ),
    gate(
      "email",
      "Transactional email",
      process.env.POSTMARK_SERVER_TOKEN ? "pass" : "warn",
      process.env.POSTMARK_SERVER_TOKEN ? "Postmark token is configured." : "Postmark is using local queue mode.",
      "operations",
      "Create a Postmark server, verify sender identity, and set server token.",
      ["POSTMARK_SERVER_TOKEN", "POSTMARK_FROM_EMAIL"]
    ),
    gate(
      "storage",
      "Object storage",
      storageConfigured ? "pass" : "warn",
      storageConfigured ? "S3/R2 bucket environment is configured." : "Configure S3/R2 before accepting large imports or artifacts.",
      "engineering",
      "Provision an S3/R2-compatible bucket for portfolio imports and artifacts.",
      ["S3_BUCKET", "R2_BUCKET", "STORAGE_BUCKET"]
    ),
    gate(
      "escrow",
      "Escrow handoff mode",
      escrowMode === "api" ? escrowApiStatus() : escrowMode === "handoff" ? "pass" : "fail",
      escrowMode === "api"
        ? escrowApiDetail()
        : escrowMode === "handoff"
          ? "Escrow handoff mode is configured."
          : "Set ESCROW_MODE to handoff or api.",
      "operations",
      "Confirm Escrow.com account workflow and add API credentials only when API mode is selected.",
      ["ESCROW_MODE", "ESCROW_API_KEY", "ESCROW_API_EMAIL"]
    ),
    gate(
      "search",
      "Search engine",
      searchProvider === "postgres" || process.env.SEARCH_INDEX_URL ? "pass" : "warn",
      searchProvider === "postgres"
        ? "Postgres search is active by default."
        : "Remote search provider selected; confirm SEARCH_INDEX_URL and API key before launch.",
      "engineering",
      "Keep Postgres search for launch or configure the selected external index.",
      ["SEARCH_INDEX_PROVIDER", "SEARCH_INDEX_URL", "SEARCH_INDEX_API_KEY"]
    ),
    gate(
      "scheduled-alerts",
      "Scheduled alert delivery",
      process.env.CRON_SECRET ? "pass" : "warn",
      process.env.CRON_SECRET
        ? "CRON_SECRET is configured for /api/jobs/alerts/deliver."
        : "Set CRON_SECRET before enabling scheduled alert delivery.",
      "engineering",
      "Set CRON_SECRET and configure the scheduler to call alert delivery.",
      ["CRON_SECRET"]
    ),
    gate(
      "ai-provider",
      "AI provider",
      process.env.OPENAI_API_KEY || process.env.AI_PROVIDER_MODE === "local" ? "pass" : "warn",
      process.env.OPENAI_API_KEY
        ? "OPENAI_API_KEY is configured for guarded AI workflows."
        : "AI workflows are running in local deterministic mode.",
      "engineering",
      "Set AI provider credentials for production appraisal and copilot workflows.",
      ["OPENAI_API_KEY", "AI_PROVIDER_MODE"]
    ),
    gate(
      "legal-docs",
      "Legal documents",
      process.env.LEGAL_DOCS_APPROVED === "true" ? "pass" : "warn",
      process.env.LEGAL_DOCS_APPROVED === "true"
        ? "Legal launch flag is approved."
        : "Set LEGAL_DOCS_APPROVED=true only after counsel approves launch policies.",
      "legal",
      "Get counsel signoff on marketplace policies before setting the launch flag.",
      ["LEGAL_DOCS_APPROVED"]
    )
  ];
}

function gate(
  id: string,
  label: string,
  status: LaunchGate["status"],
  detail: string,
  owner?: LaunchGate["owner"],
  action?: string,
  envVars?: string[]
): LaunchGate {
  return { id, label, status, detail, owner, action, envVars };
}

function escrowApiStatus(): LaunchGate["status"] {
  return process.env.ESCROW_API_KEY && process.env.ESCROW_API_EMAIL ? "pass" : "warn";
}

function escrowApiDetail() {
  return process.env.ESCROW_API_KEY && process.env.ESCROW_API_EMAIL
    ? "Escrow API mode and credentials are configured."
    : "Escrow API mode is selected; add ESCROW_API_KEY and ESCROW_API_EMAIL.";
}
