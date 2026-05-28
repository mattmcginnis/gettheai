import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAuthContext } from "@/lib/auth";
import { sendMarketplaceNotification } from "@/lib/notifications";
import { updateParkedInquiry } from "@/lib/repository";

const schema = z.object({
  status: z.enum(["new", "contacted", "converted", "closed"]),
  followUpNote: z.string().max(2000).optional()
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ inquiryId: string }> }
) {
  const session = await getRequestAuthContext(request);
  if (!session || (session.role !== "seller" && session.role !== "admin") || !session.twoFactorEnabled) {
    return NextResponse.json({ error: "Seller or admin role required." }, { status: 403 });
  }

  try {
    const { inquiryId } = await params;
    const body = schema.parse(await request.json());
    const result = await updateParkedInquiry({
      inquiryId,
      actorEmail: session.email,
      actorRole: session.role,
      ...body
    });

    await sendMarketplaceNotification({
      to: result.inquiry.email,
      subject: `GetThe inquiry update for ${result.inquiry.domain}`,
      textBody: `Your inquiry for ${result.inquiry.domain} is now ${result.inquiry.status}.`,
      tag: "parking-inquiry-updated",
      entityType: "domain_listing",
      entityId: result.inquiry.listingId,
      recipientRole: "buyer",
      metadata: {
        inquiryId,
        status: result.inquiry.status
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Inquiry could not be updated." },
      { status: 400 }
    );
  }
}
