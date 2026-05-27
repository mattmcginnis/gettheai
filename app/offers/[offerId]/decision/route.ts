import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { decideOffer } from "@/lib/repository";

const schema = z.object({
  action: z.enum(["accept", "reject", "counter"]),
  amount: z.number().positive().optional(),
  note: z.string().min(3)
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  if (!(await hasRole(request, ["seller", "admin"]))) {
    return NextResponse.json({ error: "Seller or admin role required." }, { status: 403 });
  }

  try {
    const { offerId } = await params;
    const body = schema.parse(await request.json());
    return NextResponse.json(await decideOffer({ offerId, ...body }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid offer decision request." },
      { status: 400 }
    );
  }
}
