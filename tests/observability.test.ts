import { describe, expect, it } from "vitest";
import { getRuntimeDiagnostics } from "@/lib/observability";

describe("runtime diagnostics", () => {
  it("reports safe integration modes without secrets", () => {
    const diagnostics = getRuntimeDiagnostics();

    expect(diagnostics).toHaveProperty("database");
    expect(diagnostics).toHaveProperty("search");
    expect(diagnostics).toHaveProperty("escrow");
    expect(diagnostics).not.toHaveProperty("ESCROW_API_KEY");
  });
});
