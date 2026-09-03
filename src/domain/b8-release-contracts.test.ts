import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("B8 release hardening contracts", () => {
  it("denies API roles by default and exposes only explicit lifecycle RPCs", () => {
    const migration = readFileSync("supabase/migrations/20260903130000_b8_release_hardening.sql", "utf8");
    expect(migration).toContain("revoke all on function %s from PUBLIC, anon, authenticated");
    expect(migration).toContain("cv_engine_export_account()");
    expect(migration).toContain("cv_engine_delete_account()");
    expect(migration).not.toContain("p_owner_user_id");
  });

  it("keeps account deletion explicitly confirmed at the HTTP boundary", () => {
    const route = readFileSync("src/app/api/account/delete/route.ts", "utf8");
    expect(route).toContain("DELETE_MY_ACCOUNT");
    expect(route).toContain("cv_engine_delete_account");
    expect(route).not.toContain("ownerUserId");
  });

  it("makes the deployed commit and safe runtime configuration observable", () => {
    const route = readFileSync("src/app/api/runtime/route.ts", "utf8");
    expect(route).toContain("VERCEL_GIT_COMMIT_SHA");
    expect(route).toContain("exactHeadObservable");
    expect(route).toContain("b8-release-hardening-v1");
    expect(route).toContain("supabaseConfigured");
    expect(route).toContain("platformGeminiConfigured");
    expect(route).not.toContain("publishableKey,");
  });
});
