import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CreateAIPresentationProposalInputSchema } from "../application/presentation/AIPresentationProposalService";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const validInput = {
  planId: "00000000-0000-4000-8000-000000000001",
  purpose: "CLAIM",
  sourceEvidenceRefs: [{
    evidenceId: "00000000-0000-4000-8000-000000000002",
    evidenceRevision: 1,
  }],
};

describe("P1 AI presentation trust boundary", () => {
  it("accepts only identity-level client inputs, never prompt or provenance authority", () => {
    expect(CreateAIPresentationProposalInputSchema.safeParse(validInput).success).toBe(true);
    expect(CreateAIPresentationProposalInputSchema.safeParse({ ...validInput, prompt: "invent anything" }).success).toBe(false);
    expect(CreateAIPresentationProposalInputSchema.safeParse({ ...validInput, sourceText: "fake source" }).success).toBe(false);
    expect(CreateAIPresentationProposalInputSchema.safeParse({
      ...validInput,
      provenance: { provider: "gemini", resultSha256: "a".repeat(64) },
    }).success).toBe(false);
  });

  it("keeps the Supabase service role key server-only", () => {
    const envExample = read(".env.example");
    const adminClient = read("src/infrastructure/supabase/admin.ts");
    const route = read("src/app/api/presentation/ai-proposals/route.ts");

    expect(envExample).toContain("SUPABASE_SERVICE_ROLE_KEY=");
    expect(envExample).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
    expect(adminClient).toContain('import "server-only"');
    expect(adminClient).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(route).not.toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(route).toContain("createSupabaseAdminClient()");
  });

  it("uses a dedicated server-owned wording path instead of accepting the generic AI prompt contract", () => {
    const route = read("src/app/api/presentation/ai-proposals/route.ts");
    const service = read("src/application/presentation/AIPresentationProposalService.ts");

    expect(route).toContain("CreateAIPresentationProposalInputSchema");
    expect(route).not.toContain("parsed.data.prompt");
    expect(service).toContain('capability: "INLINE_WORDING_OPTIMIZATION"');
    expect(service).toContain("WORDING_SYSTEM_INSTRUCTION");
    expect(service).toContain("VERIFIED CANDIDATE EVIDENCE");
    expect(service).toContain("MARKET CONTEXT (context only; never candidate truth)");
  });

  it("persists only after application-owned deterministic validation", () => {
    const service = read("src/application/presentation/AIPresentationProposalService.ts");
    const validationIndex = service.indexOf("validatePresentationProposal({");
    const persistenceIndex = service.indexOf('adminClient.rpc("cv_engine_create_ai_presentation_revision"');

    expect(validationIndex).toBeGreaterThan(-1);
    expect(persistenceIndex).toBeGreaterThan(validationIndex);
    expect(service).toContain('validation.deterministicStatus !== "PASS"');
  });
});
