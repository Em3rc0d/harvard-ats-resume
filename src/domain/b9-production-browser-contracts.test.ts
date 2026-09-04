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
    expect(route).toContain('Cache-Control');
    expect(route).not.toContain("SUPABASE_SERVICE_ROLE");
  });

  it("runs the browser gate only against main Production and binds it to github.sha", () => {
    const workflow = read(".github/workflows/b9-production-browser-e2e.yml");
    expect(workflow).toContain("branches:\n      - main");
    expect(workflow).toContain("CVENGINE_EXPECTED_SHA: ${{ github.sha }}");
    expect(workflow).toContain("https://harvard-ats-resume.vercel.app");
    expect(workflow).toContain("playwright==1.55.0");
    expect(workflow).toContain("tests/b9/production-browser-e2e.py");
  });

  it("certifies upload, explicit verification, artifact exports, reload and deletion", () => {
    const script = read("tests/b9/production-browser-e2e.py");
    expect(script).toContain("DOCX_UPLOAD_AND_REVIEW_PROPOSAL");
    expect(script).toContain("IMPORTED_EVIDENCE_EXPLICITLY_VERIFIED");
    expect(script).toContain("GENERAL_RESUME_ARTIFACT_CREATED");
    expect(script).toContain("DOCX_PDF_TXT_PROVENANCE_PARITY");
    expect(script).toContain("HISTORICAL_ARTIFACT_RELOAD");
    expect(script).toContain("ACCOUNT_DELETE_AND_SESSION_DENIAL");
    expect(script).toContain("B9_BROWSER_EXACT_RUNTIME_NOT_READY");
    expect(script).toContain("B9_BROWSER_SIGNUP_REQUIRES_EMAIL_CONFIRMATION");
  });
});
