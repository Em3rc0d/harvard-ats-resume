import { z } from "zod";
import { B9_RENDERER_CONTRACT_VERSION } from "./ResumeArtifact";

export const RESUME_IMPROVEMENT_ARTIFACT_VERSION = "v12-resume-improvement-artifact-v1" as const;
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const UUIDSchema = z.string().uuid();

export const ResumeImprovementEditorProvenanceSchema = z.object({
  provider: z.enum(["gemini", "ollama"]),
  model: z.string().trim().min(1).max(200),
  requestId: z.string().trim().min(1).max(200),
  contractVersion: z.string().trim().min(1).max(128),
  attempt: z.number().int().positive(),
  fallbackUsed: z.boolean(),
  credentialMode: z.enum(["PLATFORM", "BYOK", "LOCAL_ONLY"]),
}).strict();

export const ResumeImprovementArtifactManifestSchema = z.object({
  schemaVersion: z.literal(RESUME_IMPROVEMENT_ARTIFACT_VERSION),
  runId: UUIDSchema,
  runStatus: z.enum(["IMPROVED", "PARTIALLY_IMPROVED", "ORIGINAL_PRESERVED_AI_UNAVAILABLE"]),
  sourceReceiptId: UUIDSchema,
  sourceDocumentSha256: Sha256Schema,
  semanticDocumentSha256: Sha256Schema,
  generatedDocumentSha256: Sha256Schema,
  editorProvenance: ResumeImprovementEditorProvenanceSchema.nullable(),
  guardianReportSha256: Sha256Schema,
  rendererContractVersion: z.literal(B9_RENDERER_CONTRACT_VERSION),
  renderedSemanticTextSha256: Sha256Schema,
  replayIdentitySha256: Sha256Schema,
}).strict().superRefine((manifest, context) => {
  if (["IMPROVED", "PARTIALLY_IMPROVED"].includes(manifest.runStatus) && manifest.editorProvenance === null) {
    context.addIssue({
      code: "custom",
      path: ["editorProvenance"],
      message: "Improved artifacts require the exact editor provider/model/request receipt.",
    });
  }
});

export const ResumeImprovementArtifactSchema = z.object({
  artifactId: UUIDSchema,
  ownerUserId: UUIDSchema,
  manifest: ResumeImprovementArtifactManifestSchema,
  artifactSemanticSha256: Sha256Schema,
}).strict();

export type ResumeImprovementEditorProvenance = z.infer<typeof ResumeImprovementEditorProvenanceSchema>;
export type ResumeImprovementArtifactManifest = z.infer<typeof ResumeImprovementArtifactManifestSchema>;
export type ResumeImprovementArtifact = z.infer<typeof ResumeImprovementArtifactSchema>;
