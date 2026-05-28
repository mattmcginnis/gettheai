# GetThe Private Beta Runbook

## Escrow Handoff Failure

1. Open `/admin` and check recent `escrow.handoff.failed` audit events.
2. Confirm `ESCROW_MODE`, `ESCROW_API_EMAIL`, `ESCROW_API_KEY`, and `ESCROW_API_BASE_URL`.
3. If the API is unavailable, set `ESCROW_MODE=handoff` and restart the app.
4. Create or resend the Escrow.com handoff link from the transaction record.
5. Add an admin dispute note if the buyer or seller has already acted on the failed transaction.

## Transfer Dispute

1. Mark the transaction with `/admin/actions` using `transaction_dispute`.
2. Capture registrar, auth-code, funding, and transfer evidence in the support case.
3. Move the support case to `escalated`.
4. Keep the buyer and seller inside Escrow.com until the dispute closes.
5. Record final outcome in the transaction timeline and support notes.

## Trademark Complaint

1. Flag the listing with `/admin/actions` using `listing_status=flagged`.
2. Ask the complainant for trademark registration, jurisdiction, and claimed confusion.
3. Ask the seller for ownership and good-faith use evidence.
4. Archive the listing if the complaint is credible or counsel recommends removal.
5. Keep the AI appraisal disclaimer and moderation audit event attached to the record.

## Suspicious Account

1. Confirm the account has email verification and required 2FA.
2. Review offers, listings, support cases, and audit events for linked activity.
3. Cancel suspicious offers with `/admin/actions` using `offer_cancel`.
4. Flag affected listings and open support cases for counterparties.
5. Require stronger verification before reactivation.

## Search Or Provider Outage

1. Check `/api/health` for `search`, `escrow`, `email`, `storage`, and `ai` modes.
2. If Meilisearch/Typesense is down, search falls back to Postgres filtering.
3. Run `POST /admin/search/sync` after the search provider recovers.
4. Keep Escrow.com in handoff mode if API transaction creation is degraded.

## Deploy Rollback

1. Stop incoming beta writes if transaction behavior is affected.
2. Roll back the Vercel deployment or redeploy the previous known-good commit.
3. Run `npm run preview:verify-env`.
4. Run smoke checks against `/`, `/api/health`, `/api/domains`, `/appraise`, and `/admin`.
5. Record the rollback reason in the release notes.

## Credential Rotation

1. Rotate Clerk, Escrow.com, Postmark, storage, search, and AI keys in the provider console.
2. Update environment variables in Vercel and local `.env` files.
3. Restart app processes and run `npm run preview:verify-env`.
4. Send a signed test Escrow.com webhook with a fresh timestamp.
5. Confirm no old credentials remain in CI, Docker, or deployment settings.
