# GetThe Domain Marketplace

AI-enabled domain marketplace for the GetThe Network. The app uses `getthe.com` as the canonical marketplace, with `getthe.ai` and `getthe.org` as TLD-specific entry fronts over the same backend, inventory, account model, and transaction flow.

## What Is Implemented

- Next.js App Router, TypeScript, Tailwind, seeded marketplace data, and responsive UI.
- Canonical marketplace home, `getthe.ai` AI front, `getthe.org` mission-driven .org front.
- Domain search, listing detail pages, appraisal workbench, buyer desk, seller dashboard, admin operations, legal/security pages, sign-in/sign-up/security screens.
- Public API handlers for appraisal, domain search, listing creation, offers, Escrow.com transaction handoff, escrow webhooks, portfolio import, and admin review.
- Prisma/Postgres schema, generated Prisma client, repository layer, and seed script for persisted production data.
- Clerk-ready provider/auth screens, middleware, role/2FA route enforcement, Clerk-to-Postgres user sync, and local mock auth fallback when Clerk keys are absent.
- Deterministic local AI appraisal engine with comparable sales, confidence scoring, keyword signals, version metadata, and disclaimers.
- Escrow.com handoff/API adapter with failure audit events, status sync, webhook verification, and 7% commission records without holding platform funds.
- Postmark-ready transactional email adapter with local queue fallback.
- Unit tests for appraisal, search, and transaction verification logic.

## Local Development

```bash
npm install
npm run prisma:generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Important Routes

- `/` canonical `getthe.com` marketplace.
- `/ai` `getthe.ai` AI appraisal and intelligence front.
- `/org` `getthe.org` .org-focused acquisition front.
- `/domains` searchable marketplace inventory.
- `/domains/[domain]` listing detail, offer form, and Escrow.com handoff.
- `/appraisal` public AI appraisal lead-gen tool.
- `/seller` seller dashboard with appraisal and CSV portfolio import.
- `/buyer` buyer desk with watchlist and transaction tracking.
- `/admin` trust, review, support, and operating metrics.
- `/transactions/[transactionId]` escrow transaction timeline, parties, payout state, and transfer checklist.
- `/intelligence` marketplace analytics for TLDs, categories, pricing, verification, and keyword signals.
- `/security` 2FA, verification, ownership, and abuse controls.
- `/legal` policy posture and operations runbooks.

## API Surface

- `POST /appraise` appraises a domain and returns estimates, comparable sales, confidence, and listing CTA.
- `GET /api/domains` searches listings with filters.
- `POST /listings` creates a pending listing draft and ownership verification record. Requires `x-getthe-role: seller` or `admin` in this local scaffold.
- `POST /listings/[listingId]/verify` verifies seller ownership through DNS, nameserver, registrar, or manual review.
- `POST /offers` creates a verified buyer offer and enforces tiered verification.
- `POST /offers/[offerId]/decision` lets sellers/admins accept, reject, or counter an offer.
- `POST /transactions` creates an Escrow.com handoff transaction and 7% commission record.
- `POST /transactions/[transactionId]/operations` lets admins update transaction status, transfer checklist items, and operation notes.
- `POST /webhooks/escrow` maps Escrow.com events into internal transaction status.
- `GET /api/auth/me` returns the current local or Clerk-backed auth session.
- `GET /api/health` reports DB, search, escrow, AI, and storage integration modes.
- `POST /imports/portfolio` accepts CSV portfolio rows and routes invalid or low-price rows to review.
- `POST /storage/upload` stores seller/admin evidence files locally or in S3/R2.
- `POST /watchlist` saves a domain to a buyer watchlist.
- `POST /search-alerts` creates buyer search alerts for matched inventory.
- `GET /support` lists persisted support cases for admins.
- `POST /support` opens a support case with an AI copilot draft.
- `GET /api/metrics` returns admin-only marketplace metrics.
- `GET /admin/operations` returns users, listings, offers, transactions, and audit events for admin tooling.
- `POST /admin/actions` records manual admin listing, seller verification, offer cancellation, support, and transaction dispute interventions.
- `POST /admin/review` records admin review actions. Requires `x-getthe-role: admin` in this local scaffold.
- `POST /admin/search/sync` indexes active listings into Meilisearch/Typesense only when an external provider is explicitly enabled; Postgres search is the default.
- `POST /admin/escrow/sync` pulls Escrow.com transaction status into the internal timeline when API credentials are configured.
- `POST /admin/moderation/scan` creates moderation flags for trademark, ownership, policy, and pricing risks.
- `POST /ai/outreach` creates an AI outreach draft that requires human approval.
- `POST /ai/outreach/approve` sends approved outreach through Postmark or local email fallback.

## Database Setup

The app runs without `DATABASE_URL` by falling back to seeded in-memory data. To use real persistence:

```bash
cp .env.example .env
# edit DATABASE_URL to point at Postgres
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

When `DATABASE_URL` is present, search, listing creation, offer creation, transactions, portfolio imports, and admin audit events use Prisma/Postgres.

## Local Infrastructure

Docker Compose can run the production-shaped local stack:

```bash
npm run infra:up
DATABASE_URL="postgresql://getthe:getthe@localhost:55432/getthe" npm run prisma:migrate
DATABASE_URL="postgresql://getthe:getthe@localhost:55432/getthe" npm run prisma:seed
DATABASE_URL="postgresql://getthe:getthe@localhost:55432/getthe" npm run db:smoke
DATABASE_URL="postgresql://getthe:getthe@localhost:55432/getthe" npm run db:cleanup
STAGING_BASE_URL="http://localhost:3000" npm run staging:smoke
SEARCH_INDEX_PROVIDER="postgres" npm run dev
```

The default `infra:up` script starts Postgres only. Run `npm run infra:search` when you intentionally want to test a Meilisearch-backed index. The `app` service is also defined for containerized preview, but running migrations before starting the app is still recommended.

## E2E And Preview Deploys

Browser workflow coverage is available through Playwright:

```bash
npx playwright install
npm run test:e2e
```

Preview deployment scaffolding is included through `vercel.json` and `.github/workflows/preview.yml`. Configure these repository secrets to enable automated Vercel preview deploys:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Manual preview commands:

```bash
npm run preview:verify-env
npm run preview:pull
npm run preview:build
npm run preview:deploy
```

CI runs in `.github/workflows/ci.yml` with Postgres, Prisma migrations, unit tests, build, smoke data, cleanup, and Chromium Playwright coverage. Staging deploys use `.github/workflows/staging.yml` plus the checklist in [staging deployment](docs/staging-deployment.md).

After a staging deploy, run:

```bash
STAGING_BASE_URL="https://staging.getthe.com" npm run staging:smoke
```

## Production Integration Points

- Clerk: set Clerk keys to render Clerk auth components and enable Clerk middleware. Roles are read from session claims or metadata (`role`) and privileged seller/admin routes require a 2FA/MFA signal before access. Local role headers are ignored once Clerk keys are configured unless `ALLOW_LOCAL_AUTH_FALLBACK=true`.
- Postgres/Prisma: set `DATABASE_URL`, run `npm run prisma:migrate`, and seed with `npm run prisma:seed`.
- Search: marketplace search uses Postgres by default for keyword, TLD, price, category, length, traffic, confidence, listing type, and sort filters. Set `SEARCH_INDEX_PROVIDER=meilisearch` or `SEARCH_INDEX_PROVIDER=typesense` only after an external index is intentionally provisioned; `POST /admin/search/sync` is a no-op in Postgres mode and syncs active listings in external modes.
- Storage: configure S3/R2-compatible settings to store imports, ownership evidence, reports, and review artifacts.
- Escrow.com: set `ESCROW_API_EMAIL`, `ESCROW_API_KEY`, and `ESCROW_MODE=api` to use authenticated transaction creation and admin status sync. Webhooks support HMAC verification via `ESCROW_WEBHOOK_SECRET`.
- Postmark: set `POSTMARK_SERVER_TOKEN` to send transactional email for offers, counters, escrow status, verification, and support.
- AI provider: set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL` to route guarded draft/appraisal workflows through the OpenAI Responses API while preserving audit metadata.

## Private Beta Controls

- Write requests are same-origin checked and rate-limited by path/IP in middleware.
- Middleware adds request IDs, frame, content-type, referrer, and permissions security headers.
- Escrow.com webhooks use HMAC verification when `ESCROW_WEBHOOK_SECRET` is set and reject stale timestamps plus duplicate signatures inside the replay window.
- Admin operations expose compact user, listing, offer, transaction, support, and audit snapshots for beta monitoring.
- Manual admin actions are audited for listing status changes, seller verification, offer cancellation, support escalation, and transaction disputes.
- `npm run preview:verify-env` reports missing launch credentials; set `REQUIRE_PRODUCTION_SECRETS=true` in CI to fail hard.

## Operator Docs

- [Private beta runbook](docs/private-beta-runbook.md)
- [Provider setup](docs/provider-setup.md)
- [Auth strategy](docs/auth-strategy.md)
- [Staging deployment](docs/staging-deployment.md)
- [Inventory import](docs/inventory-import.md)
- [Private beta launch checklist](docs/private-beta-launch-checklist.md)

## Verification Completed

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run test:e2e:list`
- `npm run build`
- Local smoke tests for `/`, `/api/domains?q=agent`, `POST /appraise`, `POST /transactions`, `POST /offers`, `POST /offers/[offerId]/decision`, `POST /listings`, `POST /listings/[listingId]/verify`, `POST /watchlist`, `POST /search-alerts`, `POST /support`, `POST /admin/moderation/scan`, `POST /ai/outreach`, `POST /webhooks/escrow`, `POST /auth/sign-up`, and `POST /auth/password-reset`
