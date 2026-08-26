import { z } from "zod";

export const RequirementImportanceSchema = z.enum(["REQUIRED", "PREFERRED", "CONTEXT"]);

export const JobRequirementSchema = z.object({
  id: z.string().uuid(),
  category: z.enum([
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
  ]),
  importance: RequirementImportanceSchema,
  canonicalConcept: z.string().trim().min(1).max(500),
  sourceText: z.string().trim().min(1).max(5_000),
});

export const JobSnapshotSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  roleTitle: z.string().trim().min(1).max(300),
  company: z.string().trim().max(300).optional(),
  rawDescription: z.string().trim().min(1).max(100_000),
  requirements: z.array(JobRequirementSchema).max(250),
  capturedAt: z.iso.datetime(),
});

export type JobRequirement = z.infer<typeof JobRequirementSchema>;
export type JobSnapshot = z.infer<typeof JobSnapshotSchema>;
