# GetThe Domain Marketplace

AI-enabled domain marketplace for the GetThe Network. The app uses `getthe.com` as the canonical marketplace, with `getthe.ai` and `getthe.org` as TLD-specific entry fronts over the same backend, inventory, account model, and transaction flow.

## What Is Implemented

- Next.js App Router, TypeScript, Tailwind, seeded marketplace data, and responsive UI.
- Canonical marketplace home, `getthe.ai` AI front, `getthe.org` mission-driven .org front.
- Domain search, listing detail pages, appraisal workbench, buyer desk, seller dashboard, admin operations, legal/security pages, sign-in/sign-up/security screens.
- Public API handlers for appraisal, domain search, listing creation, offers, Escrow.com transaction handoff, escrow webhooks, portfolio import, and admin review.
- Prisma/Postgres schema, generated Prisma client, repository layer, and seed script for persisted production data.
- Clerk-ready provider/auth screens with local mock auth fallback when Clerk keys are absent.
- Deterministic local AI appraisal engine with comparable sales, confidence scoring, keyword signals, version metadata, and disclaimers.
- Escrow.com handoff/API adapter that records 7% commission and transaction timeline without holding platform funds.
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
- `POST /webhooks/escrow` maps Escrow.com events into internal transaction status.
- `POST /imports/portfolio` accepts CSV portfolio rows and routes invalid or low-price rows to review.
- `POST /storage/upload` stores seller/admin evidence files locally or in S3/R2.
- `POST /watchlist` saves a domain to a buyer watchlist.
- `POST /search-alerts` creates buyer search alerts for matched inventory.
- `GET /support` lists persisted support cases for admins.
- `POST /support` opens a support case with an AI copilot draft.
- `POST /admin/review` records admin review actions. Requires `x-getthe-role: admin` in this local scaffold.
- `POST /admin/search/sync` indexes active listings into Meilisearch, Typesense, or local no-op mode.

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
docker compose up --build postgres meilisearch
DATABASE_URL="postgresql://getthe:getthe@localhost:5432/getthe" npm run prisma:migrate
DATABASE_URL="postgresql://getthe:getthe@localhost:5432/getthe" npm run prisma:seed
MEILISEARCH_HOST="http://localhost:7700" MEILISEARCH_API_KEY="getthe_dev_master_key" npm run dev
```

The `app` service is also defined for containerized preview, but running migrations before starting the app is still recommended.

## Production Integration Points

- Clerk: set Clerk keys to render Clerk auth components. Local mock auth stays available when keys are absent.
- Postgres/Prisma: set `DATABASE_URL`, run `npm run prisma:migrate`, and seed with `npm run prisma:seed`.
- Search: index `DomainListing` rows into Typesense or Meilisearch and keep Postgres as source of truth.
- Storage: configure S3/R2-compatible settings to store imports, ownership evidence, reports, and review artifacts.
- Escrow.com: set `ESCROW_API_EMAIL`, `ESCROW_API_KEY`, and `ESCROW_MODE=api` to use authenticated transaction creation. Webhooks support HMAC verification via `ESCROW_WEBHOOK_SECRET`.
- Postmark: set `POSTMARK_SERVER_TOKEN` to send transactional email for offers, counters, escrow status, verification, and support.
- AI provider: set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL` to route guarded draft/appraisal workflows through the OpenAI Responses API while preserving audit metadata.

## Verification Completed

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- Local smoke tests for `/`, `/api/domains?q=agent`, `POST /appraise`, `POST /transactions`, `POST /offers`, `POST /offers/[offerId]/decision`, `POST /listings`, `POST /listings/[listingId]/verify`, `POST /watchlist`, `POST /search-alerts`, `POST /support`, `POST /webhooks/escrow`, `POST /auth/sign-up`, and `POST /auth/password-reset`
