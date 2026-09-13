import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authPanel = readFileSync("src/components/first-run/AuthPanel.tsx", "utf8");
const emailRoute = readFileSync("src/app/api/auth/email/route.ts", "utf8");

function occurrences(source: string, needle: string) {
  return source.split(needle).length - 1;
}

describe("same-origin email authentication", () => {
  it("keeps the user-facing account flow on the CV Engine origin", () => {
    expect(authPanel).toContain('fetch("/api/auth/email"');
    expect(authPanel).not.toContain("createSupabaseBrowserClient");
    expect(authPanel).not.toContain("client.auth.signUp");
    expect(authPanel).not.toContain("client.auth.signInWithPassword");
    expect(authPanel).not.toContain("client.auth.signInWithOtp");
  });

  it("delegates authentication to Supabase through the public SSR client", () => {
    expect(emailRoute).toContain("createSupabaseServerClient");
    expect(occurrences(emailRoute, "client.auth.signInWithPassword")).toBe(1);
    expect(occurrences(emailRoute, "client.auth.signUp")).toBe(1);
    expect(occurrences(emailRoute, "client.auth.signInWithOtp")).toBe(1);
    expect(emailRoute).not.toMatch(/service[_-]?role/i);
  });

  it("keeps auth mutations same-origin and non-cacheable", () => {
    expect(emailRoute).toContain('request.headers.get("origin")');
    expect(emailRoute).toContain('origin === null || origin === new URL(request.url).origin');
    expect(emailRoute).toContain('"Cache-Control": "private, no-store"');
    expect(emailRoute).toContain('error: "ORIGIN_NOT_ALLOWED"');
  });

  it("preserves confirmation rather than manufacturing a session", () => {
    expect(emailRoute).toContain("authenticated: Boolean(data.session)");
    expect(emailRoute).toContain("confirmationRequired: !data.session");
    expect(emailRoute).toContain('new URL("/auth/callback", request.url).toString()');
  });
});
