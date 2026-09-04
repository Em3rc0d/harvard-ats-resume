import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("B9 production browser certification contract", () => {
  it("exposes only non-secret runtime identity needed for exact-SHA certification", () => {
    const route = read("src/app/api/build-info/route.ts");
    expect(route).toContain("VERCEL_GIT_COMMIT_SHA");
    expect(route).toContain("VERCEL_ENV");
    expect(route).toContain("Cache-Control");
    expect(route).not.toContain("SUPABASE_SERVICE_ROLE");
  });

  it("runs the browser gate only against main Production and binds it to github.sha", () => {
    const workflow = read(".github/workflows/b9-production-browser-e2e.yml");
    expect(workflow).toContain("branches:\n      - main");
    expect(workflow).toContain("CVENGINE_EXPECTED_SHA: ${{ github.sha }}");
    expect(workflow).toContain("https://harvard-ats-resume.vercel.app");
    expect(workflow).toContain("playwright==1.55.0");
    expect(workflow).toContain("python tests/b9/production-browser-anonymous-wrapper.py");
    expect(workflow).not.toContain("python - <<'PY'");
  });

  it("uses a query-safe, exactly-once disposable anonymous Auth wrapper without privileged credentials", () => {
    const workflow = read(".github/workflows/b9-production-browser-e2e.yml");
    const wrapper = read("tests/b9/production-browser-anonymous-wrapper.py");
    expect(wrapper).toContain("B9_BROWSER_AUTH_PATCH_SOURCE_MISMATCH");
    expect(wrapper).toContain("B9_BROWSER_AUTH_SUBMIT_PATCH_SOURCE_MISMATCH");
    expect(wrapper).toContain("B9_BROWSER_AUTH_FAILURE_PATCH_SOURCE_MISMATCH");
    expect(wrapper).toContain('page.route("**/auth/v1/signup**", route_disposable_anonymous_signup)');
    expect(wrapper).toContain('page.expect_request("**/auth/v1/signup**", timeout=15_000)');
    expect(wrapper).toContain('anonymous_signup_intercepts["count"] += 1');
    expect(wrapper).toContain("B9_BROWSER_ANONYMOUS_AUTH_INTERCEPT_COUNT");
    expect(wrapper).toContain('route.continue_(post_data="{}")');
    expect(wrapper).toContain("B9_BROWSER_ANONYMOUS_AUTH_DISABLED");
    expect(wrapper).toContain("B9_BROWSER_ANONYMOUS_AUTH_RATE_LIMITED");
    expect(workflow).not.toContain("CVENGINE_SYNTHETIC_PASSWORD:");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE");
    expect(wrapper).not.toContain("SUPABASE_SERVICE_ROLE");
    expect(wrapper).not.toContain("hashlib.sha256");
  });

  it("certifies the full B9 browser golden path including explicit PresentationRevision approval", () => {
    const script = read("tests/b9/production-browser-e2e.py");
    expect(script).toContain("PLATFORM_AI_SELECTED");
    expect(script).toContain("DOCX_UPLOAD_AND_REVIEW_PROPOSAL");
    expect(script).toContain("IMPORTED_EVIDENCE_EXPLICITLY_VERIFIED");
    expect(script).toContain("PRESENTATION_BEFORE_AFTER_VALIDATED_AND_APPROVED");
    expect(script).toContain("B9_BROWSER_PRESENTATION_MUTATED_CAREER_EVIDENCE");
    expect(script).toContain("GENERAL_RESUME_ARTIFACT_CREATED_FROM_APPROVED_PRESENTATION");
    expect(script).toContain("B9_BROWSER_APPROVED_PRESENTATION_PROVENANCE_MISSING");
    expect(script).toContain("DOCX_PDF_TXT_PROVENANCE_PARITY");
    expect(script).toContain("HISTORICAL_ARTIFACT_RELOAD");
    expect(script).toContain("ACCOUNT_DELETE_AND_SESSION_DENIAL");
    expect(script).toContain("B9_BROWSER_EXACT_RUNTIME_NOT_READY");
    expect(script).toContain("B9_BROWSER_SIGNUP_REQUIRES_EMAIL_CONFIRMATION");
  });
});
