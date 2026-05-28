# GetThe Provider Setup

## Clerk

- Configure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
- Store `role` in Clerk public or private metadata as `buyer`, `seller`, or `admin`.
- Require MFA for sellers and admins. The app reads Clerk `amr` and metadata signals.
- Keep `ALLOW_LOCAL_AUTH_FALLBACK` unset in production.

## Postgres And Prisma

- Set `DATABASE_URL`.
- Run `npm run prisma:generate`.
- Run `npm run prisma:migrate`.
- Run `npm run prisma:seed`.
- Use `npm run db:smoke` to verify persisted listing, offer, transaction, support, watchlist, and audit flows.

## Search

- Meilisearch: set `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY`.
- Typesense can be added behind the existing search-index adapter.
- Run `POST /admin/search/sync` after seed, imports, or bulk listing edits.

## Escrow.com

- Launch default: set `ESCROW_MODE=handoff` and do not hold funds.
- API mode: set `ESCROW_MODE=api`, `ESCROW_API_EMAIL`, `ESCROW_API_KEY`, and `ESCROW_API_BASE_URL`.
- Webhooks: set `ESCROW_WEBHOOK_SECRET`; signed webhooks must include `x-escrow-signature` and `x-escrow-timestamp`.
- Keep `ESCROW_WEBHOOK_REPLAY_WINDOW_SECONDS` at `300` unless Escrow.com delivery latency requires more.

## Postmark

- Set `POSTMARK_SERVER_TOKEN`.
- Use tags for transaction, offer, support, and outreach messages.
- Keep external AI outreach behind human approval during v1.

## S3 Or R2 Storage

- Configure S3-compatible endpoint, bucket, access key, secret key, and region.
- Store portfolio imports, verification evidence, reports, and support artifacts.
- Do not store card data or escrow funds artifacts in app storage.

## AI Provider

- Local deterministic AI stays enabled without credentials.
- OpenAI mode: set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL`.
- Log model/version metadata for appraisal, support, outreach, and negotiation drafts.
- Require human approval for legal-sensitive, money-sensitive, and external outreach actions.

## Vercel Preview

- Configure `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`.
- Run `npm run preview:verify-env` before deploys.
- Use `REQUIRE_PRODUCTION_SECRETS=true` in CI when missing provider secrets should fail the build.
