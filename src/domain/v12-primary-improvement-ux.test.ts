import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("v1.2 primary Improve Resume UX", () => {
  it("lands authenticated users on the task-oriented improvement workflow", () => {
    const workspace = read("src/components/CareerIntelligenceWorkspace.tsx");
    expect(workspace).toContain('useState<Surface>("IMPROVE")');
    expect(workspace).toContain("<ResumeImprovementWorkspace />");
    expect(workspace).toContain("Advanced tools");
    expect(workspace).toContain("Career Evidence");
    expect(workspace.indexOf("Improve Resume")).toBeLessThan(workspace.indexOf("Career Evidence"));
  });

  it("keeps bounded-context mechanics out of the primary user task", () => {
    const primary = read("src/components/improve/ResumeImprovementWorkspace.tsx");
    expect(primary).toContain("Improve your resume");
    expect(primary).toContain("Resume · PDF or DOCX");
    expect(primary).toContain("Job description");
    expect(primary).toContain("Your improved resume is ready");
    expect(primary).toContain("Unsupported new claims");
    expect(primary).toContain("Download DOCX");
    expect(primary).toContain("Download PDF");
    expect(primary).toContain("Review changes");
    for (const internalTerm of ["TruthClass", "ResumePlan", "PresentationRevision", "NEEDS_REVIEW", "source ordinal", "evidence kind"]) {
      expect(primary).not.toContain(internalTerm);
    }
  });

  it("executes the one-shot server path through source, semantics, editor, Guardian, persistence and artifact rendering", () => {
    const route = read("src/app/api/resume-improvements/route.ts");
    const sequence = [
      "recordResumeImport",
      "understandResumeSemantics",
      "improveResumeHolistically",
      "guardAndRepairResume",
      "recordResumeImprovementRun",
      "renderResumeImprovementRunArtifact",
    ];
    let cursor = -1;
    for (const token of sequence) {
      const next = route.indexOf(token, cursor + 1);
      expect(next, `${token} must exist after the previous golden-path stage`).toBeGreaterThan(cursor);
      cursor = next;
    }
    expect(route).toContain("requireAuthenticatedSupabaseContext");
    expect(route).toContain("x-cvengine-byok-key");
    expect(route).toContain("targetTextHash: targetHash(targetText)");
    expect(route).toContain('guardian.report.decision === "REPAIRED_PASS"');
  });

  it("serves all four deterministic artifact surfaces from the durable run", () => {
    const route = read("src/app/api/resume-improvements/route.ts");
    expect(route).toContain('format === "docx"');
    expect(route).toContain('format === "pdf"');
    expect(route).toContain('format === "json"');
    expect(route).toContain('format !== "text"');
    expect(route).toContain("loadResumeImprovementRun");
    expect(route).toContain("renderResumeImprovementRunArtifact(run)");
  });
});
