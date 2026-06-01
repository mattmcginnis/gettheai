import { Prisma } from "@prisma/client";
import { runGuardedAiDraft } from "@/lib/ai";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { ensureUser } from "@/lib/repository/internal/prisma";
import { getMarketplaceListing } from "@/lib/repository/marketplace";

export async function createAiOutreachDraft(input: {
  listingId: string;
  targetCompany: string;
  targetEmail?: string;
  context: string;
  actorEmail?: string;
}) {
  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  const draft = await runGuardedAiDraft({
    kind: "outreach",
    subject: `${listing.domain} outreach for ${input.targetCompany}`,
    context: `${input.context}\nListing: ${listing.domain}\nAsk: ${listing.price}\nSignals: ${listing.brandSignals.join(", ")}`
  });
  const record = {
    id: `outreach_${Date.now()}`,
    listingId: listing.id,
    domain: listing.domain,
    targetCompany: input.targetCompany,
    targetEmail: input.targetEmail,
    draft,
    requiresHumanApproval: true,
    createdAt: new Date().toISOString()
  };

  if (isDatabaseConfigured()) {
    const actor = input.actorEmail ? await ensureUser(input.actorEmail, "SELLER") : null;
    await getPrisma().auditEvent.create({
      data: {
        actorId: actor?.id,
        eventType: "ai.outreach.draft.created",
        entityType: "domain_listing",
        entityId: listing.id,
        metadata: record as unknown as Prisma.InputJsonValue
      }
    });
  }

  return record;
}

