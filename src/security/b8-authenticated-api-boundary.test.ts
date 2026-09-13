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

  it("validates that an authenticated user still exists instead of trusting stale JWT claims", () => {
    const authBoundary = readFileSync("src/application/auth/requireAuthenticatedUser.ts", "utf8");
    expect(authBoundary).toContain("client.auth.getUser()");
    expect(authBoundary).not.toContain("client.auth.getClaims()");
    expect(authBoundary).toContain("AuthenticationRequiredError");
  });

  it("reports deleted or stale sessions as unauthenticated", () => {
    const sessionRoute = readFileSync("src/app/api/session/route.ts", "utf8");
    expect(sessionRoute).toContain("supabase.auth.getUser()");
    expect(sessionRoute).not.toContain("supabase.auth.getClaims()");
    expect(sessionRoute).toContain("status: 401");

    const improvementRoute = readFileSync("src/app/api/resume-improvements/route.ts", "utf8");
    expect(improvementRoute).toContain("error instanceof AuthenticationRequiredError");
    expect(improvementRoute).toContain('error: "UNAUTHENTICATED"');
    expect(improvementRoute).toContain("status: 401");
  });
});
