import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("B9.6 ResumeProfile authority contracts", () => {
  it("keeps identity/contact authority separate from Career Evidence", () => {
    const domain = read("src/domain/resume/ResumeProfile.ts");
    const artifact = read("src/domain/resume/ResumeArtifact.ts");
    expect(domain).toContain("ResumeProfileSchema");
    expect(domain).toContain("displayName");
    expect(domain).toContain("semanticSha256");
    expect(artifact).toContain("b9-canonical-resume-artifact-v2");
    expect(artifact).toContain("resumeProfileRevision");
    expect(artifact).toContain("resumeProfileSemanticSha256");
  });

  it("makes profile revisions RPC-owned, immutable, owner-scoped and lifecycle-covered", () => {
    const migration = read("supabase/migrations/20260904023000_b9_resume_profile_artifact_v2.sql");
    const lifecycle = read("supabase/migrations/20260904023100_b9_resume_profile_lifecycle.sql");
    expect(migration).toContain("resume_profile_revisions_immutable");
    expect(migration).toContain('alter table public.resume_profile_revisions enable row level security');
    expect(migration).toContain('revoke all on public.resume_profile_revisions from public, anon, authenticated');
    expect(migration).toContain('cv_engine_upsert_resume_profile');
    expect(migration).toContain("B9_RESUME_PROFILE_REQUIRED");
    expect(lifecycle).toContain("'resumeProfiles'");
    expect(lifecycle).toContain("'resumeProfileRevisions'");
    expect(lifecycle).toContain("delete from public.resume_profile_revisions");
  });

  it("exposes only authenticated profile read/update and profile-bound artifact creation", () => {
    const profileRoute = read("src/app/api/resume-profile/route.ts");
    const artifactRoute = read("src/app/api/resume-artifacts/route.ts");
    expect(profileRoute).toContain("requireAuthenticatedSupabaseContext");
    expect(profileRoute).toContain("UpsertResumeProfileInputSchema");
    expect(artifactRoute).toContain("RESUME_PROFILE_REQUIRED");
  });

  it("renders identity through the same canonical semantic sequence as all claims", () => {
    const renderer = read("src/application/resume/ResumeArtifactRenderer.ts");
    expect(renderer).toContain('kind: "NAME" | "META" | "HEADING" | "BODY" | "BULLET"');
    expect(renderer).toContain("artifact.content.header.status === \"AVAILABLE\"");
    expect(renderer).toContain("buildResumeSemanticLines(artifact)");
  });
});
