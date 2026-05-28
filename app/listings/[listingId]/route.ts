import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAuthContext, hasRole } from "@/lib/auth";
import { deleteSellerListing, updateSellerListingDetails } from "@/lib/repository";

const updateSchema = z.object({
  price: z.number().positive(),
  minimumOffer: z.number().positive().optional(),
  registrar: z.string().optional(),
  category: z.string().min(2),
  listingType: z.enum(["buy_now", "make_offer", "buy_now_and_offer"]),
  description: z.string().min(20),
  trafficMonthly: z.number().int().min(0).optional(),
  domainAgeYears: z.number().int().min(0).optional(),
  seoTitle: z.string().min(5),
  seoDescription: z.string().min(20)
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
    const body = updateSchema.parse(await request.json());
    return NextResponse.json(
      await updateSellerListingDetails({
        listingId,
        actorEmail: session.email,
        actorRole: session.role,
        ...body
      })
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid listing update request." },
      { status: 400 }
    );
  }
}

export async function DELETE(
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
    return NextResponse.json(
      await deleteSellerListing({
        listingId,
        actorEmail: session.email,
        actorRole: session.role
      })
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid listing delete request." },
      { status: 400 }
    );
  }
}
