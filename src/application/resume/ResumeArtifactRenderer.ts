import { ResumeArtifactSchema, type ResumeArtifact } from "../../domain/resume/ResumeArtifact";

const SECTION_HEADINGS: Record<string, string> = {
  EXPERIENCE: "Experience",
  PROJECTS: "Projects",
  EDUCATION: "Education",
  CERTIFICATIONS: "Certifications",
  SKILLS: "Skills",
  LANGUAGES: "Languages",
};

export function renderResumeArtifactText(input: ResumeArtifact): string {
  const artifact = ResumeArtifactSchema.parse(input);
  const blocks: string[] = [];

  if (artifact.content.professionalSummary) {
    blocks.push(`Professional Summary\n${artifact.content.professionalSummary.text}`);
  }

  for (const section of artifact.content.sections) {
    const heading = SECTION_HEADINGS[section.section] ?? section.section;
    if (section.layout === "INLINE_LIST") {
      blocks.push(`${heading}\n${section.entries.map((entry) => entry.renderedText).join(" | ")}`);
    } else {
      blocks.push(`${heading}\n${section.entries.map((entry) => `- ${entry.renderedText}`).join("\n")}`);
    }
  }

  return `${blocks.join("\n\n")}\n`;
}

export function renderResumeArtifactProvenanceJson(input: ResumeArtifact): string {
  const artifact = ResumeArtifactSchema.parse(input);
  return `${JSON.stringify({
    schemaVersion: "b9-resume-artifact-provenance-v1",
    artifactId: artifact.id,
    artifactSemanticSha256: artifact.artifactSemanticSha256,
    mode: artifact.mode,
    manifest: artifact.manifest,
  }, null, 2)}\n`;
}
