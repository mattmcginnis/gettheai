import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { sendMarketplaceNotification } from "@/lib/notifications";
import {
  adminAddTransactionDisputeNote,
  adminCancelOffer,
  adminUpdateListingStatus,
  adminUpdateSupportCase,
  adminVerifySeller,
  retryTransactionEscrowHandoff
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
  }),
  z.object({
    action: z.literal("transaction_handoff_retry"),
    transactionId: z.string().min(1),
    actorEmail: z.string().email().optional(),
    note: z.string().optional()
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
      const result = await adminVerifySeller(body);
      const seller = "seller" in result ? result.seller : null;
      await sendMarketplaceNotification({
        to: body.sellerEmail,
        subject: "GetThe seller verification updated",
        textBody: `Your seller verification tier is now ${body.verificationTier}.`,
        tag: "seller-verification-updated",
        entityType: "user",
        entityId: seller?.id ?? body.sellerEmail,
        recipientRole: "seller",
        metadata: { verificationTier: body.verificationTier }
      });
      return NextResponse.json(result);
    }

    if (body.action === "offer_cancel") {
      const result = await adminCancelOffer(body);
      const offer = "offer" in result ? result.offer : null;
      if (offer) {
        await sendMarketplaceNotification({
          to: offer.buyerEmail,
          subject: "GetThe offer canceled",
          textBody: `An admin canceled offer ${offer.id}. Reason: ${body.note}`,
          tag: "offer-canceled",
          entityType: "offer",
          entityId: offer.id,
          recipientRole: "buyer"
        });
      }
      return NextResponse.json(result);
    }

    if (body.action === "support_update") {
      const result = await adminUpdateSupportCase(body);
      const supportCase = "supportCase" in result ? result.supportCase : null;
      if (supportCase) {
        await sendMarketplaceNotification({
          to: supportCase.requesterEmail,
          subject: "GetThe support case updated",
          textBody: `Support case ${supportCase.id} is now ${supportCase.status}.`,
          tag: "support-updated",
          entityType: "support_case",
          entityId: supportCase.id,
          recipientRole: "support",
          metadata: { status: supportCase.status }
        });
      }
      return NextResponse.json(result);
    }

    if (body.action === "transaction_handoff_retry") {
      const result = await retryTransactionEscrowHandoff(body);
      const transaction = "transaction" in result ? result.transaction : null;
      if (transaction?.buyerEmail) {
        await sendMarketplaceNotification({
          to: transaction.buyerEmail,
          subject: "GetThe Escrow.com handoff recreated",
          textBody: transaction.escrowUrl
            ? `A new Escrow.com handoff is ready for transaction ${transaction.id}: ${transaction.escrowUrl}`
            : `Escrow.com handoff recovery was attempted for transaction ${transaction.id}.`,
          tag: "transaction-handoff-retried",
          entityType: "transaction",
          entityId: transaction.id,
          recipientRole: "buyer",
          metadata: { escrowId: transaction.escrowId }
        });
      }
      return NextResponse.json(result);
    }

    const result = await adminAddTransactionDisputeNote(body);
    const transaction = "transaction" in result ? result.transaction : null;
    if (transaction) {
      await sendMarketplaceNotification({
        to: transaction.buyerEmail,
        subject: "GetThe transaction dispute note added",
        textBody: `An admin added a dispute note to transaction ${transaction.id}: ${body.note}`,
        tag: "transaction-dispute-note",
        entityType: "transaction",
        entityId: transaction.id,
        recipientRole: "buyer"
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid admin action request." },
      { status: 400 }
    );
  }
}
