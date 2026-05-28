const assert = require("node:assert/strict");

const baseUrl = (process.env.STAGING_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const adminHeaders = {
  "content-type": "application/json",
  "x-getthe-role": "admin",
  "x-getthe-email": process.env.STAGING_ADMIN_EMAIL ?? "admin@getthe.com"
};
const sellerHeaders = {
  "content-type": "application/json",
  "x-getthe-role": "seller",
  "x-getthe-email": process.env.STAGING_SELLER_EMAIL ?? "seller@getthe.com"
};

async function main() {
  const suffix = Date.now();
  const buyerEmail = `buyer+staging-${suffix}@example.com`;
  const sellerEmail = `seller+staging-${suffix}@example.com`;
  const domain = `staging-smoke-${suffix}.com`;

  const health = await getJson("/api/health");
  assert.equal(health.ok, true, "health check failed");

  const domains = await getJson("/api/domains?q=modeldock");
  assert.ok(Array.isArray(domains.results), "domain search did not return results");
  const targetListing = domains.results[0];
  assert.ok(targetListing?.id, "seeded target listing missing");

  const appraisal = await postJson("/appraise", { domain: targetListing.domain });
  assert.ok(appraisal.appraisal.confidence > 50, "appraisal confidence too low");

  const offer = await postJson("/offers", {
    listingId: targetListing.id,
    buyerEmail,
    amount: Math.max(targetListing.minimumOffer, 7000),
    buyerVerificationTier: "escrow_intent"
  });
  assert.ok(offer.offer.id, "offer not created");

  const transaction = await postJson("/transactions", {
    listingId: targetListing.id,
    buyerEmail,
    amount: targetListing.price
  });
  assert.ok(transaction.transaction.id, "transaction not created");

  const operation = await postJson(
    `/transactions/${transaction.transaction.id}/operations`,
    {
      status: "buyer_funded",
      checklistUpdates: [{ index: 0, done: true }],
      actorEmail: adminHeaders["x-getthe-email"],
      note: "Staging smoke buyer funding check."
    },
    adminHeaders
  );
  assert.equal(operation.transaction.status, "buyer_funded", "transaction operation did not update status");

  const listing = await postJson(
    "/listings",
    {
      domain,
      price: 7200,
      minimumOffer: 5000,
      registrar: "Namecheap",
      category: "Staging"
    },
    sellerHeaders
  );
  assert.ok(listing.listing.id, "listing not created");

  const verification = await postJson(
    `/listings/${listing.listing.id}/verify`,
    {
      method: "manual",
      actorEmail: sellerHeaders["x-getthe-email"]
    },
    sellerHeaders
  );
  assert.equal(verification.listing.ownershipVerified, true, "listing ownership not verified");

  const sellerVerification = await postJson(
    "/admin/actions",
    {
      action: "seller_verification",
      sellerEmail,
      verificationTier: "two_factor",
      actorEmail: adminHeaders["x-getthe-email"],
      note: "Staging smoke seller verification."
    },
    adminHeaders
  );
  assert.equal(sellerVerification.action, "seller_verification", "seller verification action failed");

  const adminDetail = await fetchJson(`/admin/transactions/${transaction.transaction.id}`, {
    headers: adminHeaders
  });
  assert.equal(adminDetail.status, 200, "admin transaction detail did not render");

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        health,
        offerId: offer.offer.id,
        transactionId: transaction.transaction.id,
        listingId: listing.listing.id,
        domain
      },
      null,
      2
    )
  );
}

async function getJson(path) {
  return fetchJson(path).then((response) => response.json);
}

async function postJson(path, body, headers = { "content-type": "application/json" }) {
  return fetchJson(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  }).then((response) => response.json);
}

async function fetchJson(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const contentType = response.headers.get("content-type") ?? "";
  const json = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${response.status} ${JSON.stringify(json)}`);
  }

  return { status: response.status, json };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
