import { describe, expect, it } from "vitest";
import type { GeneratedResumeDocument } from "./resume/GeneratedResumeDocument";
import {
  buildImprovementSemanticLines,
  diagnoseImprovementLayout,
} from "../application/resume/ResumeImprovementArtifactAdapter";
import {
  renderV12ResumeDocx,
  renderV12ResumePdf,
  renderV12ResumeText,
  type V12ResumeSemanticLine,
} from "../application/resume/V12ProfessionalResumeRenderer";
import {
  V12_RESUME_TEXT_MAX_LINE_LENGTH,
  wrapV12ResumeArtifactText,
} from "../application/resume/V12ReadableResumeText";

const owner = "12000000-0000-4000-8000-000000000201";
const sourceDocumentId = "12000000-0000-4000-8000-000000000202";
const sourceReceiptId = "12000000-0000-4000-8000-000000000203";
const sourceSha = "a".repeat(64);
const ref = (ordinal: number) => ({
  proposalId: `12000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`,
  ordinal,
  sourceLine: ordinal,
  sourceTextSha256: String(ordinal).repeat(64).slice(0, 64),
});
const unit = (text: string, ordinal: number) => ({ text, sourceRefs: [ref(ordinal)] });

function document(): GeneratedResumeDocument {
  return {
    id: "12000000-0000-4000-8000-000000000204",
    ownerUserId: owner,
    sourceDocumentId,
    sourceReceiptId,
    sourceDocumentSha256: sourceSha,
    documentVersion: "v12-generated-resume-document-v1",
    editorStatus: "AI_EDITED",
    locale: "es-PE",
    header: {
      displayName: unit("Ada Candidate", 1),
      headline: unit("SOFTWARE ENGINEER | FULL STACK", 2),
      contactLines: [
        unit("Lima, Perú", 3),
        unit("ada@example.test", 4),
        unit("https://example.test/ada", 5),
      ],
      sourceRefs: [ref(1), ref(2), ref(3), ref(4), ref(5)],
    },
    summary: unit("Software Engineer con experiencia construyendo productos end-to-end.", 6),
    experience: [{
      title: unit("Full Stack Developer", 7),
      subtitle: unit("Example Labs", 8),
      metaLines: [unit("Feb. 2025 - Actualidad", 9), unit("Lima, Perú", 10)],
      summary: null,
      bullets: [unit("Diseñé e implementé una plataforma con APIs, datos y despliegue reproducible.", 11)],
      sourceRefs: [ref(7), ref(8), ref(9), ref(10), ref(11)],
    }],
    projects: [{
      title: unit("CV Engine", 12),
      subtitle: null,
      metaLines: [unit("Next.js | TypeScript | PostgreSQL | Applied AI", 13)],
      summary: unit("Plataforma para mejorar CVs preservando evidencia y trazabilidad.", 14),
      bullets: [],
      sourceRefs: [ref(12), ref(13), ref(14)],
    }],
    education: [],
    certifications: [],
    skillGroups: [{
      label: "Full Stack / Mobile",
      items: [unit("Java", 15), unit("Spring Boot", 16), unit("React", 17)],
      sourceRefs: [ref(15), ref(16), ref(17)],
    }],
    languageGroups: [{
      label: "Idiomas",
      items: [unit("Español: Nativo", 18), unit("Inglés: B1", 19)],
      sourceRefs: [ref(18), ref(19)],
    }],
    otherGroups: [],
    omittedSourceOrdinals: [],
    sourceProvenanceIndex: Array.from({ length: 19 }, (_, index) => ref(index + 1)),
    createdAt: "2026-09-15T02:00:00.000Z",
  };
}

describe("v1.2 professional resume presentation", () => {
  it("builds a real CV hierarchy instead of flattening every line into body text", () => {
    const lines = buildImprovementSemanticLines(document());
    expect(lines.slice(0, 4)).toEqual([
      { kind: "NAME", text: "Ada Candidate" },
      { kind: "HEADLINE", text: "SOFTWARE ENGINEER | FULL STACK" },
      { kind: "CONTACT", text: "Lima, Perú | ada@example.test | https://example.test/ada" },
      { kind: "HEADING", text: "Perfil profesional" },
    ]);
    expect(lines).toContainEqual({ kind: "ENTRY", text: "Full Stack Developer | Example Labs" });
    expect(lines).toContainEqual({ kind: "ENTRY_META", text: "Feb. 2025 - Actualidad | Lima, Perú" });
    expect(lines).toContainEqual({ kind: "LABELED_BODY", text: "Full Stack / Mobile: Java | Spring Boot | React" });
  });

  it("renders a compact Arial DOCX with centered identity, section rules, hanging bullets and real links", () => {
    const raw = new TextDecoder().decode(renderV12ResumeDocx(buildImprovementSemanticLines(document())));
    expect(raw).toContain("word/styles.xml");
    expect(raw).toContain('w:ascii="Arial"');
    expect(raw).toContain('<w:jc w:val="center"/>');
    expect(raw).toContain('w:color w:val="123456"');
    expect(raw).toContain('w:color="B9C4CF"');
    expect(raw).toContain('<w:ind w:left="230" w:hanging="173"/>');
    expect(raw).toContain('Target="https://example.test/ada" TargetMode="External"');
    expect(raw).toContain("Ada Candidate");
    expect(raw).toContain("Full Stack Developer | Example Labs");
  });

  it("renders the same ATS-readable hierarchy as text PDF without image-only content", () => {
    const raw = new TextDecoder().decode(renderV12ResumePdf(buildImprovementSemanticLines(document())));
    expect(raw.startsWith("%PDF-1.4")).toBe(true);
    expect(raw).toContain("/Helvetica-Bold");
    expect(raw).toContain("/Helvetica-Oblique");
    expect(raw).toContain("Ada Candidate");
    expect(raw).toContain("Full Stack Developer | Example Labs");
    expect(raw).toContain("RG 0.6 w");
    expect(raw).not.toContain("/Subtype /Image");
  });

  it("keeps the auxiliary TXT artifact human-readable without changing resume semantics", () => {
    const lines: V12ResumeSemanticLine[] = [
      { kind: "HEADING", text: "Experience" },
      {
        kind: "BODY",
        text: "Designed and delivered a production platform spanning application architecture, backend APIs, relational data modeling, automated tests, CI/CD workflows, observability, deployment controls, and operational support while preserving evidence and release traceability across the complete engineering lifecycle.",
      },
      {
        kind: "BULLET",
        text: "Built a deliberately long bullet that validates continuation indentation while keeping every generated text line inside the certified readability ceiling without weakening or deleting any factual content from the resume artifact.",
      },
    ];
    const raw = renderV12ResumeText(lines);
    const wrapped = wrapV12ResumeArtifactText(raw);
    expect(raw.length).toBeGreaterThan(wrapped.split("\n")[1]!.length);
    expect(Math.max(...wrapped.split("\n").map((line) => line.length))).toBeLessThanOrEqual(V12_RESUME_TEXT_MAX_LINE_LENGTH);
    expect(wrapped).toContain("Designed and delivered a production platform");
    expect(wrapped).toContain("- Built a deliberately long bullet");
    expect(wrapped.endsWith("\n")).toBe(true);
  });

  it("diagnoses actual professional-layout pagination rather than a fixed line-count approximation", () => {
    const longLines: V12ResumeSemanticLine[] = Array.from({ length: 60 }, (_, index) => ({
      kind: "BODY",
      text: `Compact resume line ${index + 1}`,
    }));
    const layout = diagnoseImprovementLayout(longLines);
    expect(layout.pageCount).toBe(2);
    expect(layout.sparseTrailingPage).toBe(true);
    expect(layout.trailingPageFillRatio).toBeLessThan(0.32);
  });
});
