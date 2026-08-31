import { z } from "zod";

export const RequirementImportanceSchema = z.enum(["REQUIRED", "PREFERRED", "CONTEXT"]);
export const JobRequirementCategorySchema = z.enum([
  "HARD_SKILL",
  "SOFT_SKILL",
  "RESPONSIBILITY",
  "EXPERIENCE",
  "EDUCATION",
  "CERTIFICATION",
  "DOMAIN",
  "LANGUAGE",
  "LOCATION",
  "TOOL",
  "SENIORITY",
]);

export const JobRequirementDraftSchema = z.object({
  semanticKey: z.string().regex(/^[0-9a-f]{64}$/),
  category: JobRequirementCategorySchema,
  importance: RequirementImportanceSchema,
  canonicalConcept: z.string().trim().min(1).max(500),
  sourceText: z.string().trim().min(1).max(5_000),
  sourceTextSha256: z.string().regex(/^[0-9a-f]{64}$/),
  sourceOrdinal: z.number().int().min(0).max(249),
});

export const JobRequirementSchema = JobRequirementDraftSchema.extend({
  id: z.string().uuid(),
});

export const CreateManualJobSnapshotInputSchema = z.object({
  roleTitle: z.string().trim().min(1).max(300),
  company: z.string().trim().min(1).max(300).optional(),
  rawDescription: z.string().trim().min(1).max(100_000),
}).strict();

export const JobSnapshotSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  semanticKey: z.string().regex(/^[0-9a-f]{64}$/),
  source: z.literal("MANUAL_JOB_DESCRIPTION"),
  roleTitle: z.string().trim().min(1).max(300),
  company: z.string().trim().min(1).max(300).optional(),
  rawDescription: z.string().trim().min(1).max(100_000),
  rawDescriptionSha256: z.string().regex(/^[0-9a-f]{64}$/),
  analyzerVersion: z.literal("b2-deterministic-job-intelligence-v1"),
  requirements: z.array(JobRequirementSchema).max(250),
  capturedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export type RequirementImportance = z.infer<typeof RequirementImportanceSchema>;
export type JobRequirementCategory = z.infer<typeof JobRequirementCategorySchema>;
export type JobRequirementDraft = z.infer<typeof JobRequirementDraftSchema>;
export type JobRequirement = z.infer<typeof JobRequirementSchema>;
export type CreateManualJobSnapshotInput = z.infer<typeof CreateManualJobSnapshotInputSchema>;
export type JobSnapshot = z.infer<typeof JobSnapshotSchema>;
