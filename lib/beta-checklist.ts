export const betaChecklist = [
  {
    group: "Identity and access",
    items: [
      "Clerk keys configured in staging and production",
      "Seller and admin MFA enforced",
      "Local auth fallback disabled outside local development",
      "Admin pages and APIs verified behind RBAC"
    ]
  },
  {
    group: "Marketplace workflows",
    items: [
      "Seeded inventory indexed into search",
      "Seller listing creation and ownership verification tested",
      "Buyer offer, watchlist, alert, and support flows tested",
      "Transaction handoff and admin transaction operations tested"
    ]
  },
  {
    group: "Trust and compliance",
    items: [
      "Marketplace policies reviewed by counsel",
      "Trademark complaint and takedown workflow documented",
      "Escrow.com handoff/API credentials validated",
      "No buyer or seller funds stored by GetThe"
    ]
  },
  {
    group: "Operations",
    items: [
      "Postmark, search, storage, and AI provider modes verified",
      "Staging smoke test passes",
      "Runbooks are available to admins",
      "Audit events are visible from admin observability"
    ]
  }
];
