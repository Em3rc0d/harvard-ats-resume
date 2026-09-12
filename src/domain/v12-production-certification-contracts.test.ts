import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("v1.2 production certification contract", () => {
  it("binds the production certifier to the exact pushed SHA", () => {
    const workflow = read(".github/workflows/v12-production-browser-e2e.yml");
    expect(workflow).toContain("CVENGINE_EXPECTED_SHA: ${{ github.sha }}");
    expect(workflow).toContain("tests/b9/production-runtime-preflight.py");
    expect(workflow).toContain("tests/v12/production-improve-resume-cert.py");
    expect(workflow).toContain("branches:\n      - main");
  });

  it("certifies the primary outcome rather than bounded-context administration", () => {
    const harness = read("tests/v12/production-improve-resume-cert.py");
    for (const required of [
      "PRIMARY_IMPROVE_RESUME_LANDING",
      "IMPROVEMENT_HTTP_201_GUARDIAN_ZERO",
      "SOURCE_VS_IMPROVED_RENDERED",
      "DOCX_PDF_TXT_PROVENANCE_VALID",
      "CANDIDATE_ASSERTIONS_REMAIN_USABLE",
      "HISTORICAL_IMPROVEMENT_RUN_RELOAD",
      "ACCOUNT_EXPORT_INCLUDES_IMPROVEMENT_RUN",
      "REPRESENTATIVE_CV_QUALITY_ACCEPTED",
      "ACCOUNT_DELETE_AND_SESSION_DENIAL",
    ]) {
      expect(harness).toContain(required);
    }
    expect(harness).toContain('name="Improve my resume"');
    expect(harness).toContain('"unsupportedNewClaims"');
    expect(harness).toContain('payload.get("export")');
    expect(harness).not.toContain("Accept as NEEDS_REVIEW");
  });

  it("uses a representative complex resume without candidate PII", () => {
    const harness = read("tests/v12/production-improve-resume-cert.py");
    for (const section of ["PERFIL PROFESIONAL", "COMPETENCIAS TÉCNICAS", "EXPERIENCIA PROFESIONAL", "PRODUCTOS Y PROYECTOS", "EDUCACIÓN", "CERTIFICACIONES", "IDIOMAS"]) {
      expect(harness).toContain(section);
    }
    expect(harness).toContain("Northstar Systems");
    expect(harness).toContain("RoutePulse");
    expect(harness).toContain("SignalOps");
    expect(harness).toContain("CV Forge");
    expect(harness).not.toContain("Eduardo Farid");
    expect(harness).not.toContain("farid.merino");
  });

  it("emits the same privacy-preserving quality receipt contract frozen by I9", () => {
    const harness = read("tests/v12/production-improve-resume-cert.py");
    expect(harness).toContain('"schemaVersion": "v12-real-cv-quality-receipt-v1"');
    expect(harness).toContain('"evaluator": "AUTOMATED_REPRESENTATIVE_FIXTURE"');
    expect(harness).toContain('"unsupportedNewClaims"');
    expect(harness).toContain('"inventedMetrics"');
    expect(harness).toContain('"sourceToOutputProvenancePresent"');
  });
});
