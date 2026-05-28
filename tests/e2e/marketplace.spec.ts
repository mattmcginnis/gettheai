import { expect, test } from "@playwright/test";

test("buyer can discover, appraise, watch, alert, and request support", async ({ page, request }, testInfo) => {
  const buyerEmail = `buyer+${testInfo.project.name}-${Date.now()}@example.com`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "GetThe Domain Marketplace" })).toBeVisible();

  const listings = await request.get("/api/domains?q=modeldock");
  expect(listings.ok()).toBeTruthy();
  const listingBody = await listings.json();
  const targetListing = listingBody.results[0];
  expect(targetListing).toBeTruthy();

  await page.goto(`/domains/${targetListing.domain}`);
  await expect(page.getByRole("heading", { name: targetListing.domain })).toBeVisible();
  await expect(page.getByRole("button", { name: /Make offer/i })).toBeVisible();

  const appraisal = await request.post("/appraise", {
    data: { domain: targetListing.domain }
  });
  expect(appraisal.ok()).toBeTruthy();
  await expect(appraisal).resolves;
  expect((await appraisal.json()).appraisal.confidence).toBeGreaterThan(50);

  const offer = await request.post("/offers", {
    data: {
      listingId: targetListing.id,
      buyerEmail,
      amount: Math.max(targetListing.minimumOffer, 7000),
      buyerVerificationTier: "escrow_intent"
    }
  });
  expect(offer.ok()).toBeTruthy();

  const transaction = await request.post("/transactions", {
    data: {
      listingId: targetListing.id,
      buyerEmail,
      amount: targetListing.price
    }
  });
  expect(transaction.ok()).toBeTruthy();
  const transactionBody = await transaction.json();
  expect(transactionBody.transaction.status).toBe("escrow_started");

  const watchlist = await request.post("/watchlist", {
    headers: { "x-getthe-role": "buyer" },
    data: {
      userEmail: buyerEmail,
      listingId: targetListing.id
    }
  });
  expect(watchlist.ok()).toBeTruthy();

  const alert = await request.post("/search-alerts", {
    headers: { "x-getthe-role": "buyer" },
    data: {
      userEmail: buyerEmail,
      name: "AI domains",
      filters: { q: "ai" },
      cadence: "weekly"
    }
  });
  expect(alert.ok()).toBeTruthy();

  const support = await request.post("/support", {
    headers: { "x-getthe-role": "buyer" },
    data: {
      requesterEmail: buyerEmail,
      subject: "Transfer status",
      context: "Buyer funded escrow and needs the next step."
    }
  });
  expect(support.ok()).toBeTruthy();

  const dispute = await request.post("/admin/actions", {
    headers: { "x-getthe-role": "admin" },
    data: {
      action: "transaction_dispute",
      transactionId: transactionBody.transaction.id,
      actorEmail: "admin@getthe.com",
      note: "Playwright transaction dispute note."
    }
  });
  expect(dispute.ok()).toBeTruthy();

  const operation = await request.post(`/transactions/${transactionBody.transaction.id}/operations`, {
    headers: { "x-getthe-role": "admin" },
    data: {
      status: "buyer_funded",
      checklistUpdates: [{ index: 0, done: true }],
      actorEmail: "admin@getthe.com",
      note: "Playwright buyer funding verified."
    }
  });
  expect(operation.ok()).toBeTruthy();

  const adminDetail = await request.get(`/admin/transactions/${transactionBody.transaction.id}`, {
    headers: { "x-getthe-role": "admin" }
  });
  expect(adminDetail.ok()).toBeTruthy();

  await page.goto(`/transactions/${transactionBody.transaction.id}`);
  await expect(page.getByRole("heading", { name: "Admin operations" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync escrow" })).toBeVisible();

  await page.goto(`/admin/transactions/${transactionBody.transaction.id}`);
  await expect(page.getByRole("heading", { name: `${targetListing.domain} transaction` })).toBeVisible();
  await expect(page.getByText("statusTimeline")).toBeVisible();
});

test("seller/admin workflow creates listing, verifies ownership, scans, and drafts outreach", async ({ page, request }, testInfo) => {
  const sellerEmail = `seller+${testInfo.project.name}-${Date.now()}@example.com`;

  await page.goto("/seller");
  await expect(page.getByRole("heading", { name: "Seller dashboard" })).toBeVisible();

  const listing = await request.post("/listings", {
    headers: { "x-getthe-role": "seller" },
    data: {
      domain: `playwright-${testInfo.project.name}-${Date.now()}.com`,
      price: 7200,
      minimumOffer: 5000,
      registrar: "Namecheap",
      category: "SaaS"
    }
  });
  expect(listing.ok()).toBeTruthy();
  const listingBody = await listing.json();

  const verification = await request.post(`/listings/${listingBody.listing.id}/verify`, {
    headers: { "x-getthe-role": "seller" },
    data: {
      method: "manual",
      actorEmail: "seller@getthe.com"
    }
  });
  expect(verification.ok()).toBeTruthy();

  const moderation = await request.post("/admin/moderation/scan", {
    headers: { "x-getthe-role": "admin" },
    data: { actorEmail: "admin@getthe.com" }
  });
  expect(moderation.ok()).toBeTruthy();

  const action = await request.post("/admin/actions", {
    headers: { "x-getthe-role": "admin" },
    data: {
      action: "listing_status",
      listingId: listingBody.listing.id,
      status: "flagged",
      actorEmail: "admin@getthe.com",
      note: "Playwright listing status review."
    }
  });
  expect(action.ok()).toBeTruthy();

  const sellerVerification = await request.post("/admin/actions", {
    headers: { "x-getthe-role": "admin" },
    data: {
      action: "seller_verification",
      sellerEmail,
      verificationTier: "two_factor",
      actorEmail: "admin@getthe.com",
      note: "Playwright seller verification."
    }
  });
  expect(sellerVerification.ok()).toBeTruthy();

  const outreach = await request.post("/ai/outreach", {
    headers: { "x-getthe-role": "seller" },
    data: {
      listingId: listingBody.listing.id,
      targetCompany: "AI Infrastructure Labs",
      targetEmail: "founder@example.com",
      context: "Relevant AI tooling buyer.",
      actorEmail: "seller@getthe.com"
    }
  });
  expect(outreach.ok()).toBeTruthy();
  expect((await outreach.json()).outreachDraft.requiresHumanApproval).toBe(true);

  await page.goto(`/admin/listings/${listingBody.listing.id}`);
  await expect(page.getByRole("heading", { name: listingBody.listing.domain })).toBeVisible();
});
