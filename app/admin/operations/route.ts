import { NextRequest, NextResponse } from "next/server";
import { hasRole } from "@/lib/auth";
import { getAdminOperations } from "@/lib/repository";

export async function GET(request: NextRequest) {
  if (!(await hasRole(request, ["admin"]))) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  return NextResponse.json(await getAdminOperations());
}
