import { z } from "zod";

export const CareerTargetSenioritySchema = z.enum([
  "INTERN",
  "JUNIOR",
  "MID",
  "SENIOR",
  "LEAD",
  "STAFF",
  "PRINCIPAL",
  "MANAGER",
  "DIRECTOR",
  "EXECUTIVE",
]);

export const CareerTargetWorkModelSchema = z.enum(["ONSITE", "HYBRID", "REMOTE"]);
export const CareerTargetEmploymentTypeSchema = z.enum([
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERNSHIP",
  "TEMPORARY",
]);
export const CareerTargetRelocationSchema = z.enum(["UNSPECIFIED", "NO", "OPEN", "YES"]);
export const CareerTargetPrioritySchema = z.enum(["PRIMARY", "SECONDARY", "EXPLORATORY"]);

const TextListSchema = z.array(z.string().trim().min(1).max(200)).max(25);

export const CreateCareerTargetInputSchema = z.object({
  targetRole: z.string().trim().min(1).max(300),
  jobFamily: z.string().trim().min(1).max(200).optional(),
  preferredSeniorities: z.array(CareerTargetSenioritySchema).max(10).default([]),
  preferredLocations: TextListSchema.default([]),
  workModels: z.array(CareerTargetWorkModelSchema).max(3).default([]),
  employmentTypes: z.array(CareerTargetEmploymentTypeSchema).max(5).default([]),
  industries: TextListSchema.default([]),
  relocationPreference: CareerTargetRelocationSchema.default("UNSPECIFIED"),
  priority: CareerTargetPrioritySchema.default("PRIMARY"),
  activate: z.boolean().default(true),
}).strict();

export const CareerTargetSchema = CreateCareerTargetInputSchema.omit({ activate: true }).extend({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  semanticKey: z.string().regex(/^[0-9a-f]{64}$/),
  isActive: z.boolean(),
  activatedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type CreateCareerTargetInput = z.infer<typeof CreateCareerTargetInputSchema>;
export type CareerTarget = z.infer<typeof CareerTargetSchema>;
