import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAuthContext, hasRole } from "@/lib/auth";
import { sendMarketplaceNotification } from "@/lib/notifications";
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
    const session = await getRequestAuthContext(request);
    if (body.method === "manual" && session?.role !== "admin") {
      return NextResponse.json({ error: "Manual verification requires an admin reviewer." }, { status: 403 });
    }

    const actorRole = session?.role === "admin" || session?.role === "seller" ? session.role : undefined;
    const result = await verifyListingOwnership({ listingId, ...body, actorRole });

    if (body.actorEmail) {
      await sendMarketplaceNotification({
        to: body.actorEmail,
        subject: "GetThe ownership verification complete",
        textBody: `${result.listing.domain} was verified via ${result.verification.method}.`,
        tag: "listing-verified",
        entityType: "domain_listing",
        entityId: result.listing.id,
        recipientRole: "seller",
        metadata: {
          method: result.verification.method,
          mode: result.verification.mode
        }
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ownership verification failed." },
      { status: 400 }
    );
  }
}
