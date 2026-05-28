const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for db:cleanup.");
  }

  const demoListings = await prisma.domainListing.findMany({
    where: {
      OR: [{ domain: { startsWith: "workflow-smoke-" } }, { domain: { startsWith: "playwright-" } }]
    },
    select: { id: true, domain: true }
  });
  const listingIds = demoListings.map((listing) => listing.id);
  const listingDomains = demoListings.map((listing) => listing.domain);

  const demoUsers = await prisma.user.findMany({
    where: {
      OR: [
        {
          email: {
            startsWith: "buyer+",
            endsWith: "@example.com"
          }
        },
        {
          email: {
            startsWith: "seller+",
            endsWith: "@example.com"
          }
        }
      ]
    },
    select: { id: true, email: true }
  });
  const userIds = demoUsers.map((user) => user.id);
  const userEmails = demoUsers.map((user) => user.email);

  const scopedTransactions = await prisma.transaction.findMany({
    where: {
      OR: [{ listingId: { in: listingIds } }, { buyerId: { in: userIds } }]
    },
    select: { id: true, offerId: true }
  });
  const transactionIds = scopedTransactions.map((transaction) => transaction.id);

  const scopedOffers = await prisma.offer.findMany({
    where: {
      OR: [{ listingId: { in: listingIds } }, { buyerId: { in: userIds } }, { transaction: { id: { in: transactionIds } } }]
    },
    select: { id: true }
  });
  const offerIds = scopedOffers.map((offer) => offer.id);

  const scopedSupportCases = await prisma.supportCase.findMany({
    where: {
      OR: [{ requesterId: { in: userIds } }, { transactionId: { in: transactionIds } }]
    },
    select: { id: true }
  });
  const supportCaseIds = scopedSupportCases.map((supportCase) => supportCase.id);
  const entityIds = [...listingIds, ...transactionIds, ...offerIds, ...userIds, ...supportCaseIds];

  const results = {};

  results.supportCases = await prisma.supportCase.deleteMany({
    where: { id: { in: supportCaseIds } }
  });
  results.auditEvents = await prisma.auditEvent.deleteMany({
    where: {
      OR: [
        { actorId: { in: userIds } },
        { entityId: { in: entityIds } },
        { eventType: { startsWith: "db.smoke." } }
      ]
    }
  });
  results.transactions = await prisma.transaction.deleteMany({
    where: { id: { in: transactionIds } }
  });
  results.offers = await prisma.offer.deleteMany({
    where: { id: { in: offerIds } }
  });
  results.watchlists = await prisma.watchlist.deleteMany({
    where: {
      OR: [{ userId: { in: userIds } }, { listingId: { in: listingIds } }]
    }
  });
  results.searchAlerts = await prisma.searchAlert.deleteMany({
    where: { userId: { in: userIds } }
  });
  results.appraisals = await prisma.appraisal.deleteMany({
    where: {
      OR: [{ listingId: { in: listingIds } }, { domain: { in: listingDomains } }]
    }
  });
  results.listings = await prisma.domainListing.deleteMany({
    where: { id: { in: listingIds } }
  });
  results.sellerProfiles = await prisma.sellerProfile.deleteMany({
    where: { userId: { in: userIds } }
  });
  results.users = await prisma.user.deleteMany({
    where: { id: { in: userIds } }
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        matched: {
          listings: listingDomains,
          users: userEmails
        },
        deleted: Object.fromEntries(Object.entries(results).map(([key, value]) => [key, value.count]))
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
