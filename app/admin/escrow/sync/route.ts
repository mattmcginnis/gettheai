import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { syncTransactionEscrowStatus } from "@/lib/repository";

const schema = z.object({
  transactionId: z.string().min(1),
  actorEmail: z.string().email().optional()
});

export async function POST(request: NextRequest) {
  if (!(await hasRole(request, ["admin"]))) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  try {
    return NextResponse.json(await syncTransactionEscrowStatus(schema.parse(await request.json())));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Escrow status sync failed." },
      { status: 400 }
    );
  }
}
