# GetThe Staging Deployment

## Goal

Staging should look like production, but use sandbox/provider test accounts and non-production data. It should run with Clerk enabled, local auth fallback disabled, Postgres persistence, search indexing, storage, Postmark, and Escrow.com handoff or sandbox API mode.

## Required GitHub Environment

Create a GitHub environment named `staging` and add these secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_STAGING_PROJECT_ID` or `VERCEL_PROJECT_ID`
- `STAGING_APP_URL`
- `STAGING_DATABASE_URL`
- `STAGING_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `STAGING_CLERK_SECRET_KEY`
- `STAGING_CLERK_WEBHOOK_SECRET`
- `STAGING_ESCROW_API_BASE_URL`
- `STAGING_ESCROW_API_EMAIL`
- `STAGING_ESCROW_API_KEY`
- `STAGING_ESCROW_MODE`
- `STAGING_ESCROW_WEBHOOK_SECRET`
- `STAGING_POSTMARK_SERVER_TOKEN`
- `STAGING_POSTMARK_FROM_EMAIL`
- `STAGING_MEILISEARCH_HOST`
- `STAGING_MEILISEARCH_API_KEY`
- `STAGING_S3_BUCKET`
- `STAGING_S3_REGION`
- `STAGING_S3_ACCESS_KEY_ID`
- `STAGING_S3_SECRET_ACCESS_KEY`

Optional storage secrets:

- `STAGING_S3_ENDPOINT`
- `STAGING_S3_PUBLIC_BASE_URL`

## Deploy Flow

1. Copy `.env.staging.example` into the staging provider/environment.
2. Set `ALLOW_LOCAL_AUTH_FALLBACK=false`.
3. Set `REQUIRE_PRODUCTION_SECRETS=true`.
4. Run the `Staging Deploy` workflow manually or push to the `staging` branch.
5. Confirm `npx prisma migrate deploy` runs before the Vercel build.
6. Run `POST /admin/search/sync` after seed/import changes.
7. Check `/api/health`, `/admin`, `/domains`, `/appraisal`, and one transaction detail page.

## Acceptance

- Clerk auth is active and seller/admin 2FA is enforced.
- Database-backed listing, offer, transaction, support, and audit records persist.
- Meilisearch or configured search provider indexes active listings.
- Postmark/local staging email logs notification events.
- Escrow.com uses handoff mode or sandbox API credentials; GetThe does not hold funds.
- Webhooks require HMAC signatures and fresh timestamps.
- Admin detail pages open for users, listings, offers, transactions, support cases, and audit events.
