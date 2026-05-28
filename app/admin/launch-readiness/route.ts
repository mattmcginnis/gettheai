import { NextRequest, NextResponse } from "next/server";
import { hasRole } from "@/lib/auth";
import { getLaunchGates } from "@/lib/beta-checklist";
import { getRuntimeDiagnostics } from "@/lib/observability";

export async function GET(request: NextRequest) {
  if (!(await hasRole(request, ["admin"]))) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  const gates = getLaunchGates();
  const payload = {
    generatedAt: new Date().toISOString(),
    summary: {
      pass: gates.filter((gate) => gate.status === "pass").length,
      warn: gates.filter((gate) => gate.status === "warn").length,
      fail: gates.filter((gate) => gate.status === "fail").length
    },
    gates,
    diagnostics: getRuntimeDiagnostics()
  };

  if (request.nextUrl.searchParams.get("format") === "csv") {
    return new NextResponse(toCsv(payload.gates), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="getthe-launch-readiness-${payload.generatedAt.slice(0, 10)}.csv"`
      }
    });
  }

  return NextResponse.json(payload);
}

function toCsv(gates: ReturnType<typeof getLaunchGates>) {
  const rows = [
    ["id", "label", "status", "owner", "detail", "action", "envVars"],
    ...gates.map((gate) => [
      gate.id,
      gate.label,
      gate.status,
      gate.owner ?? "",
      gate.detail,
      gate.action ?? "",
      gate.envVars?.join(" ") ?? ""
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}
