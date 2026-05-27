import { NextRequest, NextResponse } from "next/server";
import { hasRole } from "@/lib/auth";
import { storeObject } from "@/lib/storage";

export async function POST(request: NextRequest) {
  if (!(await hasRole(request, ["seller", "admin"]))) {
    return NextResponse.json({ error: "Seller or admin role required." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const purpose = String(form.get("purpose") ?? "evidence");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Attach a file field." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const key = `${purpose}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;

    return NextResponse.json({
      object: await storeObject({
        key,
        bytes,
        contentType: file.type || "application/octet-stream"
      })
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 500 }
    );
  }
}
