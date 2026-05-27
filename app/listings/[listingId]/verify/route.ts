import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { verifyListingOwnership } from "@/lib/repository";

const schema = z.object({
  method: z.enum(["dns_txt", "nameserver", "registrar", "manual"]),
  token: z.string().optional(),
  actorEmail: z.string().email().optional()
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  if (!(await hasRole(request, ["seller", "admin"]))) {
    return NextResponse.json({ error: "Seller or admin role required." }, { status: 403 });
  }

  try {
    const { listingId } = await params;
    const body = schema.parse(await request.json());
    return NextResponse.json(await verifyListingOwnership({ listingId, ...body }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ownership verification failed." },
      { status: 400 }
    );
  }
}
