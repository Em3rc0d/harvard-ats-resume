import { describe, expect, it } from "vitest";
import type { CandidateResumeDocument, ResumeSourceRef } from "./resume/CandidateResumeDocument";
import type { GeneratedResumeDocument } from "./resume/GeneratedResumeDocument";
import {
  assessResumeOutputQuality,
  preserveCriticalSourcePresentation,
} from "../application/resume/ResumeOutputQualityService";
import {
  buildImprovementSemanticLines,
  diagnoseImprovementLayout,
} from "../application/resume/ResumeImprovementArtifactAdapter";

const REF: ResumeSourceRef = {
  proposalId: "12000000-0000-4000-8000-000000000111",
  ordinal: 1,
  sourceLine: 1,
  sourceTextSha256: "a".repeat(64),
};
const SOURCE_PROFILE = "Software Engineer con experiencia profesional construyendo productos end-to-end, integrando backend, frontend, mobile, datos y automatización. Combina arquitectura de software, pensamiento de sistemas y visión de producto para convertir problemas reales en soluciones mantenibles, seguras, escalables y operables.";
const SOURCE_BULLET = "Diseño y desarrollo soluciones de software end-to-end, participando desde el análisis de requerimientos hasta implementación, integración, despliegue y evolución en producción.";

const source: CandidateResumeDocument = {
  id: "12000000-0000-4000-8000-000000000112",
  ownerUserId: "12000000-0000-4000-8000-000000000113",
  sourceReceiptId: "12000000-0000-4000-8000-000000000114",
  sourceDocumentSha256: "b".repeat(64),
  documentVersion: "v12-candidate-resume-document-v1",
  understandingStatus: "AI_STRUCTURED",
  locale: "es-PE",
  identity: null,
  profile: { value: SOURCE_PROFILE, sourceRefs: [REF] },
  employment: [{
    role: null,
    organization: null,
    startDateText: null,
    endDateText: null,
    location: null,
    summary: null,
    bullets: [{ value: SOURCE_BULLET, sourceRefs: [REF] }],
    technologies: [],
    sourceRefs: [REF],
  }],
  projects: [],
  education: [],
  certifications: [],
  skillGroups: [],
  languages: [],
  otherSections: [],
  unassignedSourceOrdinals: [],
  provenanceIndex: [REF],
  createdAt: "2026-09-15T00:00:00.000Z",
};

function generated(summary: string, bullet: string, locale = "es-PE"): GeneratedResumeDocument {
  return {
    id: "12000000-0000-4000-8000-000000000115",
    ownerUserId: source.ownerUserId,
    sourceDocumentId: source.id,
    sourceReceiptId: source.sourceReceiptId,
    sourceDocumentSha256: source.sourceDocumentSha256,
    documentVersion: "v12-generated-resume-document-v1",
    editorStatus: "AI_EDITED",
    locale,
    header: null,
    summary: { text: summary, sourceRefs: [REF] },
    experience: [{
      title: null,
      subtitle: null,
      metaLines: [],
      summary: null,
      bullets: [{ text: bullet, sourceRefs: [REF] }],
      sourceRefs: [REF],
    }],
    projects: [],
    education: [],
    certifications: [],
    skillGroups: [],
    languageGroups: [],
    otherGroups: [],
    omittedSourceOrdinals: [],
    sourceProvenanceIndex: [REF],
    createdAt: "2026-09-15T00:01:00.000Z",
  };
}

describe("v1.2 real-CV output quality", () => {
  it("rejects a factual near-copy as not materially improved", () => {
    const assessment = assessResumeOutputQuality(source, generated(SOURCE_PROFILE, SOURCE_BULLET));
    expect(assessment.localeConsistent).toBe(true);
    expect(assessment.summaryPositioningPreserved).toBe(true);
    expect(assessment.materialImprovementPresent).toBe(false);
    expect(assessment.nearCopyNarrativeUnits).toBeGreaterThan(0);
    expect(assessment.passed).toBe(false);
  });

  it("recognizes a source-backed rewrite as materially changed", () => {
    const assessment = assessResumeOutputQuality(source, generated(
      "Software Engineer enfocado en productos end-to-end que conecta arquitectura, sistemas, producto, frontend, backend, mobile, datos y automatización para entregar software mantenible, seguro y operable.",
      "Lidero el ciclo técnico de soluciones end-to-end: convierto requerimientos en arquitectura, implementación e integraciones y acompaño su despliegue y evolución productiva.",
    ));
    expect(assessment.materialImprovementPresent).toBe(true);
    expect(assessment.localeConsistent).toBe(true);
  });

  it("restores a source-authored summary when aggressive concision removes positioning", () => {
    const repaired = preserveCriticalSourcePresentation(
      source,
      generated("Software Engineer con experiencia profesional.", SOURCE_BULLET, "en-US"),
    );
    expect(repaired.locale).toBe("es-PE");
    expect(repaired.summary?.text).toBe(SOURCE_PROFILE);
    expect(repaired.summary?.sourceRefs).toEqual([REF]);
  });

  it("renders section labels in the resume locale instead of hard-coded English", () => {
    const document = generated(
      "Software Engineer orientado a productos end-to-end con arquitectura, sistemas y automatización aplicada.",
      "Convierto requerimientos en soluciones desplegables, integrando arquitectura, implementación y operación productiva.",
    );
    document.skillGroups = [{ label: "Software Engineering", items: [{ text: "Arquitectura", sourceRefs: [REF] }], sourceRefs: [REF] }];
    document.languageGroups = [{ label: "Idiomas", items: [{ text: "Español (Nativo)", sourceRefs: [REF] }], sourceRefs: [REF] }];
    const headings = buildImprovementSemanticLines(document).filter((line) => line.kind === "HEADING").map((line) => line.text);
    expect(headings).toContain("Perfil profesional");
    expect(headings).toContain("Experiencia profesional");
    expect(headings).toContain("Competencias técnicas");
    expect(headings).toContain("Idiomas");
    expect(headings).not.toContain("Professional Summary");
    expect(headings).not.toContain("Experience");
  });

  it("flags a mostly-empty trailing PDF page before release", () => {
    const lines = Array.from({ length: 50 }, (_, index) => ({ kind: "BODY" as const, text: `Line ${index + 1}` }));
    const layout = diagnoseImprovementLayout(lines);
    expect(layout.pageCount).toBe(2);
    expect(layout.sparseTrailingPage).toBe(true);
  });
});
