import { ResumeArtifactSchema, type ResumeArtifact } from "../../src/domain/resume/ResumeArtifact";

type Section = "PROFILE" | "EXPERIENCE" | "PROJECTS" | "EDUCATION" | "CERTIFICATIONS" | "SKILLS" | "LANGUAGES";
type SelectionReason = "GENERAL_VERIFIED" | "TARGET_MATCH" | "TARGET_POTENTIAL_MATCH";

type SyntheticItem = {
  section: Section;
  text: string;
  presentation?: boolean;
  selectionReason?: SelectionReason;
};

type FixtureOptions = {
  mode?: "GENERAL" | "TARGETED";
  displayName?: string;
  headline?: string;
  contactLines?: string[];
  items: SyntheticItem[];
};

const SECTION_ORDER: Section[] = ["EXPERIENCE", "PROJECTS", "EDUCATION", "CERTIFICATIONS", "SKILLS", "LANGUAGES"];
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sha = (n: number) => n.toString(16).padStart(64, "0");

function makeArtifact(fixtureId: number, options: FixtureOptions): ResumeArtifact {
  const mode = options.mode ?? "GENERAL";
  const sourceResumePlanId = uuid(100_000 + fixtureId);
  const sourceResumePlanSemanticKey = sha(200_000 + fixtureId);
  const rows = options.items.map((item, index) => {
    const evidenceTextSha256 = sha(fixtureId * 10_000 + index * 3 + 1);
    const presentationTextSha256 = item.presentation ? sha(fixtureId * 10_000 + index * 3 + 2) : null;
    return {
      item,
      ordinal: index + 1,
      sourcePlanItemId: uuid(fixtureId * 1_000 + index + 1),
      evidenceId: uuid(fixtureId * 2_000 + index + 1),
      evidenceTextSha256,
      presentationRevisionId: item.presentation ? uuid(fixtureId * 3_000 + index + 1) : null,
      presentationTextSha256,
    };
  });
  const profileRows = rows.filter((row) => row.item.section === "PROFILE");
  const sections = SECTION_ORDER.flatMap((section) => {
    const sectionRows = rows.filter((row) => row.item.section === section);
    if (sectionRows.length === 0) return [];
    const layout = section === "CERTIFICATIONS" || section === "SKILLS" || section === "LANGUAGES" ? "INLINE_LIST" as const : "BULLETS" as const;
    return [{
      section,
      layout,
      entries: sectionRows.map((row) => ({
        sourcePlanItemId: row.sourcePlanItemId,
        evidenceId: row.evidenceId,
        evidenceRevision: 1,
        renderedText: row.item.text,
      })),
    }];
  });
  const artifact = {
    id: uuid(300_000 + fixtureId),
    ownerUserId: uuid(400_000 + fixtureId),
    mode,
    sourceResumePlanId,
    sourceResumePlanSemanticKey,
    artifactVersion: "b9-canonical-resume-artifact-v2" as const,
    composerVersion: "b9-deterministic-resume-composition-v2" as const,
    rendererContractVersion: "b9-ats-safe-single-column-v1" as const,
    careerEvidenceFingerprintSha256: sha(500_000 + fixtureId),
    artifactSemanticSha256: sha(600_000 + fixtureId),
    content: {
      header: {
        status: "AVAILABLE" as const,
        displayName: options.displayName ?? `Synthetic Candidate ${fixtureId}`,
        headline: options.headline ?? "Software Engineer",
        contactLines: options.contactLines ?? ["Synthetic City | synthetic@example.test"],
      },
      professionalSummary: profileRows.length === 0 ? null : {
        text: profileRows.map((row) => row.item.text).join(" "),
        sourcePlanItemIds: profileRows.map((row) => row.sourcePlanItemId),
        evidenceSources: profileRows.map((row) => ({ evidenceId: row.evidenceId, evidenceRevision: 1 })),
      },
      sections,
    },
    manifest: {
      sourceResumePlanId,
      sourceResumePlanSemanticKey,
      plannerVersion: "b9-deterministic-resume-plan-v2",
      composerVersion: "b9-deterministic-resume-composition-v2" as const,
      artifactVersion: "b9-canonical-resume-artifact-v2" as const,
      rendererContractVersion: "b9-ats-safe-single-column-v1" as const,
      careerEvidenceFingerprintSha256: sha(500_000 + fixtureId),
      resumeProfileRevision: 1,
      resumeProfileSemanticSha256: sha(700_000 + fixtureId),
      jobSnapshotId: mode === "TARGETED" ? uuid(800_000 + fixtureId) : null,
      opportunityAssessmentId: mode === "TARGETED" ? uuid(900_000 + fixtureId) : null,
      receipts: rows.map((row) => ({
        id: uuid(fixtureId * 4_000 + row.ordinal),
        ordinal: row.ordinal,
        sourcePlanItemId: row.sourcePlanItemId,
        evidenceId: row.evidenceId,
        evidenceRevision: 1,
        evidenceTextSha256: row.evidenceTextSha256,
        presentationRevisionId: row.presentationRevisionId,
        presentationTextSha256: row.presentationTextSha256,
        renderedTextSha256: row.presentationTextSha256 ?? row.evidenceTextSha256,
        section: row.item.section,
        selectionReason: row.item.selectionReason ?? (mode === "TARGETED" ? "TARGET_MATCH" : "GENERAL_VERIFIED"),
      })),
    },
    createdAt: "2026-09-04T02:20:00.000Z",
  };
  return ResumeArtifactSchema.parse(artifact);
}

export const EARLY_CAREER_ONE_PAGE = makeArtifact(1, {
  headline: "Backend / Full Stack Developer",
  items: [
    { section: "PROFILE", text: "Early-career developer building traceable backend systems and practical web applications." },
    { section: "PROJECTS", text: "Built a synthetic REST API with deterministic validation and PostgreSQL persistence.", presentation: true },
    { section: "PROJECTS", text: "Created a responsive portfolio that presents verified project evidence clearly." },
    { section: "EDUCATION", text: "B.Sc. candidate in Systems Engineering, Synthetic University." },
    { section: "SKILLS", text: "Java" },
    { section: "SKILLS", text: "PostgreSQL" },
    { section: "LANGUAGES", text: "Spanish and English" },
  ],
});

const experiencedText = (index: number) => `Owned synthetic platform service ${index + 1}, coordinating design, implementation, observability, reliability reviews, incident follow-up, documentation, and safe delivery across several internal consumers while preserving traceable technical decisions and stable operational boundaries.`;
export const EXPERIENCED_TWO_PAGE = makeArtifact(2, {
  headline: "Senior Platform Engineer",
  items: Array.from({ length: 18 }, (_, index) => ({ section: "EXPERIENCE" as const, text: experiencedText(index) })),
});

export const LONG_CONTACT_URL = "https://portfolio.example.test/projects/distributed-systems/provenance/architecture/decision-records/canonical-resume-artifact-with-a-deliberately-long-accessible-link";
export const LONG_URL_CONTACT = makeArtifact(3, {
  headline: "Software Engineer",
  contactLines: [`Synthetic City | synthetic@example.test | ${LONG_CONTACT_URL}`],
  items: [
    { section: "PROJECTS", text: "Published a synthetic project reference with durable provenance." },
    { section: "SKILLS", text: "TypeScript" },
  ],
});

export const UNICODE_SPANISH = makeArtifact(4, {
  displayName: "Candidato Sintético",
  headline: "Ingeniero de Sistemas",
  contactLines: ["Lima, Perú | candidato@example.test"],
  items: [
    { section: "PROFILE", text: "Ingeniería de Sistemas orientada a servicios confiables, trazabilidad y mejora continua." },
    { section: "PROJECTS", text: "Diseñé e implementé una aplicación con información verificable y documentación técnica." },
    { section: "LANGUAGES", text: "Español e inglés" },
  ],
});

export const MULTIPLE_CERTIFICATIONS_PROJECTS = makeArtifact(5, {
  items: [
    { section: "PROJECTS", text: "Built synthetic inventory service." },
    { section: "PROJECTS", text: "Built synthetic scheduling service." },
    { section: "PROJECTS", text: "Built synthetic analytics service." },
    { section: "CERTIFICATIONS", text: "Synthetic Cloud Foundations" },
    { section: "CERTIFICATIONS", text: "Synthetic Database Fundamentals" },
    { section: "CERTIFICATIONS", text: "Synthetic Secure Coding" },
    { section: "CERTIFICATIONS", text: "Synthetic API Design" },
    { section: "SKILLS", text: "Java" },
    { section: "SKILLS", text: "Angular" },
    { section: "SKILLS", text: "PostgreSQL" },
  ],
});

export const TARGETED_FORBIDDEN_JOB_TRUTH = [
  "Requires synthetic skill the candidate does not possess.",
  "Unknown target requirement with no candidate evidence.",
] as const;
export const TARGETED_GAP_UNKNOWN = makeArtifact(6, {
  mode: "TARGETED",
  headline: "Backend Engineer",
  items: [
    { section: "EXPERIENCE", text: "Implemented a verified backend integration for the synthetic target.", selectionReason: "TARGET_MATCH" },
    { section: "SKILLS", text: "PostgreSQL", selectionReason: "TARGET_POTENTIAL_MATCH" },
  ],
});

export const NO_CLOUD_SOURCE_WORDING = [
  "Maintained source wording without AI transformation.",
  "Built a deterministic source-preserving export.",
  "PostgreSQL",
] as const;
export const NO_CLOUD_SOURCE_ONLY = makeArtifact(7, {
  headline: "Backend Developer",
  items: [
    { section: "EXPERIENCE", text: NO_CLOUD_SOURCE_WORDING[0] },
    { section: "PROJECTS", text: NO_CLOUD_SOURCE_WORDING[1] },
    { section: "SKILLS", text: NO_CLOUD_SOURCE_WORDING[2] },
  ],
});

export const B9_RENDERING_FIXTURES = [
  EARLY_CAREER_ONE_PAGE,
  EXPERIENCED_TWO_PAGE,
  LONG_URL_CONTACT,
  UNICODE_SPANISH,
  MULTIPLE_CERTIFICATIONS_PROJECTS,
  TARGETED_GAP_UNKNOWN,
  NO_CLOUD_SOURCE_ONLY,
] as const;
