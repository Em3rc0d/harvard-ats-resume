import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("B8 auth callback redirect boundary", () => {
  it("allows only same-origin post-authentication redirects", () => {
    const callback = readFileSync("src/app/auth/callback/route.ts", "utf8");
    expect(callback).toContain("function sameOriginDestination");
    expect(callback).toContain("candidate.origin === fallback.origin");
    expect(callback).toContain("sameOriginDestination(request, url.searchParams.get(\"next\"))");
    expect(callback).not.toContain('const next = url.searchParams.get("next") ?? "/"');
    expect(callback).not.toContain("NextResponse.redirect(new URL(next, request.url))");
  });
});
