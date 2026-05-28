import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAuthContext, hasRole } from "@/lib/auth";
import { updateSellerListingStatus } from "@/lib/repository";

const schema = z.object({
  status: z.enum(["draft", "active", "archived"])
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  if (!(await hasRole(request, ["seller", "admin"]))) {
    return NextResponse.json({ error: "Seller or admin role required." }, { status: 403 });
  }

  try {
    const session = await getRequestAuthContext(request);
    if (!session || (session.role !== "seller" && session.role !== "admin")) {
      return NextResponse.json({ error: "Seller or admin role required." }, { status: 403 });
    }

    const { listingId } = await params;
    const body = schema.parse(await request.json());
    return NextResponse.json(
      await updateSellerListingStatus({
        listingId,
        status: body.status,
        actorEmail: session.email,
        actorRole: session.role
      })
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid listing status request." },
      { status: 400 }
    );
  }
}

export const POST = PATCH;
