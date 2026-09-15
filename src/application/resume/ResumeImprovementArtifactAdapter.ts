import { createHash } from "node:crypto";
import { z } from "zod";
import { FactGuardianReportSchema } from "../../domain/resume/FactGuardian";
import { GeneratedResumeDocumentSchema, type GeneratedResumeDocument, type GeneratedResumeEntry, type GeneratedResumeListGroup } from "../../domain/resume/GeneratedResumeDocument";
import {
  RESUME_IMPROVEMENT_ARTIFACT_VERSION,
  V12_IMPROVEMENT_RENDERER_CONTRACT_VERSION,
  ResumeImprovementArtifactManifestSchema,
  ResumeImprovementArtifactSchema,
  ResumeImprovementEditorProvenanceSchema,
  type ResumeImprovementArtifact,
} from "../../domain/resume/ResumeImprovementArtifact";
import { ResumeImprovementRunSchema, type ResumeImprovementRun } from "../../domain/resume/ResumeImprovementRun";
import {
  diagnoseV12ResumeLayout,
  renderV12ResumeDocx,
  renderV12ResumePdf,
  renderV12ResumeText,
  type V12ResumeLayoutDiagnostics,
  type V12ResumeSemanticLine,
} from "./V12ProfessionalResumeRenderer";

const JsonRecordSchema = z.record(z.string(), z.unknown());

export type ResumeImprovementLayoutDiagnostics = V12ResumeLayoutDiagnostics;

export type ResumeImprovementArtifactBundle = Readonly<{
  artifact: ResumeImprovementArtifact;
  text: string;
  docx: Uint8Array;
  pdf: Uint8Array;
  provenanceJson: string;
  layout: ResumeImprovementLayoutDiagnostics;
}>;

type SectionLabels = Readonly<{
  summary: string;
  experience: string;
  projects: string;
  education: string;
  certifications: string;
  skills: string;
  languages: string;
  additional: string;
}>;

const EN_LABELS: SectionLabels = Object.freeze({
  summary: "Professional Summary",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
  skills: "Skills",
  languages: "Languages",
  additional: "Additional Information",
});
const ES_LABELS: SectionLabels = Object.freeze({
  summary: "Perfil profesional",
  experience: "Experiencia profesional",
  projects: "Proyectos",
  education: "Educación",
  certifications: "Certificaciones",
  skills: "Competencias técnicas",
  languages: "Idiomas",
  additional: "Información adicional",
});

function sectionLabels(locale: string): SectionLabels {
  return locale.trim().toLowerCase().replace("_", "-").startsWith("es") ? ES_LABELS : EN_LABELS;
}

function sha256Text(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function sha256Bytes(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
function pushUnit(lines: V12ResumeSemanticLine[], kind: V12ResumeSemanticLine["kind"], value: { text: string } | null) {
  if (value) lines.push({ kind, text: value.text });
}
function entryLines(lines: V12ResumeSemanticLine[], entry: GeneratedResumeEntry) {
  const identity = [entry.title?.text, entry.subtitle?.text].filter((value): value is string => Boolean(value));
  const meta = entry.metaLines.map((item) => item.text).filter(Boolean);
  if (identity.length > 0) lines.push({ kind: "ENTRY", text: identity.join(" | ") });
  if (meta.length > 0) lines.push({ kind: "ENTRY_META", text: meta.join(" | ") });
  pushUnit(lines, "BODY", entry.summary);
  for (const bullet of entry.bullets) lines.push({ kind: "BULLET", text: bullet.text });
}
function listGroupLines(lines: V12ResumeSemanticLine[], group: GeneratedResumeListGroup) {
  const content = group.items.map((item) => item.text).join(" | ");
  lines.push({ kind: "LABELED_BODY", text: group.label ? `${group.label}: ${content}` : content });
}
function packContactLines(values: readonly string[], maxLength = 88): string[] {
  const result: string[] = [];
  let current = "";
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const candidate = current ? `${current} | ${value}` : value;
    if (current && candidate.length > maxLength) {
      result.push(current);
      current = value;
    } else {
      current = candidate;
    }
  }
  if (current) result.push(current);
  return result;
}

export function buildImprovementSemanticLines(input: GeneratedResumeDocument): V12ResumeSemanticLine[] {
  const document = GeneratedResumeDocumentSchema.parse(input);
  const labels = sectionLabels(document.locale);
  const lines: V12ResumeSemanticLine[] = [];
  if (document.header) {
    pushUnit(lines, "NAME", document.header.displayName);
    pushUnit(lines, "HEADLINE", document.header.headline);
    const contacts = document.header.contactLines.map((contact) => contact.text).filter(Boolean);
    for (const contactLine of packContactLines(contacts)) lines.push({ kind: "CONTACT", text: contactLine });
  }
  if (document.summary) {
    lines.push({ kind: "HEADING", text: labels.summary });
    lines.push({ kind: "BODY", text: document.summary.text });
  }
  const addEntries = (heading: string, entries: readonly GeneratedResumeEntry[]) => {
    if (entries.length === 0) return;
    lines.push({ kind: "HEADING", text: heading });
    entries.forEach((entry) => entryLines(lines, entry));
  };
  addEntries(labels.experience, document.experience);
  addEntries(labels.projects, document.projects);
  addEntries(labels.education, document.education);
  addEntries(labels.certifications, document.certifications);
  if (document.skillGroups.length > 0) {
    lines.push({ kind: "HEADING", text: labels.skills });
    document.skillGroups.forEach((group) => listGroupLines(lines, group));
  }
  if (document.languageGroups.length > 0) {
    lines.push({ kind: "HEADING", text: labels.languages });
    document.languageGroups.forEach((group) => listGroupLines(lines, group));
  }
  for (const [index, group] of document.otherGroups.entries()) {
    lines.push({ kind: "HEADING", text: group.label ?? `${labels.additional} ${index + 1}` });
    for (const item of group.items) lines.push({ kind: "BODY", text: item.text });
  }
  return lines;
}

export function diagnoseImprovementLayout(lines: readonly V12ResumeSemanticLine[]): ResumeImprovementLayoutDiagnostics {
  return diagnoseV12ResumeLayout(lines);
}

function editorProvenance(run: ResumeImprovementRun) {
  if (run.editorProvenanceJson === null) return null;
  return ResumeImprovementEditorProvenanceSchema.parse({
    provider: run.editorProvenanceJson.provider,
    model: run.editorProvenanceJson.model,
    requestId: run.editorProvenanceJson.requestId,
    contractVersion: run.editorProvenanceJson.contractVersion,
    attempt: run.editorProvenanceJson.attempt,
    fallbackUsed: run.editorProvenanceJson.fallbackUsed,
    credentialMode: run.editorProvenanceJson.credentialMode,
  });
}

function replayHash(input: {
  sourceDocumentSha256: string;
  semanticDocumentSha256: string;
  generatedDocumentSha256: string;
  editorProvenance: z.infer<typeof ResumeImprovementEditorProvenanceSchema> | null;
  guardianReportSha256: string;
  rendererContractVersion: string;
}) {
  return sha256Text(JSON.stringify({
    sourceDocumentSha256: input.sourceDocumentSha256,
    semanticDocumentSha256: input.semanticDocumentSha256,
    generatedDocumentSha256: input.generatedDocumentSha256,
    editorProvenance: input.editorProvenance,
    guardianReportSha256: input.guardianReportSha256,
    rendererContractVersion: input.rendererContractVersion,
  }));
}

export function renderResumeImprovementRunArtifact(input: ResumeImprovementRun): ResumeImprovementArtifactBundle {
  const run = ResumeImprovementRunSchema.parse(input);
  if (run.status === "FAILED_SOURCE_UNREADABLE") throw new Error("V12_ARTIFACT_SOURCE_UNREADABLE");
  if (!run.semanticDocumentSha256 || !run.generatedDocumentJson || !run.generatedDocumentSha256 || !run.guardianReportJson || !run.guardianReportSha256) {
    throw new Error("V12_ARTIFACT_RUN_INCOMPLETE");
  }
  const generated = GeneratedResumeDocumentSchema.parse(run.generatedDocumentJson);
  if (generated.ownerUserId !== run.ownerUserId || generated.sourceReceiptId !== run.sourceReceiptId || generated.sourceDocumentSha256 !== run.sourceSha256) {
    throw new Error("V12_ARTIFACT_SOURCE_BINDING_MISMATCH");
  }
  const guardian = FactGuardianReportSchema.parse(run.guardianReportJson);
  if (guardian.decision === "REJECTED") throw new Error("V12_ARTIFACT_GUARDIAN_REJECTED");
  const provenance = editorProvenance(run);
  const lines = buildImprovementSemanticLines(generated);
  const layout = diagnoseImprovementLayout(lines);
  const text = renderV12ResumeText(lines);
  const renderedSemanticTextSha256 = sha256Text(text);
  const replayIdentitySha256 = replayHash({
    sourceDocumentSha256: run.sourceSha256,
    semanticDocumentSha256: run.semanticDocumentSha256,
    generatedDocumentSha256: run.generatedDocumentSha256,
    editorProvenance: provenance,
    guardianReportSha256: run.guardianReportSha256,
    rendererContractVersion: V12_IMPROVEMENT_RENDERER_CONTRACT_VERSION,
  });
  const manifest = ResumeImprovementArtifactManifestSchema.parse({
    schemaVersion: RESUME_IMPROVEMENT_ARTIFACT_VERSION,
    runId: run.id,
    runStatus: run.status,
    sourceReceiptId: run.sourceReceiptId,
    sourceDocumentSha256: run.sourceSha256,
    semanticDocumentSha256: run.semanticDocumentSha256,
    generatedDocumentSha256: run.generatedDocumentSha256,
    editorProvenance: provenance,
    guardianReportSha256: run.guardianReportSha256,
    rendererContractVersion: V12_IMPROVEMENT_RENDERER_CONTRACT_VERSION,
    renderedSemanticTextSha256,
    replayIdentitySha256,
  });
  const artifact = ResumeImprovementArtifactSchema.parse({
    artifactId: run.id,
    ownerUserId: run.ownerUserId,
    manifest,
    artifactSemanticSha256: sha256Text(JSON.stringify({ manifest, text })),
  });
  const docx = renderV12ResumeDocx(lines);
  const pdf = renderV12ResumePdf(lines);
  const provenanceJson = `${JSON.stringify({
    schemaVersion: RESUME_IMPROVEMENT_ARTIFACT_VERSION,
    artifact,
    layout,
    fileHashes: {
      textSha256: sha256Bytes(new TextEncoder().encode(text)),
      docxSha256: sha256Bytes(docx),
      pdfSha256: sha256Bytes(pdf),
    },
  }, null, 2)}\n`;
  JsonRecordSchema.parse(JSON.parse(provenanceJson));
  return { artifact, text, docx, pdf, provenanceJson, layout };
}
