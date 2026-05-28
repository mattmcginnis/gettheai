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
      clerkConfigured ? "pass" : "warn",
      clerkConfigured ? "Clerk keys are configured." : "Local auth fallback is available for development only."
    ),
    gate(
      "seller-2fa",
      "Seller and admin 2FA",
      clerkConfigured && !localAuthEnabled ? "pass" : "warn",
      clerkConfigured && !localAuthEnabled
        ? "2FA enforcement can rely on Clerk session state."
        : "Disable local auth fallback before public launch and enforce MFA in Clerk."
    ),
    gate(
      "database",
      "Postgres source of truth",
      process.env.DATABASE_URL ? "pass" : "fail",
      process.env.DATABASE_URL ? "DATABASE_URL is configured." : "Set DATABASE_URL and run migrations before launch."
    ),
    gate(
      "app-url",
      "Canonical app URL",
      appUrl ? "pass" : "warn",
      appUrl ? `App URL is configured as ${appUrl}.` : "Set NEXT_PUBLIC_APP_URL for canonical links, emails, and jobs."
    ),
    gate(
      "email",
      "Transactional email",
      process.env.POSTMARK_SERVER_TOKEN ? "pass" : "warn",
      process.env.POSTMARK_SERVER_TOKEN ? "Postmark token is configured." : "Postmark is using local queue mode."
    ),
    gate(
      "storage",
      "Object storage",
      storageConfigured ? "pass" : "warn",
      storageConfigured ? "S3/R2 bucket environment is configured." : "Configure S3/R2 before accepting large imports or artifacts."
    ),
    gate(
      "escrow",
      "Escrow handoff mode",
      escrowMode === "api" ? escrowApiStatus() : escrowMode === "handoff" ? "pass" : "fail",
      escrowMode === "api"
        ? escrowApiDetail()
        : escrowMode === "handoff"
          ? "Escrow handoff mode is configured."
          : "Set ESCROW_MODE to handoff or api."
    ),
    gate(
      "search",
      "Search engine",
      searchProvider === "postgres" || process.env.SEARCH_INDEX_URL ? "pass" : "warn",
      searchProvider === "postgres"
        ? "Postgres search is active by default."
        : "Remote search provider selected; confirm SEARCH_INDEX_URL and API key before launch."
    ),
    gate(
      "scheduled-alerts",
      "Scheduled alert delivery",
      process.env.CRON_SECRET ? "pass" : "warn",
      process.env.CRON_SECRET
        ? "CRON_SECRET is configured for /api/jobs/alerts/deliver."
        : "Set CRON_SECRET before enabling scheduled alert delivery."
    ),
    gate(
      "ai-provider",
      "AI provider",
      process.env.OPENAI_API_KEY || process.env.AI_PROVIDER_MODE === "local" ? "pass" : "warn",
      process.env.OPENAI_API_KEY
        ? "OPENAI_API_KEY is configured for guarded AI workflows."
        : "AI workflows are running in local deterministic mode."
    ),
    gate(
      "legal-docs",
      "Legal documents",
      process.env.LEGAL_DOCS_APPROVED === "true" ? "pass" : "warn",
      process.env.LEGAL_DOCS_APPROVED === "true"
        ? "Legal launch flag is approved."
        : "Set LEGAL_DOCS_APPROVED=true only after counsel approves launch policies."
    )
  ];
}

function gate(id: string, label: string, status: LaunchGate["status"], detail: string): LaunchGate {
  return { id, label, status, detail };
}

function escrowApiStatus(): LaunchGate["status"] {
  return process.env.ESCROW_API_KEY && process.env.ESCROW_API_EMAIL ? "pass" : "warn";
}

function escrowApiDetail() {
  return process.env.ESCROW_API_KEY && process.env.ESCROW_API_EMAIL
    ? "Escrow API mode and credentials are configured."
    : "Escrow API mode is selected; add ESCROW_API_KEY and ESCROW_API_EMAIL.";
}
