import { z } from "zod";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const NullableText = (max: number) => z.string().trim().max(max).nullable();

export const ResumeProfileSchema = z.object({
  ownerUserId: z.string().uuid(),
  revision: z.number().int().positive(),
  displayName: z.string().trim().min(1).max(120),
  headline: NullableText(200),
  location: NullableText(160),
  email: z.string().trim().email().max(254).nullable(),
  phone: NullableText(80),
  links: z.array(z.string().trim().url().max(500)).max(6),
  semanticSha256: Sha256Schema,
  createdAt: z.string().datetime({ offset: true }),
}).strict();

export const UpsertResumeProfileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  headline: NullableText(200).optional().default(null),
  location: NullableText(160).optional().default(null),
  email: z.string().trim().email().max(254).nullable().optional().default(null),
  phone: NullableText(80).optional().default(null),
  links: z.array(z.string().trim().url().max(500)).max(6).optional().default([]),
}).strict();

export type ResumeProfile = z.infer<typeof ResumeProfileSchema>;
export type UpsertResumeProfileInput = z.infer<typeof UpsertResumeProfileInputSchema>;
