import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthContext, hasRole } from "@/lib/auth";
import { deleteWatchlistItem } from "@/lib/repository";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  if (!(await hasRole(request, ["buyer", "seller", "admin"]))) {
    return NextResponse.json({ error: "Signed-in user required." }, { status: 403 });
  }

  try {
    const session = await getRequestAuthContext(request);
    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { itemId } = await params;
    return NextResponse.json(await deleteWatchlistItem({ id: itemId, userEmail: session.email }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Watchlist delete failed." },
      { status: 400 }
    );
  }
}
