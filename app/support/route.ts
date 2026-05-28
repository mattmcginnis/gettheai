import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { sendMarketplaceNotification } from "@/lib/notifications";
import { createSupportCase, listSupportCases } from "@/lib/repository";

const schema = z.object({
  requesterEmail: z.string().email(),
  subject: z.string().min(3),
  transactionId: z.string().optional(),
  context: z.string().min(3)
});

export async function GET(request: NextRequest) {
  if (!(await hasRole(request, ["admin"]))) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  return NextResponse.json({ supportCases: await listSupportCases() });
}

export async function POST(request: NextRequest) {
  if (!(await hasRole(request, ["buyer", "seller", "admin"]))) {
    return NextResponse.json({ error: "Signed-in user required." }, { status: 403 });
  }

  try {
    const body = schema.parse(await request.json());
    const supportCase = await createSupportCase(body);

    await sendMarketplaceNotification({
      to: supportCase.requesterEmail,
      subject: "GetThe support case opened",
      textBody: `We opened support case ${supportCase.id}: ${supportCase.subject}`,
      tag: "support-opened",
      entityType: "support_case",
      entityId: supportCase.id,
      recipientRole: "support",
      metadata: {
        transactionId: supportCase.transactionId
      }
    });

    return NextResponse.json({ supportCase }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Support case creation failed." },
      { status: 400 }
    );
  }
}
