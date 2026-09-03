import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("B8 authenticated API boundary semantics", () => {
  it("does not collapse Opportunity Space auth/config failures into generic 500 responses", () => {
    const route = readFileSync("src/app/api/opportunity-space/route.ts", "utf8");
    expect(route).toContain("AuthenticationRequiredError");
    expect(route).toContain('error: "UNAUTHENTICATED"');
    expect(route).toContain("status: 401");
    expect(route).toContain('error: "DURABLE_STORE_NOT_CONFIGURED"');
    expect(route).toContain("status: 503");
    expect(route).toContain("opportunitySpaceError(error)");
  });
});
