import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { createSupportCase, listSupportCases } from "@/lib/repository";

const schema = z.object({
  requesterEmail: z.string().email(),
  subject: z.string().min(3),
  transactionId: z.string().optional(),
  context: z.string().min(3)
});

export async function GET(request: NextRequest) {
  if (!hasRole(request, ["admin"])) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  return NextResponse.json({ supportCases: await listSupportCases() });
}

export async function POST(request: NextRequest) {
  if (!hasRole(request, ["buyer", "seller", "admin"])) {
    return NextResponse.json({ error: "Signed-in user required." }, { status: 403 });
  }

  try {
    return NextResponse.json({ supportCase: await createSupportCase(schema.parse(await request.json())) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Support case creation failed." },
      { status: 400 }
    );
  }
}
