import { describe, expect, it } from "vitest";
import {
  renderResumeArtifactDocx,
  renderResumeArtifactPdf,
  renderResumeArtifactText,
} from "./ResumeArtifactRenderer";
import {
  B9_RENDERING_FIXTURES,
  EARLY_CAREER_ONE_PAGE,
  EXPERIENCED_TWO_PAGE,
  LONG_CONTACT_URL,
  LONG_URL_CONTACT,
  MULTIPLE_CERTIFICATIONS_PROJECTS,
  NO_CLOUD_SOURCE_ONLY,
  NO_CLOUD_SOURCE_WORDING,
  TARGETED_FORBIDDEN_JOB_TRUTH,
  TARGETED_GAP_UNKNOWN,
  UNICODE_SPANISH,
} from "../../../tests/b9/rendering-fixtures";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("B9 rendering acceptance fixtures", () => {
  it("publishes exactly the seven synthetic rendering fixtures required by the signed plan", () => {
    expect(B9_RENDERING_FIXTURES).toHaveLength(7);
  });

  it("keeps the early-career density target inside one PDF page", () => {
    const pdf = decode(renderResumeArtifactPdf(EARLY_CAREER_ONE_PAGE));
    expect(pdf).toMatch(/\/Count 1\b/);
    expect(renderResumeArtifactText(EARLY_CAREER_ONE_PAGE)).toContain("Backend / Full Stack Developer");
  });

  it("allows an experienced synthetic profile to expand to two pages instead of destructive compression", () => {
    const pdf = decode(renderResumeArtifactPdf(EXPERIENCED_TWO_PAGE));
    expect(pdf).toMatch(/\/Count 2\b/);
    expect(renderResumeArtifactText(EXPERIENCED_TWO_PAGE)).toContain("Owned synthetic platform service 18");
  });

  it("preserves a long contact URL as a real external DOCX hyperlink and wraps it in PDF", () => {
    const docx = decode(renderResumeArtifactDocx(LONG_URL_CONTACT));
    expect(docx).toContain("word/_rels/document.xml.rels");
    expect(docx).toContain('<w:hyperlink r:id="rIdLink1"');
    expect(docx).toContain(`Target="${LONG_CONTACT_URL}"`);
    expect(docx).toContain('TargetMode="External"');

    const pdf = decode(renderResumeArtifactPdf(LONG_URL_CONTACT));
    expect(pdf).toContain(LONG_CONTACT_URL.slice(0, 45));
    expect(pdf).toContain(LONG_CONTACT_URL.slice(-35));
  });

  it("preserves Spanish Unicode in DOCX and emits equivalent supported WinAnsi text in PDF", () => {
    const docx = decode(renderResumeArtifactDocx(UNICODE_SPANISH));
    expect(docx).toContain("Candidato Sintético");
    expect(docx).toContain("Diseñé e implementé una aplicación");
    expect(docx).toContain("Español e inglés");

    const pdf = decode(renderResumeArtifactPdf(UNICODE_SPANISH));
    expect(pdf).toContain("Ingenier\\355a de Sistemas");
    expect(pdf).toContain("Espa\\361ol e ingl\\351s");
  });

  it("retains multiple projects and certifications under deterministic semantic headings", () => {
    const text = renderResumeArtifactText(MULTIPLE_CERTIFICATIONS_PROJECTS);
    expect(text).toContain("Projects");
    expect(text).toContain("Certifications");
    expect(text).toContain("Built synthetic analytics service.");
    expect(text).toContain("Synthetic Secure Coding");
    expect(text).toContain("Synthetic API Design");
  });

  it("never renders GAP or UNKNOWN Job Truth into a targeted candidate artifact", () => {
    const outputs = [
      renderResumeArtifactText(TARGETED_GAP_UNKNOWN),
      decode(renderResumeArtifactDocx(TARGETED_GAP_UNKNOWN)),
      decode(renderResumeArtifactPdf(TARGETED_GAP_UNKNOWN)),
    ];
    expect(TARGETED_GAP_UNKNOWN.mode).toBe("TARGETED");
    expect(TARGETED_GAP_UNKNOWN.manifest.jobSnapshotId).not.toBeNull();
    expect(TARGETED_GAP_UNKNOWN.manifest.opportunityAssessmentId).not.toBeNull();
    for (const forbidden of TARGETED_FORBIDDEN_JOB_TRUTH) {
      for (const output of outputs) expect(output).not.toContain(forbidden);
    }
  });

  it("keeps no-cloud rendering on exact source wording with no PresentationRevision provenance", () => {
    const text = renderResumeArtifactText(NO_CLOUD_SOURCE_ONLY);
    for (const receipt of NO_CLOUD_SOURCE_ONLY.manifest.receipts) {
      expect(receipt.presentationRevisionId).toBeNull();
      expect(receipt.presentationTextSha256).toBeNull();
      expect(receipt.renderedTextSha256).toBe(receipt.evidenceTextSha256);
    }
    for (const sourceText of NO_CLOUD_SOURCE_WORDING) expect(text).toContain(sourceText);
  });
});
