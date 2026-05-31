import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { seedInventoryBatch } from "@/lib/repository";

// Admin-only bulk seeding of house inventory: CSV -> create + auto-appraise ->
// admin-attest ownership -> activate, in one call (report's 50-100 domain mandate).
const schema = z.object({
  csv: z.string().min(1),
  sellerEmail: z.string().email().optional(),
  autoActivate: z.boolean().optional(),
  ownershipMethod: z.enum(["dns_txt", "nameserver", "registrar", "manual"]).optional()
});

export async function POST(request: NextRequest) {
  if (!(await hasRole(request, ["admin"]))) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  try {
    const body = schema.parse(await request.json());
    const result = await seedInventoryBatch(body.csv, {
      sellerEmail: body.sellerEmail,
      autoActivate: body.autoActivate,
      ownershipMethod: body.ownershipMethod
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Inventory seeding failed." },
      { status: 400 }
    );
  }
}
