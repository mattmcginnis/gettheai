import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAuthContext, hasRole } from "@/lib/auth";
import { createSearchAlert } from "@/lib/repository";

const schema = z.object({
  userEmail: z.string().email(),
  name: z.string().min(2),
  filters: z.record(z.unknown()).default({}),
  cadence: z.enum(["instant", "daily", "weekly"]).default("weekly")
});

export async function POST(request: NextRequest) {
  if (!(await hasRole(request, ["buyer", "seller", "admin"]))) {
    return NextResponse.json({ error: "Signed-in user required." }, { status: 403 });
  }

  try {
    const session = await getRequestAuthContext(request);
    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = schema.parse(await request.json());
    return NextResponse.json(
      { searchAlert: await createSearchAlert({ ...body, userEmail: session.email }) },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search alert creation failed." },
      { status: 400 }
    );
  }
}
