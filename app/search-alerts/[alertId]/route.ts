import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAuthContext, hasRole } from "@/lib/auth";
import { deleteSearchAlert, updateSearchAlert } from "@/lib/repository";

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  cadence: z.enum(["instant", "daily", "weekly"]).optional(),
  active: z.boolean().optional()
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ alertId: string }> }
) {
  if (!(await hasRole(request, ["buyer", "seller", "admin"]))) {
    return NextResponse.json({ error: "Signed-in user required." }, { status: 403 });
  }

  try {
    const session = await getRequestAuthContext(request);
    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { alertId } = await params;
    const body = updateSchema.parse(await request.json());
    return NextResponse.json({
      searchAlert: await updateSearchAlert({
        id: alertId,
        userEmail: session.email,
        ...body
      })
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search alert update failed." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ alertId: string }> }
) {
  if (!(await hasRole(request, ["buyer", "seller", "admin"]))) {
    return NextResponse.json({ error: "Signed-in user required." }, { status: 403 });
  }

  try {
    const session = await getRequestAuthContext(request);
    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { alertId } = await params;
    return NextResponse.json(await deleteSearchAlert({ id: alertId, userEmail: session.email }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search alert delete failed." },
      { status: 400 }
    );
  }
}
