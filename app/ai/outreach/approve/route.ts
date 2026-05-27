import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { sendTransactionalEmail } from "@/lib/email";

const schema = z.object({
  targetEmail: z.string().email(),
  subject: z.string().min(3),
  body: z.string().min(10)
});

export async function POST(request: NextRequest) {
  if (!hasRole(request, ["seller", "admin"])) {
    return NextResponse.json({ error: "Seller or admin approval required." }, { status: 403 });
  }

  try {
    const body = schema.parse(await request.json());
    const delivery = await sendTransactionalEmail({
      to: body.targetEmail,
      subject: body.subject,
      textBody: body.body,
      tag: "approved-outreach"
    });

    return NextResponse.json({ approved: true, delivery });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Outreach approval failed." },
      { status: 400 }
    );
  }
}
