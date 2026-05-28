# GetThe Provider Setup

## Clerk

- Private beta decision: use Clerk for hosted auth and MFA. See `docs/auth-strategy.md`.
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

- Default launch mode is `SEARCH_INDEX_PROVIDER=postgres`, which requires no managed search service.
- Postgres search covers marketplace keyword, TLD, price, category, length, traffic, confidence, listing type, and sort filters.
- Meilisearch: set `SEARCH_INDEX_PROVIDER=meilisearch`, `MEILISEARCH_HOST`, and `MEILISEARCH_API_KEY`.
- Typesense: set `SEARCH_INDEX_PROVIDER=typesense`, `TYPESENSE_HOST`, and `TYPESENSE_API_KEY`.
- Run `POST /admin/search/sync` after seed, imports, or bulk listing edits only when an external provider is enabled.

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

## Staging

- Use `.env.staging.example` as the provider checklist.
- Configure the GitHub `staging` environment secrets documented in `docs/staging-deployment.md`.
- Run the `Staging Deploy` workflow after migrations and provider sandbox credentials are ready.
