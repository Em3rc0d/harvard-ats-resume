import { z } from "zod";

export const ResumeClaimSchema = z.object({
  claimId: z.string().uuid(),
  evidenceIds: z.array(z.string().uuid()).min(1),
  renderedText: z.string().trim().min(1).max(5_000),
});

export const ResumeVersionSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  careerSnapshotId: z.string().uuid(),
  jobSnapshotId: z.string().uuid().optional(),
  claims: z.array(ResumeClaimSchema),
  composer: z.object({
    provider: z.literal("cv-engine-deterministic"),
    contractVersion: z.string().trim().min(1).max(200),
  }),
  createdAt: z.iso.datetime(),
});

export type ResumeClaim = z.infer<typeof ResumeClaimSchema>;
export type ResumeVersion = z.infer<typeof ResumeVersionSchema>;
