const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const sellers = [
  {
    email: "northstar@getthe.com",
    displayName: "Northstar Domains",
    slug: "northstar-domains"
  },
  {
    email: "civic@getthe.com",
    displayName: "Civic Names",
    slug: "civic-names"
  },
  {
    email: "ai-holdings@getthe.com",
    displayName: "Applied AI Holdings",
    slug: "applied-ai-holdings"
  }
];

const listings = [
  {
    sellerEmail: "northstar@getthe.com",
    domain: "atlasforge.com",
    tld: "com",
    registrar: "Namecheap",
    priceCents: 880000,
    minimumOfferCents: 650000,
    category: "SaaS",
    description: "A sturdy two-word .com for infrastructure, developer tooling, data products, or operations software.",
    trafficMonthly: 380,
    domainAgeYears: 9,
    brandSignals: ["two-word .com", "infrastructure", "developer tools", "memorable"],
    appraisal: {
      lowEstimateCents: 640000,
      highEstimateCents: 1120000,
      confidence: 82,
      keywordSignals: ["atlas", "forge", "infrastructure", "build"],
      brandabilityNotes: ".com gives the name the broadest resale audience. Recognized buyer-intent signals: atlas, forge.",
      generatedSummary: "AtlasForge.com sits in the mid-tier sweet spot with strong .com liquidity and a buyer-friendly software angle."
    }
  },
  {
    sellerEmail: "civic@getthe.com",
    domain: "civicledger.org",
    tld: "org",
    registrar: "Porkbun",
    priceCents: 420000,
    minimumOfferCents: 280000,
    category: "Civic Tech",
    description: "A credible .org for transparency tooling, civic technology, nonprofit finance, or open data initiatives.",
    trafficMonthly: 145,
    domainAgeYears: 6,
    brandSignals: ["mission-driven", "transparent", "nonprofit", "finance"],
    appraisal: {
      lowEstimateCents: 270000,
      highEstimateCents: 620000,
      confidence: 76,
      keywordSignals: ["civic", "ledger", "transparency", "public benefit"],
      brandabilityNotes: ".org reinforces mission credibility for trust-focused civic products.",
      generatedSummary: "CivicLedger.org is a focused .org listing with a strong buyer narrative."
    }
  },
  {
    sellerEmail: "ai-holdings@getthe.com",
    domain: "modeldock.ai",
    tld: "ai",
    registrar: "101domain",
    priceCents: 1290000,
    minimumOfferCents: 950000,
    category: "AI Infrastructure",
    description: "An AI-native name for model deployment, evaluation, observability, or managed inference workflows.",
    trafficMonthly: 520,
    domainAgeYears: 3,
    brandSignals: ["AI-native", "model ops", "short", "technical"],
    appraisal: {
      lowEstimateCents: 920000,
      highEstimateCents: 1800000,
      confidence: 84,
      keywordSignals: ["model", "dock", "AI infrastructure", "MLOps"],
      brandabilityNotes: ".ai improves category fit for model, agent, and automation buyers.",
      generatedSummary: "ModelDock.ai carries premium AI category demand, with buyer fit strongest in AI infrastructure."
    }
  }
];

async function main() {
  for (const seller of sellers) {
    const user = await prisma.user.upsert({
      where: { email: seller.email },
      update: {
        displayName: seller.displayName,
        role: "SELLER",
        verificationTier: "TWO_FACTOR",
        twoFactorEnabled: true
      },
      create: {
        clerkUserId: `seed:${seller.email}`,
        email: seller.email,
        displayName: seller.displayName,
        role: "SELLER",
        verificationTier: "TWO_FACTOR",
        twoFactorEnabled: true
      }
    });

    await prisma.sellerProfile.upsert({
      where: { userId: user.id },
      update: {
        publicName: seller.displayName,
        slug: seller.slug
      },
      create: {
        userId: user.id,
        publicName: seller.displayName,
        slug: seller.slug
      }
    });
  }

  for (const listing of listings) {
    const seller = await prisma.user.findUniqueOrThrow({
      where: { email: listing.sellerEmail }
    });

    await prisma.domainListing.upsert({
      where: { domain: listing.domain },
      update: {
        priceCents: listing.priceCents,
        minimumOfferCents: listing.minimumOfferCents,
        status: "ACTIVE"
      },
      create: {
        sellerId: seller.id,
        domain: listing.domain,
        tld: listing.tld,
        registrar: listing.registrar,
        status: "ACTIVE",
        listingType: "BUY_NOW_AND_OFFER",
        priceCents: listing.priceCents,
        minimumOfferCents: listing.minimumOfferCents,
        commissionBps: 700,
        ownershipVerification: { method: "seed", verifiedAt: new Date().toISOString() },
        description: listing.description,
        category: listing.category,
        trafficMonthly: listing.trafficMonthly,
        domainAgeYears: listing.domainAgeYears,
        seoTitle: `${listing.domain} is for sale`,
        seoDescription: `Buy ${listing.domain} through GetThe with Escrow.com transaction handoff.`,
        landingPageSlug: listing.domain.replaceAll(".", "-"),
        brandSignals: listing.brandSignals,
        appraisal: {
          create: {
            domain: listing.domain,
            ...listing.appraisal,
            comparableSales: [],
            modelVersion: "getthe-seed-v1",
            disclaimerAccepted: false
          }
        }
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
