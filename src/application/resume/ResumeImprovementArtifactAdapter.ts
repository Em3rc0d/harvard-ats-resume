import { createHash } from "node:crypto";
import { z } from "zod";
import { FactGuardianReportSchema } from "../../domain/resume/FactGuardian";
import { GeneratedResumeDocumentSchema, type GeneratedResumeDocument, type GeneratedResumeEntry, type GeneratedResumeListGroup } from "../../domain/resume/GeneratedResumeDocument";
import { B9_RENDERER_CONTRACT_VERSION } from "../../domain/resume/ResumeArtifact";
import {
  RESUME_IMPROVEMENT_ARTIFACT_VERSION,
  ResumeImprovementArtifactManifestSchema,
  ResumeImprovementArtifactSchema,
  ResumeImprovementEditorProvenanceSchema,
  type ResumeImprovementArtifact,
} from "../../domain/resume/ResumeImprovementArtifact";
import { ResumeImprovementRunSchema, type ResumeImprovementRun } from "../../domain/resume/ResumeImprovementRun";
import {
  renderSemanticLinesDocx,
  renderSemanticLinesPdf,
  renderSemanticLinesText,
  type ResumeSemanticLine,
} from "./ATSResumeRenderer";

const JsonRecordSchema = z.record(z.string(), z.unknown());
const PDF_LINES_PER_PAGE = 48;
const SPARSE_TRAILING_PAGE_RATIO = 0.32;

export type ResumeImprovementLayoutDiagnostics = Readonly<{
  visualLineCount: number;
  pageCount: number;
  trailingPageFillRatio: number;
  sparseTrailingPage: boolean;
}>;

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
function pushUnit(lines: ResumeSemanticLine[], kind: ResumeSemanticLine["kind"], value: { text: string } | null) {
  if (value) lines.push({ kind, text: value.text });
}
function entryLines(lines: ResumeSemanticLine[], entry: GeneratedResumeEntry) {
  const identity = [entry.title?.text, entry.subtitle?.text].filter((value): value is string => Boolean(value));
  const meta = entry.metaLines.map((item) => item.text).filter(Boolean);
  const identityAndMeta = [...identity, ...meta];
  if (identityAndMeta.length > 0) lines.push({ kind: "BODY", text: identityAndMeta.join(" | ") });
  pushUnit(lines, "BODY", entry.summary);
  for (const bullet of entry.bullets) lines.push({ kind: "BULLET", text: bullet.text });
}
function listGroupLines(lines: ResumeSemanticLine[], group: GeneratedResumeListGroup) {
  const content = group.items.map((item) => item.text).join(" | ");
  lines.push({ kind: "BODY", text: group.label ? `${group.label}: ${content}` : content });
}

export function buildImprovementSemanticLines(input: GeneratedResumeDocument): ResumeSemanticLine[] {
  const document = GeneratedResumeDocumentSchema.parse(input);
  const labels = sectionLabels(document.locale);
  const lines: ResumeSemanticLine[] = [];
  if (document.header) {
    pushUnit(lines, "NAME", document.header.displayName);
    pushUnit(lines, "META", document.header.headline);
    const contacts = document.header.contactLines.map((contact) => contact.text).filter(Boolean);
    if (contacts.length > 0) lines.push({ kind: "META", text: contacts.join(" | ") });
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

function wrappedLineCount(text: string, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  let count = 0;
  let current = "";
  for (const word of words) {
    if (word.length > width) {
      if (current) { count += 1; current = ""; }
      count += Math.floor((word.length - 1) / width);
      current = word.slice(Math.floor((word.length - 1) / width) * width);
    } else if (!current) current = word;
    else if (`${current} ${word}`.length <= width) current += ` ${word}`;
    else { count += 1; current = word; }
  }
  if (current || words.length === 0) count += 1;
  return count;
}

export function diagnoseImprovementLayout(lines: readonly ResumeSemanticLine[]): ResumeImprovementLayoutDiagnostics {
  let visualLineCount = 0;
  for (const line of lines) {
    const prefix = line.kind === "BULLET" ? "- " : "";
    const width = line.kind === "NAME" ? 64 : line.kind === "HEADING" ? 70 : 92;
    visualLineCount += wrappedLineCount(`${prefix}${line.text}`, width);
  }
  const pageCount = Math.max(1, Math.ceil(visualLineCount / PDF_LINES_PER_PAGE));
  const trailingLines = visualLineCount === 0
    ? 0
    : visualLineCount % PDF_LINES_PER_PAGE || PDF_LINES_PER_PAGE;
  const trailingPageFillRatio = pageCount === 1 ? 1 : trailingLines / PDF_LINES_PER_PAGE;
  return {
    visualLineCount,
    pageCount,
    trailingPageFillRatio,
    sparseTrailingPage: pageCount > 1 && trailingPageFillRatio < SPARSE_TRAILING_PAGE_RATIO,
  };
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
  const text = renderSemanticLinesText(lines);
  const renderedSemanticTextSha256 = sha256Text(text);
  const replayIdentitySha256 = replayHash({
    sourceDocumentSha256: run.sourceSha256,
    semanticDocumentSha256: run.semanticDocumentSha256,
    generatedDocumentSha256: run.generatedDocumentSha256,
    editorProvenance: provenance,
    guardianReportSha256: run.guardianReportSha256,
    rendererContractVersion: B9_RENDERER_CONTRACT_VERSION,
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
    rendererContractVersion: B9_RENDERER_CONTRACT_VERSION,
    renderedSemanticTextSha256,
    replayIdentitySha256,
  });
  const artifact = ResumeImprovementArtifactSchema.parse({
    artifactId: run.id,
    ownerUserId: run.ownerUserId,
    manifest,
    artifactSemanticSha256: sha256Text(JSON.stringify({ manifest, text })),
  });
  const docx = renderSemanticLinesDocx(lines);
  const pdf = renderSemanticLinesPdf(lines);
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
