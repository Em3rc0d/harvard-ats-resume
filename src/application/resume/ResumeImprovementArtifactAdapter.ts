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

export type ResumeImprovementArtifactBundle = Readonly<{
  artifact: ResumeImprovementArtifact;
  text: string;
  docx: Uint8Array;
  pdf: Uint8Array;
  provenanceJson: string;
}>;

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
  if (identity.length > 0) lines.push({ kind: "BODY", text: identity.join(" | ") });
  for (const meta of entry.metaLines) lines.push({ kind: "META", text: meta.text });
  pushUnit(lines, "BODY", entry.summary);
  for (const bullet of entry.bullets) lines.push({ kind: "BULLET", text: bullet.text });
}
function listGroupLines(lines: ResumeSemanticLine[], group: GeneratedResumeListGroup) {
  const content = group.items.map((item) => item.text).join(" | ");
  lines.push({ kind: "BODY", text: group.label ? `${group.label}: ${content}` : content });
}

export function buildImprovementSemanticLines(input: GeneratedResumeDocument): ResumeSemanticLine[] {
  const document = GeneratedResumeDocumentSchema.parse(input);
  const lines: ResumeSemanticLine[] = [];
  if (document.header) {
    pushUnit(lines, "NAME", document.header.displayName);
    pushUnit(lines, "META", document.header.headline);
    for (const contact of document.header.contactLines) lines.push({ kind: "META", text: contact.text });
  }
  if (document.summary) {
    lines.push({ kind: "HEADING", text: "Professional Summary" });
    lines.push({ kind: "BODY", text: document.summary.text });
  }
  const addEntries = (heading: string, entries: readonly GeneratedResumeEntry[]) => {
    if (entries.length === 0) return;
    lines.push({ kind: "HEADING", text: heading });
    entries.forEach((entry) => entryLines(lines, entry));
  };
  addEntries("Experience", document.experience);
  addEntries("Projects", document.projects);
  addEntries("Education", document.education);
  addEntries("Certifications", document.certifications);
  if (document.skillGroups.length > 0) {
    lines.push({ kind: "HEADING", text: "Skills" });
    document.skillGroups.forEach((group) => listGroupLines(lines, group));
  }
  if (document.languageGroups.length > 0) {
    lines.push({ kind: "HEADING", text: "Languages" });
    document.languageGroups.forEach((group) => listGroupLines(lines, group));
  }
  for (const [index, group] of document.otherGroups.entries()) {
    lines.push({ kind: "HEADING", text: group.label ?? `Additional Information ${index + 1}` });
    for (const item of group.items) lines.push({ kind: "BODY", text: item.text });
  }
  return lines;
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
    fileHashes: {
      textSha256: sha256Bytes(new TextEncoder().encode(text)),
      docxSha256: sha256Bytes(docx),
      pdfSha256: sha256Bytes(pdf),
    },
  }, null, 2)}\n`;
  JsonRecordSchema.parse(JSON.parse(provenanceJson));
  return { artifact, text, docx, pdf, provenanceJson };
}
