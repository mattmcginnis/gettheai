# Inventory Import

## CSV Fields

Use these headers for owned inventory or seller portfolio migrations:

```csv
domain,price,minimum offer,registrar,category
examplebrand.com,7200,5000,Namecheap,SaaS
missionname.org,3100,1900,Porkbun,Nonprofit
```

## Review Rules

- Domains must pass basic domain validation.
- Launch inventory should stay in the mid-tier target range, with a $500 floor.
- Accepted rows create pending-verification listings.
- Review rows remain visible in the seller import workbench with a reason.
- Sellers still need ownership verification before listings are active.

## Local Flow

1. Sign in as a seller.
2. Open `/seller`.
3. Paste CSV into Portfolio import.
4. Review accepted and needs-review rows.
5. Verify ownership using DNS TXT, nameserver, registrar, or manual review.

## Staging Flow

1. Run `POST /admin/search/sync` after bulk imports.
2. Confirm accepted listings appear in `/admin/listings`.
3. Run moderation scan from `/admin`.
4. Archive or flag trademark-risk rows before launch.
