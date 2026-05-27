const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for db:smoke.");
  }

  const suffix = Date.now();
  const domain = `workflow-smoke-${suffix}.com`;
  const seller = await prisma.user.upsert({
    where: { email: "seller@getthe.com" },
    update: {
      role: "SELLER",
      verificationTier: "TWO_FACTOR",
      twoFactorEnabled: true
    },
    create: {
      clerkUserId: "smoke:seller@getthe.com",
      email: "seller@getthe.com",
      displayName: "Smoke Seller",
      role: "SELLER",
      verificationTier: "TWO_FACTOR",
      twoFactorEnabled: true
    }
  });

  await prisma.sellerProfile.upsert({
    where: { userId: seller.id },
    update: {},
    create: {
      userId: seller.id,
      publicName: "Smoke Seller",
      slug: `smoke-seller-${suffix}`
    }
  });

  const buyer = await prisma.user.upsert({
    where: { email: "buyer@getthe.com" },
    update: {
      role: "BUYER",
      verificationTier: "ESCROW_INTENT",
      twoFactorEnabled: true
    },
    create: {
      clerkUserId: "smoke:buyer@getthe.com",
      email: "buyer@getthe.com",
      displayName: "Smoke Buyer",
      role: "BUYER",
      verificationTier: "ESCROW_INTENT",
      twoFactorEnabled: true
    }
  });

  const listing = await prisma.domainListing.create({
    data: {
      sellerId: seller.id,
      domain,
      tld: "com",
      registrar: "Namecheap",
      status: "PENDING_VERIFICATION",
      listingType: "BUY_NOW_AND_OFFER",
      priceCents: 750000,
      minimumOfferCents: 500000,
      commissionBps: 700,
      ownershipVerification: {
        method: "dns_txt",
        record: `_getthe-verify.${domain}`,
        value: `getthe=smoke-${suffix}`
      },
      description: "Smoke-test domain for the persisted marketplace workflow.",
      category: "SaaS",
      seoTitle: `${domain} is for sale`,
      seoDescription: `Buy ${domain} through GetThe.`,
      landingPageSlug: domain.replaceAll(".", "-"),
      brandSignals: ["workflow", "smoke", "verified"],
      appraisal: {
        create: {
          domain,
          lowEstimateCents: 500000,
          highEstimateCents: 920000,
          confidence: 81,
          comparableSales: [],
          keywordSignals: ["workflow", "smoke"],
          brandabilityNotes: "Smoke-test listing for local database verification.",
          generatedSummary: `${domain} is a smoke-test listing.`,
          modelVersion: "smoke-v1"
        }
      }
    }
  });

  const verified = await prisma.domainListing.update({
    where: { id: listing.id },
    data: {
      status: "ACTIVE",
      ownershipVerification: {
        method: "manual",
        verifiedAt: new Date().toISOString(),
        verifiedBy: "db-smoke"
      }
    }
  });

  const offer = await prisma.offer.create({
    data: {
      listingId: verified.id,
      buyerId: buyer.id,
      amountCents: 650000,
      status: "ACCEPTED",
      buyerVerificationTier: "ESCROW_INTENT",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      negotiationHistory: [
        {
          actor: "buyer",
          message: "Smoke offer",
          amount: 6500,
          at: new Date().toISOString()
        }
      ]
    }
  });

  const transaction = await prisma.transaction.create({
    data: {
      listingId: verified.id,
      offerId: offer.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      escrowProvider: "escrow.com",
      escrowId: `escrow_smoke_${suffix}`,
      escrowUrl: `https://www.escrow.com/domain-name-holding?domain=${domain}`,
      amountCents: 650000,
      commissionCents: 45500,
      status: "ESCROW_STARTED",
      statusTimeline: [
        {
          status: "escrow_started",
          label: "Smoke transaction started.",
          at: new Date().toISOString()
        }
      ],
      transferChecklist: []
    }
  });

  await prisma.watchlist.upsert({
    where: {
      userId_listingId: {
        userId: buyer.id,
        listingId: verified.id
      }
    },
    update: {},
    create: {
      userId: buyer.id,
      listingId: verified.id
    }
  });

  const searchAlert = await prisma.searchAlert.create({
    data: {
      userId: buyer.id,
      name: "Smoke workflow alert",
      filters: { q: "workflow", tld: "com" },
      cadence: "weekly"
    }
  });

  const supportCase = await prisma.supportCase.create({
    data: {
      requesterId: buyer.id,
      subject: "Smoke support case",
      transactionId: transaction.id,
      aiDraftResponses: [
        {
          title: "Support response draft",
          body: "Smoke support draft.",
          provider: "local",
          modelVersion: "smoke-v1"
        }
      ]
    }
  });

  await prisma.auditEvent.create({
    data: {
      eventType: "db.smoke.completed",
      entityType: "transaction",
      entityId: transaction.id,
      metadata: {
        listingId: verified.id,
        offerId: offer.id,
        searchAlertId: searchAlert.id,
        supportCaseId: supportCase.id
      }
    }
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        domain,
        listingId: verified.id,
        offerId: offer.id,
        transactionId: transaction.id,
        searchAlertId: searchAlert.id,
        supportCaseId: supportCase.id
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
