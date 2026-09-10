import { ResumeArtifactSchema, type ResumeArtifact } from "../../domain/resume/ResumeArtifact";
import {
  renderSemanticLinesDocx,
  renderSemanticLinesPdf,
  renderSemanticLinesText,
  type ResumeSemanticLine,
} from "./ATSResumeRenderer";

const SECTION_HEADINGS: Record<string, string> = {
  EXPERIENCE: "Experience",
  PROJECTS: "Projects",
  EDUCATION: "Education",
  CERTIFICATIONS: "Certifications",
  SKILLS: "Skills",
  LANGUAGES: "Languages",
};

function appendMultilineBullet(lines: ResumeSemanticLine[], text: string) {
  const sourceLines = text.replace(/\r\n?/g, "\n").split("\n");
  const first = sourceLines[0] ?? "";
  lines.push({ kind: "BULLET", text: first });
  for (const continuation of sourceLines.slice(1)) lines.push({ kind: "BODY", text: continuation });
}

export type { ResumeSemanticLine } from "./ATSResumeRenderer";

export function buildResumeSemanticLines(input: ResumeArtifact): ResumeSemanticLine[] {
  const artifact = ResumeArtifactSchema.parse(input);
  const lines: ResumeSemanticLine[] = [];
  if (artifact.content.header.status === "AVAILABLE") {
    lines.push({ kind: "NAME", text: artifact.content.header.displayName });
    if (artifact.content.header.headline) lines.push({ kind: "META", text: artifact.content.header.headline });
    for (const contactLine of artifact.content.header.contactLines) lines.push({ kind: "META", text: contactLine });
  }
  if (artifact.content.professionalSummary) {
    lines.push({ kind: "HEADING", text: "Professional Summary" });
    lines.push({ kind: "BODY", text: artifact.content.professionalSummary.text });
  }
  for (const section of artifact.content.sections) {
    lines.push({ kind: "HEADING", text: SECTION_HEADINGS[section.section] ?? section.section });
    if (section.layout === "INLINE_LIST") {
      lines.push({ kind: "BODY", text: section.entries.map((entry) => entry.renderedText).join(" | ") });
    } else {
      for (const entry of section.entries) appendMultilineBullet(lines, entry.renderedText);
    }
  }
  return lines;
}

export function renderResumeArtifactText(input: ResumeArtifact): string {
  return renderSemanticLinesText(buildResumeSemanticLines(input));
}

export function renderResumeArtifactProvenanceJson(input: ResumeArtifact): string {
  const artifact = ResumeArtifactSchema.parse(input);
  return `${JSON.stringify({
    schemaVersion: "b9-resume-artifact-provenance-v2",
    artifactId: artifact.id,
    artifactSemanticSha256: artifact.artifactSemanticSha256,
    mode: artifact.mode,
    manifest: artifact.manifest,
  }, null, 2)}\n`;
}

export function renderResumeArtifactDocx(input: ResumeArtifact): Uint8Array {
  const artifact = ResumeArtifactSchema.parse(input);
  return renderSemanticLinesDocx(buildResumeSemanticLines(artifact));
}

export function renderResumeArtifactPdf(input: ResumeArtifact): Uint8Array {
  const artifact = ResumeArtifactSchema.parse(input);
  return renderSemanticLinesPdf(buildResumeSemanticLines(artifact));
}
