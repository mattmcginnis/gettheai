import { Prisma } from "@prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import type { ParkedInquiry } from "@/lib/types";
import { getSellerEmailForListing, localParkedInquiries } from "@/lib/repository/internal/local-store";
import { ensureUser } from "@/lib/repository/internal/prisma";
import { inquiryMatchesQuery, mergeInquiryAuditEvents } from "@/lib/repository/internal/utils";
import { getMarketplaceListing } from "@/lib/repository/marketplace";

export async function createParkedInquiry(input: {
  listingId: string;
  name: string;
  email: string;
  message: string;
  budget?: number;
}): Promise<ParkedInquiry> {
  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  const now = new Date().toISOString();
  const sellerEmail = await getSellerEmailForListing(listing);
  const inquiry: ParkedInquiry = {
    id: `inq_${Date.now()}`,
    listingId: listing.id,
    domain: listing.domain,
    sellerEmail,
    name: input.name.trim(),
    email: input.email.toLowerCase(),
    message: input.message.trim(),
    budget: input.budget,
    status: "new",
    updatedAt: now,
    createdAt: now
  };

  if (!isDatabaseConfigured()) {
    localParkedInquiries.unshift(inquiry);
    return inquiry;
  }

  await getPrisma().auditEvent.create({
    data: {
      eventType: "parking.inquiry.created",
      entityType: "domain_listing",
      entityId: listing.id,
      metadata: inquiry as unknown as Prisma.InputJsonValue
    }
  });

  return inquiry;
}


export async function listParkedInquiries(input: {
  email: string;
  role: "seller" | "admin";
  status?: ParkedInquiry["status"] | "all";
  q?: string;
}): Promise<ParkedInquiry[]> {
  const status = input.status && input.status !== "all" ? input.status : undefined;
  const q = input.q?.trim().toLowerCase();
  const email = input.email.toLowerCase();

  if (!isDatabaseConfigured()) {
    return localParkedInquiries
      .filter((inquiry) => input.role === "admin" || inquiry.sellerEmail.toLowerCase() === email)
      .filter((inquiry) => !status || inquiry.status === status)
      .filter((inquiry) => !q || inquiryMatchesQuery(inquiry, q))
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  }

  const events = await getPrisma().auditEvent.findMany({
    where: {
      eventType: {
        in: ["parking.inquiry.created", "parking.inquiry.followup.updated"]
      }
    },
    orderBy: { createdAt: "asc" },
    take: 500
  });
  const inquiries = mergeInquiryAuditEvents(events.map((event) => ({
    eventType: event.eventType,
    metadata: event.metadata,
    createdAt: event.createdAt.toISOString()
  })));

  return inquiries
    .filter((inquiry) => input.role === "admin" || inquiry.sellerEmail.toLowerCase() === email)
    .filter((inquiry) => !status || inquiry.status === status)
    .filter((inquiry) => !q || inquiryMatchesQuery(inquiry, q))
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
}


export async function updateParkedInquiry(input: {
  inquiryId: string;
  actorEmail: string;
  actorRole: "seller" | "admin";
  status: ParkedInquiry["status"];
  followUpNote?: string;
}) {
  const existing = (await listParkedInquiries({ email: input.actorEmail, role: input.actorRole, status: "all" }))
    .find((inquiry) => inquiry.id === input.inquiryId);
  if (!existing) {
    throw new Error("Inquiry not found.");
  }

  const updated: ParkedInquiry = {
    ...existing,
    status: input.status,
    followUpNote: input.followUpNote ?? existing.followUpNote,
    updatedAt: new Date().toISOString()
  };

  if (!isDatabaseConfigured()) {
    const index = localParkedInquiries.findIndex((inquiry) => inquiry.id === input.inquiryId);
    if (index >= 0) {
      localParkedInquiries[index] = updated;
    }
    return {
      action: "parking_inquiry_update",
      inquiry: updated,
      mode: "local"
    };
  }

  const actor = await ensureUser(input.actorEmail, input.actorRole === "admin" ? "ADMIN" : "SELLER");
  await getPrisma().auditEvent.create({
    data: {
      actorId: actor.id,
      eventType: "parking.inquiry.followup.updated",
      entityType: "domain_listing",
      entityId: existing.listingId,
      metadata: {
        inquiryId: input.inquiryId,
        status: input.status,
        followUpNote: input.followUpNote,
        actorEmail: input.actorEmail,
        updatedAt: updated.updatedAt
      } as Prisma.InputJsonValue
    }
  });

  return {
    action: "parking_inquiry_update",
    inquiry: updated,
    mode: "database"
  };
}

