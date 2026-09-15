import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resumeDownloadBaseName } from "../application/resume/ResumeDownloadFilename";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("v1.2 primary Improve Resume UX", () => {
  it("lands authenticated users on the task-oriented improvement workflow", () => {
    const workspace = read("src/components/CareerIntelligenceWorkspace.tsx");
    expect(workspace).toContain('useState<Surface>("IMPROVE")');
    expect(workspace).toContain("<ResumeImprovementWorkspace />");
    expect(workspace).toContain("Advanced tools");
    expect(workspace).toContain("Career Evidence");
    expect(workspace).toContain("Improve your resume · facts checked · ATS-safe downloads");
    expect(workspace.indexOf("Improve Resume")).toBeLessThan(workspace.indexOf("Career Evidence"));
  });

  it("keeps the default task simple and moves optional context behind progressive disclosure", () => {
    const primary = read("src/components/improve/ResumeImprovementWorkspace.tsx");
    expect(primary).toContain("Improve your resume");
    expect(primary).toContain("Resume · PDF or DOCX");
    expect(primary).toContain("Tailor to a job");
    expect(primary).toContain("<details");
    expect(primary).toContain("Job description");
    expect(primary).toContain("Your improved resume is ready");
    expect(primary).toContain("Facts checked against your original CV");
    expect(primary).toContain("No unsupported claims were added.");
    expect(primary).toContain("Download DOCX");
    expect(primary).toContain("Download PDF");
    expect(primary).toContain("Review changes");
    expect(primary).toContain("Advanced downloads");
    expect(primary).not.toContain("Independent Fact Guardian");
    expect(primary).not.toContain("Unsupported new claims:");
    for (const internalTerm of ["TruthClass", "ResumePlan", "PresentationRevision", "NEEDS_REVIEW", "source ordinal", "evidence kind"]) {
      expect(primary).not.toContain(internalTerm);
    }
  });

  it("turns backend failure codes into actionable primary-workflow messages", () => {
    const primary = read("src/components/improve/ResumeImprovementWorkspace.tsx");
    expect(primary).toContain("Your session ended. Sign in again to continue.");
    expect(primary).toContain("We couldn’t read this file. Try a text-based PDF or DOCX.");
    expect(primary).toContain("Reconnect AI access and try again.");
    expect(primary).toContain("We couldn’t finish your resume safely. Please try again.");
  });

  it("executes source, semantics, quality-aware editor selection, Guardian, persistence and artifact rendering", () => {
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
    expect(route).toContain('selectedGuarded.report.decision === "REPAIRED_PASS"');
    expect(route).toContain("assessResumeOutputQuality");
    expect(route).toContain("preserveCriticalSourcePresentation");
    expect(route).toContain("resumeOutputQualityRank");
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

  it("uses a professional candidate-facing filename instead of exposing an internal run UUID", () => {
    const generated = {
      header: {
        displayName: { text: "Eduardo Faríd Merino Córdova" },
      },
    } as Record<string, unknown>;
    expect(resumeDownloadBaseName(generated)).toBe("Eduardo_Farid_Merino_Cordova_CV");
    expect(resumeDownloadBaseName(null)).toBe("CV_Optimizado");

    const route = read("src/app/api/resume-improvements/route.ts");
    expect(route).toContain("resumeDownloadBaseName(run.generatedDocumentJson)");
    expect(route).not.toContain('filename="cvengine-${run.id}');
    expect(route).toContain('filename="${downloadBaseName}.docx"');
    expect(route).toContain('filename="${downloadBaseName}.pdf"');
  });
});
