# Private Beta Launch Checklist

## Identity And Access

- Clerk keys are configured in staging and production.
- Seller and admin MFA is enforced.
- Local auth fallback is disabled outside local development.
- Admin pages and APIs are verified behind RBAC.

## Marketplace Workflows

- Seeded inventory is indexed into search.
- Seller listing creation and ownership verification are tested.
- Buyer offer, watchlist, alert, and support flows are tested.
- Transaction handoff and admin transaction operations are tested.

## Trust And Compliance

- Marketplace policies have counsel review.
- Trademark complaint and takedown workflow is documented.
- Escrow.com handoff or API credentials are validated.
- GetThe does not store buyer or seller funds.

## Operations

- Postmark, search, storage, and AI provider modes are verified.
- `npm run staging:smoke` passes against staging.
- Runbooks are available to admins.
- Audit events are visible from admin observability.
