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
    expect(workflow).toContain("python tests/b9/production-browser-email-wrapper.py");
    expect(workflow).not.toContain("python - <<'PY'");
  });

  it("refuses stale Production before installing the heavy browser harness", () => {
    const workflow = read(".github/workflows/b9-production-browser-e2e.yml");
    const preflight = read("tests/b9/production-runtime-preflight.py");
    const preflightIndex = workflow.indexOf("python tests/b9/production-runtime-preflight.py");
    const installIndex = workflow.indexOf("python -m pip install --disable-pip-version-check playwright==1.55.0");
    const certifyIndex = workflow.indexOf("python tests/b9/production-browser-email-wrapper.py");

    expect(preflightIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeGreaterThan(preflightIndex);
    expect(certifyIndex).toBeGreaterThan(installIndex);
    expect(preflight).toContain("/api/build-info");
    expect(preflight).toContain("B9_PREFLIGHT_EXACT_RUNTIME_READY");
    expect(preflight).toContain("B9_PREFLIGHT_EXACT_RUNTIME_NOT_READY");
    expect(preflight).toContain('last.get("gitCommitSha") == EXPECTED_SHA');
    expect(preflight).toContain('last.get("environment") == "production"');
    expect(preflight).not.toContain("playwright");
    expect(preflight).not.toContain("SUPABASE_SERVICE_ROLE");
  });

  it("suppresses automatic B9 branch previews while preserving main Production deployment", () => {
    const config = JSON.parse(read("vercel.json")) as {
      git?: { deploymentEnabled?: Record<string, boolean> };
    };
    const rules = config.git?.deploymentEnabled;

    expect(rules?.main).toBe(true);
    for (const pattern of [
      "agent/b9-*",
      "fix/b9-*",
      "diagnostic/b9-*",
      "cert/b9-*",
      "test/b9-*",
      "docs/b9-*",
    ]) {
      expect(rules?.[pattern]).toBe(false);
    }
  });

  it("uses an ephemeral email-confirmed Auth fixture without privileged credentials or Auth weakening", () => {
    const workflow = read(".github/workflows/b9-production-browser-e2e.yml");
    const wrapper = read("tests/b9/production-browser-email-wrapper.py");

    expect(wrapper).toContain("https://mail.tm");
    expect(wrapper).toContain("secrets.token_urlsafe");
    expect(wrapper).toContain("CERT_AUTH_WAIT_FOR_CONFIRMATION");
    expect(wrapper).toContain("/auth/v1/verify");
    expect(wrapper).toContain('SUPABASE_CONFIRM_HOST = "zqcwlnshtsectitagkca.supabase.co"');
    expect(wrapper).toContain('redirect.path != "/auth/callback"');
    expect(wrapper).toContain("B9_BROWSER_EMAIL_CONFIRMATION_NOT_RECEIVED");
    expect(wrapper).toContain("B9_BROWSER_EMAIL_CONFIRMATION_LINK_NOT_FOUND");
    expect(wrapper).toContain("B9_BROWSER_EMAIL_SIGNUP_RATE_LIMITED");
    expect(wrapper).toContain("mailbox.delete()");
    expect(wrapper).toContain("B9_CERT_MAILBOX_CLEANUP_FAILED");
    expect(wrapper).toContain('report["checks"].append("EMAIL_CONFIRMED_AUTH_SESSION")');
    expect(wrapper).toContain("Acknowledge and continue");
    expect(wrapper).not.toContain("route.continue_");
    expect(wrapper).not.toContain("signInAnonymously");
    expect(wrapper).not.toContain("SUPABASE_SERVICE_ROLE");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE");
    expect(workflow).not.toContain("CVENGINE_SYNTHETIC_PASSWORD:");
  });

  it("pins the mail API representation and emits a sanitized receipt before mailbox provisioning", () => {
    const workflow = read(".github/workflows/b9-production-browser-e2e.yml");
    const wrapper = read("tests/b9/production-browser-email-wrapper.py");
    const receiptIndex = wrapper.indexOf("_write_wrapper_report(report)");
    const mailboxIndex = wrapper.indexOf("mailbox = TemporaryMailbox.create()");

    expect(wrapper).toContain('MAILTM_ACCEPT = "application/ld+json"');
    expect(wrapper).toContain('WRAPPER_REPORT_PATH = OUTPUT_DIR / "wrapper-report.json"');
    expect(wrapper).toContain('"schemaVersion": "b9-production-browser-wrapper-receipt-v1"');
    expect(wrapper).toContain("def _collection_members");
    expect(wrapper).toContain('payload.get("hydra:member")');
    expect(wrapper).toContain('payload.get("data")');
    expect(wrapper).toContain('payload.get("_embedded")');
    expect(wrapper).toContain('report["failedPhase"]');
    expect(receiptIndex).toBeGreaterThan(-1);
    expect(mailboxIndex).toBeGreaterThan(receiptIndex);
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("path: artifacts/b9-production-browser");
  });

  it("keeps ephemeral mailbox credentials out of the patched artifact", () => {
    const wrapper = read("tests/b9/production-browser-email-wrapper.py");
    expect(wrapper).toContain("SYNTHETIC_EMAIL = CERT_AUTH_EMAIL");
    expect(wrapper).toContain("SYNTHETIC_PASSWORD = CERT_AUTH_PASSWORD");
    expect(wrapper).toContain("init_globals={");
    expect(wrapper).not.toContain("PATCHED_PATH.write_text(f");
  });

  it("observes the Presentation proposal HTTP outcome before trusting rendered UI state", () => {
    const script = read("tests/b9/production-browser-e2e.py");
    expect(script).toContain("page.expect_response");
    expect(script).toContain("PRESENTATION_PROPOSAL_HTTP_201_OBSERVED");
    expect(script).toContain("presentationProposalHttpStatus");
    expect(script).toContain("presentationProposalFailureCode");
    expect(script).toContain("presentationProviderAttempts");
    expect(script).toContain("B9_BROWSER_AI_ASSIST_UNAVAILABLE");
    expect(script).toContain("B9_BROWSER_AI_PROPOSAL_REJECTED_BY_VALIDATOR");
    expect(script).toContain("B9_BROWSER_PRESENTATION_PROPOSAL_HTTP_FAILURE");
    expect(script).toContain("B9_BROWSER_AI_PROPOSAL_REVIEW_NOT_RENDERED_AFTER_201");
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