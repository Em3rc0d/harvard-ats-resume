import { describe, expect, it } from "vitest";
import {
  CANDIDATE_RESUME_DOCUMENT_VERSION,
  CandidateResumeDocumentSchema,
  type ResumeSourceRef,
} from "./resume/CandidateResumeDocument";

const OWNER = "11111111-1111-4111-8111-111111111111";
const RECEIPT = "22222222-2222-4222-8222-222222222222";
const DOCUMENT = "33333333-3333-4333-8333-333333333333";

function sourceRef(ordinal: number): ResumeSourceRef {
  return {
    proposalId: `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`,
    ordinal,
    sourceLine: ordinal,
    sourceTextSha256: "a".repeat(64),
  };
}

function backed(value: string, refs: ResumeSourceRef[]) {
  return { value, sourceRefs: refs };
}

describe("v1.2 CandidateResumeDocument", () => {
  it("represents whole-CV semantic entities above mechanical provenance leaves", () => {
    const refs = [sourceRef(1), sourceRef(2), sourceRef(3), sourceRef(4)];
    const document = CandidateResumeDocumentSchema.parse({
      id: DOCUMENT,
      ownerUserId: OWNER,
      sourceReceiptId: RECEIPT,
      sourceDocumentSha256: "b".repeat(64),
      documentVersion: CANDIDATE_RESUME_DOCUMENT_VERSION,
      understandingStatus: "AI_STRUCTURED",
      locale: "es-PE",
      identity: {
        displayName: backed("Eduardo Example", [refs[0]]),
        headline: null,
        location: null,
        email: null,
        phone: null,
        links: [],
        sourceRefs: [refs[0]],
      },
      profile: null,
      employment: [{
        role: backed("Full Stack Developer", [refs[1]]),
        organization: backed("Example Tech", [refs[1]]),
        startDateText: null,
        endDateText: null,
        location: null,
        summary: null,
        bullets: [backed("Built maintainable APIs.", [refs[2]])],
        technologies: [],
        sourceRefs: [refs[1], refs[2]],
      }],
      projects: [],
      education: [],
      certifications: [],
      skillGroups: [{
        label: backed("Backend", [refs[3]]),
        skills: [backed("Spring Boot", [refs[3]])],
        sourceRefs: [refs[3]],
      }],
      languages: [],
      otherSections: [],
      unassignedSourceOrdinals: [],
      provenanceIndex: refs,
      createdAt: "2026-09-10T02:00:00.000Z",
    });

    expect(document.employment).toHaveLength(1);
    expect(document.employment[0]?.bullets[0]?.sourceRefs[0]?.ordinal).toBe(3);
    expect(document.skillGroups[0]?.skills[0]?.value).toBe("Spring Boot");
  });

  it("rejects provenance indexes with duplicate mechanical ordinals", () => {
    const ref = sourceRef(1);
    const result = CandidateResumeDocumentSchema.safeParse({
      id: DOCUMENT,
      ownerUserId: OWNER,
      sourceReceiptId: RECEIPT,
      sourceDocumentSha256: "b".repeat(64),
      documentVersion: CANDIDATE_RESUME_DOCUMENT_VERSION,
      understandingStatus: "PARTIAL_RECOVERY",
      locale: "es-PE",
      identity: null,
      profile: null,
      employment: [],
      projects: [],
      education: [],
      certifications: [],
      skillGroups: [],
      languages: [],
      otherSections: [],
      unassignedSourceOrdinals: [1],
      provenanceIndex: [ref, ref],
      createdAt: "2026-09-10T02:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unassigned ordinals that do not exist in source provenance", () => {
    const result = CandidateResumeDocumentSchema.safeParse({
      id: DOCUMENT,
      ownerUserId: OWNER,
      sourceReceiptId: RECEIPT,
      sourceDocumentSha256: "b".repeat(64),
      documentVersion: CANDIDATE_RESUME_DOCUMENT_VERSION,
      understandingStatus: "PARTIAL_RECOVERY",
      locale: "es-PE",
      identity: null,
      profile: null,
      employment: [],
      projects: [],
      education: [],
      certifications: [],
      skillGroups: [],
      languages: [],
      otherSections: [],
      unassignedSourceOrdinals: [2],
      provenanceIndex: [sourceRef(1)],
      createdAt: "2026-09-10T02:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});
