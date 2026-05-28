import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendMarketplaceNotification } from "@/lib/notifications";
import { createParkedInquiry } from "@/lib/repository";

const schema = z.object({
  listingId: z.string().min(1),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  message: z.string().min(10).max(2000),
  budget: z.number().positive().optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const inquiry = await createParkedInquiry(body);
    await sendMarketplaceNotification({
      to: inquiry.sellerEmail,
      subject: `GetThe inquiry for ${inquiry.domain}`,
      textBody: `${inquiry.name} (${inquiry.email}) asked about ${inquiry.domain}: ${inquiry.message}`,
      tag: "parking-inquiry-created",
      entityType: "domain_listing",
      entityId: inquiry.listingId,
      recipientRole: "seller",
      metadata: {
        inquiryId: inquiry.id,
        domain: inquiry.domain,
        budget: inquiry.budget
      }
    });

    return NextResponse.json({ inquiry }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Inquiry could not be created." },
      { status: 400 }
    );
  }
}
