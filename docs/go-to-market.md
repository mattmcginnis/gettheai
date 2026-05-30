# GetThe — Go-To-Market & Cold-Start Playbook

> Source of truth for the launch motion behind `getthe.com`. Aligned to the
> viability report (March 2026): launch lean, solo-founder, 5–8% commission,
> Escrow.com handoff, AI appraisal as the free lead magnet. The report names
> **marketplace cold-start** and **slow revenue ramp** as the two existential
> risks; everything here exists to attack those two.

## 1. The cold-start problem (the #1 risk)

A two-sided marketplace with no listings has no buyers, and with no buyers has
no sellers. We break the loop **supply-first**, because domain supply is
acquirable without network effects (we can seed it ourselves) while demand is
not.

### Seeding target (report mandate: 50–100 domains)

| Milestone | Inventory | Source |
|-----------|-----------|--------|
| Private beta | 50 hand-picked `.com`/`.ai` names | Founder's own portfolio + cheap aftermarket buys |
| Public soft-launch | 100–150 | Above + 5–10 invited sellers with quality portfolios |
| Validated | 300+ | Inbound seller signups once SEO + first sales land |

Seeding workflow (see `docs/inventory-import.md` and the admin importer):
1. Bulk CSV import → `lib/imports.ts`.
2. Auto-appraise each via `lib/appraisal.ts` (free AI estimate = the listing's hook).
3. Ownership-verify via `lib/ownership-verification.ts`.
4. Activate (DRAFT → PENDING_VERIFICATION → ACTIVE) through the state machine.

### Seed budget (illustrative, founder-funded)

- Aftermarket acquisition: $50–150/name × 50 = **$2.5k–7.5k** one-time.
- Only buy names that pass the appraisal floor (confidence ≥ 60, brandable).
- Treat as inventory, not expense: each is resellable at the 7% take.

## 2. SEO engine (the durable demand channel)

Per-domain landing pages are the cold-start demand flywheel: every listing is a
long-tail page that can rank for `[domain] for sale` and `buy [domain]`.

Implementation checklist (Phase 1, code):
- [ ] `generateMetadata` (title / description / canonical) on `app/domains/[domain]` and `app/park/[domain]`.
- [ ] JSON-LD `Product` + `Offer` structured data on each listing + parked page.
- [ ] Dynamic `app/sitemap.ts` enumerating ACTIVE listings via the search layer.
- [ ] `app/robots.ts` pointing at the sitemap, disallowing auth/admin/api paths.
- [ ] Funnel instrumentation (appraisal→list, search→detail, detail→offer, offer→escrow→close) surfaced on `app/admin/analytics`.

Targets:
- Each listing page: unique title `Buy {domain} — {category} domain | GetThe`,
  meta description from the appraisal summary, canonical to `getthe.com`.
- Parked pages (`/park/[domain]`) capture inbound type-in traffic and convert it
  to inquiries.

## 3. Direct channels (manual, founder-led, while SEO compounds)

1. **NamePros / forum presence.** Establish a seller account; list flagship
   names; participate honestly. This is where domain buyers already are.
2. **Targeted Google Ads.** Bid on high-intent `[keyword] domain for sale`
   queries pointing at specific listing pages. Cap spend; kill non-converting
   keywords weekly. Measure CAC against the 7% take per sale.
3. **Cold outreach (approval-gated).** Use the buyer-matching service
   (`lib/buyer-matching.ts`, Phase 1) to rank likely buyers for each listing from
   watchlist/search-alert/keyword signals, then send the approval-gated AI
   outreach draft (`app/ai/outreach`). Never auto-send; founder approves each.

## 4. Revenue ramp (the #2 risk)

- Commission: **7%** (`COMMISSION_RATE`), inside the report's 5–8% band, taken on
  close via Escrow.com handoff — we never hold funds.
- Secondary stream (report Phase 1, currently deferred): **domain parking
  revenue** on `/park/[domain]` pages.
- Break-even is per-sale, not per-month: one $10k sale = $700. Model the ramp on
  *number of closes*, not MRR.

## 5. Funnel metrics to watch (already instrumented via `lib/analytics.ts`)

| Stage | Event | Health signal |
|-------|-------|---------------|
| Appraise → List | `appraisalToListingRate` | Are appraisals converting to listings? |
| Search → Detail | `searchToDetailRate` | Is search surfacing relevant inventory? |
| Detail → Offer | `offerRate` | Are listing pages persuasive/priced right? |
| Offer → Escrow | `escrowStartRate` | Are offers turning into real transactions? |
| Escrow → Close | `completedGmv` / `failedHandoffCount` | Is the handoff actually closing? |

Review weekly on `app/admin/analytics`. The single most important early number is
**Detail → Offer**: it tells you whether the SEO traffic you're buying/earning is
the right traffic.

## 6. Sequencing

1. Seed 50 names + verify + activate.
2. Ship the SEO engine (metadata/JSON-LD/sitemap/robots) so inventory is
   crawlable from day one.
3. Turn on direct channels (forum + a small Ads budget) to prime demand while
   SEO indexes.
4. Use buyer-matching outreach to close the first handful of sales manually.
5. Reinvest commission into more inventory; let inbound seller signups take over
   supply once the first sales validate the take rate.
