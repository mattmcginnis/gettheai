# GetThe Auth Strategy

## Private Beta Decision

Use Clerk for private beta and early revenue while keeping GetThe-owned authorization, verification, and audit records in Postgres.

The beta auth boundary is:

- Clerk owns signup, login, password reset, email verification, session security, MFA, and recovery flows.
- GetThe owns marketplace roles, seller verification tiers, transaction eligibility, admin permissions, and audit events.
- Local auth fallback remains a development-only scaffold and must stay disabled in production.
- First-party auth can replace Clerk later because the app already stores `User`, `role`, `verificationTier`, `twoFactorEnabled`, and audit records independently of Clerk UI.

## Why This Direction

The marketplace has fraud-sensitive actions before it has user scale: seller inventory, offers, Escrow.com handoffs, admin overrides, and support interventions. Clerk keeps the launch surface smaller while the business is still proving inventory and transaction demand.

## Revisit Criteria

Revisit first-party auth after at least one of these is true:

- Clerk cost materially exceeds the engineering cost of a secure replacement.
- Product needs require auth flows Clerk cannot support cleanly.
- The team has bandwidth for password storage, email verification, reset tokens, session revocation, MFA recovery, rate limits, abuse monitoring, and regression tests.

Until then, optimize cost elsewhere first: Postgres search by default, local AI until paid model value is proven, and R2/Postmark free tiers for early testing.
