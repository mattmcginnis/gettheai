import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import {
  adminAddTransactionDisputeNote,
  adminCancelOffer,
  adminUpdateListingStatus,
  adminUpdateSupportCase,
  adminVerifySeller
} from "@/lib/repository";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("listing_status"),
    listingId: z.string().min(1),
    status: z.enum(["active", "flagged", "archived"]),
    actorEmail: z.string().email().optional(),
    note: z.string().optional()
  }),
  z.object({
    action: z.literal("seller_verification"),
    sellerEmail: z.string().email(),
    verificationTier: z.enum(["email", "two_factor", "escrow_intent", "kyc_review"]).default("two_factor"),
    twoFactorEnabled: z.boolean().optional(),
    actorEmail: z.string().email().optional(),
    note: z.string().optional()
  }),
  z.object({
    action: z.literal("offer_cancel"),
    offerId: z.string().min(1),
    actorEmail: z.string().email().optional(),
    note: z.string().min(3)
  }),
  z.object({
    action: z.literal("support_update"),
    caseId: z.string().min(1),
    status: z.enum(["open", "waiting_on_user", "escalated", "resolved"]),
    escalationNotes: z.string().optional(),
    actorEmail: z.string().email().optional()
  }),
  z.object({
    action: z.literal("transaction_dispute"),
    transactionId: z.string().min(1),
    actorEmail: z.string().email().optional(),
    note: z.string().min(3)
  })
]);

export async function POST(request: NextRequest) {
  if (!(await hasRole(request, ["admin"]))) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  try {
    const body = actionSchema.parse(await request.json());
    if (body.action === "listing_status") {
      return NextResponse.json(await adminUpdateListingStatus(body));
    }

    if (body.action === "seller_verification") {
      return NextResponse.json(await adminVerifySeller(body));
    }

    if (body.action === "offer_cancel") {
      return NextResponse.json(await adminCancelOffer(body));
    }

    if (body.action === "support_update") {
      return NextResponse.json(await adminUpdateSupportCase(body));
    }

    return NextResponse.json(await adminAddTransactionDisputeNote(body));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid admin action request." },
      { status: 400 }
    );
  }
}
