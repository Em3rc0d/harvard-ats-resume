import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("B8 product acceptance source contracts", () => {
  it("routes password signup through the PKCE callback instead of a deployment default", () => {
    const auth = readFileSync("src/components/first-run/AuthPanel.tsx", "utf8");
    expect(auth).toContain('`${window.location.origin}/auth/callback`');
    expect(auth).toContain("emailRedirectTo: redirectTo");
  });

  it("restores durable consent and AI preference for returning authenticated users", () => {
    const firstRun = readFileSync("src/components/first-run/FirstRunExperience.tsx", "utf8");
    const consent = readFileSync("src/app/api/consent/route.ts", "utf8");
    expect(firstRun).toContain('type Step = "BOOTSTRAP"');
    expect(firstRun).toContain('fetch("/api/session", { cache: "no-store" })');
    expect(firstRun).toContain('fetch("/api/consent", { cache: "no-store" })');
    expect(firstRun).toContain("selectMode(restoredMode)");
    expect(firstRun).toContain('restoredMode === "BYOK_GEMINI"');
    expect(firstRun).toContain('restoredMode === "PLATFORM_GEMINI" && !platformGeminiAvailable');
    expect(firstRun).toContain("vNext · B9");
    expect(firstRun).not.toContain("vNext · B2");
    expect(consent).toContain("export async function GET()");
    expect(consent).toContain('.from("consent_receipts")');
    expect(consent).toContain("CURRENT_TRUST_DISCLOSURE_VERSION");
    expect(consent).toContain('"Cache-Control": "private, no-store"');
  });

  it("does not restore a BYOK secret from durable storage", () => {
    const firstRun = readFileSync("src/components/first-run/FirstRunExperience.tsx", "utf8");
    const provider = readFileSync("src/components/providers/AIAccessSessionProvider.tsx", "utf8");
    const consent = readFileSync("src/app/api/consent/route.ts", "utf8");
    expect(firstRun).toContain('restoredMode === "BYOK_GEMINI"');
    expect(firstRun).toContain('setStep("AI_ACCESS")');
    expect(provider).toContain("TransientBYOKStore");
    expect(consent).not.toMatch(/credential|api[_-]?key|byok[_-]?key/i);
  });

  it("exposes owner lifecycle actions through the product UI", () => {
    const shell = readFileSync("src/components/CareerIntelligenceWorkspace.tsx", "utf8");
    const account = readFileSync("src/components/account/AccountLifecycleWorkspace.tsx", "utf8");
    expect(shell).toContain('"ACCOUNT"');
    expect(shell).toContain("<AccountLifecycleWorkspace />");
    expect(account).toContain('fetch("/api/account/export"');
    expect(account).toContain('fetch("/api/account/delete"');
    expect(account).toContain('const DELETE_CONFIRMATION = "DELETE_MY_ACCOUNT"');
    expect(account).toContain("window.confirm");
    expect(account).toContain("downloadJson");
  });

  it("does not silently classify manual Career Evidence", () => {
    const evidence = readFileSync("src/components/career/CareerEvidenceWorkspace.tsx", "utf8");
    expect(evidence).toContain('useState<CareerEvidenceKind | "">("")');
    expect(evidence).toContain("SELECT_EVIDENCE_KIND_REQUIRED");
    expect(evidence).toContain("Select evidence type");
    expect(evidence).not.toContain('useState<CareerEvidenceKind>("EMPLOYMENT")');
  });

  it("does not invent optional Career Target preferences", () => {
    const target = readFileSync("src/components/targets/CareerTargetWorkspace.tsx", "utf8");
    expect(target).not.toContain('useState("MID")');
    expect(target).not.toContain('useState("REMOTE")');
    expect(target).not.toContain('useState("FULL_TIME")');
    expect(target).toContain("preferredSeniorities: seniority ? [seniority] : []");
    expect(target).toContain("workModels: workModel ? [workModel] : []");
    expect(target).toContain("employmentTypes: employmentType ? [employmentType] : []");
    expect(target).toContain('<option value="">No preference</option>');
    expect(target).toContain("PRINCIPAL");
    expect(target).toContain("EXECUTIVE");
    expect(target).toContain("TEMPORARY");
  });

  it("requires an explicit Job Snapshot before assessment", () => {
    const assessment = readFileSync("src/components/assessments/AssessmentWorkspace.tsx", "utf8");
    expect(assessment).toContain("SELECT_JOB_SNAPSHOT_REQUIRED");
    expect(assessment).not.toContain("loadedJobs[0]");
    expect(assessment).toContain('mode === "NO_CLOUD_AI"');
  });

  it("requires explicit resume projection choices", () => {
    const resume = readFileSync("src/components/resume/ResumeWorkspace.tsx", "utf8");
    expect(resume).toContain('useState<ResumeMode | "">("")');
    expect(resume).toContain("SELECT_RESUME_MODE_REQUIRED");
    expect(resume).toContain("SELECT_JOB_SNAPSHOT_REQUIRED");
    expect(resume).not.toContain("loadedJobs[0]");
    expect(resume).toContain("Select resume mode");
  });
});
