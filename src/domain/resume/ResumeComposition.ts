import { z } from "zod";
import {
  ResumePlanSchema,
  ResumePlanSectionSchema,
  type ResumePlan,
  type ResumePlanItem,
} from "./ResumePlan";

export const B9_RESUME_COMPOSER_VERSION = "b9-deterministic-resume-composition-v1" as const;

export const ResumeCompositionLayoutSchema = z.enum([
  "NARRATIVE",
  "BULLETS",
  "INLINE_LIST",
]);

export const ResumeCompositionEntrySchema = z.object({
  sourcePlanItemId: z.string().uuid(),
  evidenceId: z.string().uuid(),
  evidenceRevision: z.number().int().positive(),
  renderedText: z.string().trim().min(1).max(10_000),
}).strict();

export const ResumeCompositionSectionSchema = z.object({
  section: ResumePlanSectionSchema,
  layout: ResumeCompositionLayoutSchema,
  entries: z.array(ResumeCompositionEntrySchema).min(1).max(20),
}).strict();

export const ResumeCompositionSchema = z.object({
  composerVersion: z.literal(B9_RESUME_COMPOSER_VERSION),
  resumePlanId: z.string().uuid(),
  resumePlanSemanticKey: z.string().regex(/^[0-9a-f]{64}$/),
  mode: z.enum(["GENERAL", "TARGETED"]),
  jobSnapshotId: z.string().uuid().nullable(),
  opportunityAssessmentId: z.string().uuid().nullable(),
  sections: z.array(ResumeCompositionSectionSchema).min(1).max(7),
}).strict().superRefine((composition, context) => {
  const seen = new Set<string>();
  for (const section of composition.sections) {
    for (const entry of section.entries) {
      if (seen.has(entry.sourcePlanItemId)) {
        context.addIssue({
          code: "custom",
          message: "Each ResumePlan item may appear only once in a composition.",
          path: ["sections"],
        });
      }
      seen.add(entry.sourcePlanItemId);
    }
  }
});

export type ResumeComposition = z.infer<typeof ResumeCompositionSchema>;

function layoutForSection(section: ResumePlanItem["section"]): z.infer<typeof ResumeCompositionLayoutSchema> {
  if (section === "PROFILE") return "NARRATIVE";
  if (section === "SKILLS" || section === "LANGUAGES" || section === "CERTIFICATIONS") {
    return "INLINE_LIST";
  }
  return "BULLETS";
}

/**
 * B9.4b is intentionally a pure projection. It may organize already-selected
 * ResumePlan text, but it may not generate, paraphrase, merge, or enrich claims.
 */
export function composeResumePlan(input: ResumePlan): ResumeComposition {
  const plan = ResumePlanSchema.parse(input);
  const itemsBySection = new Map<ResumePlanItem["section"], ResumePlanItem[]>();

  for (const item of plan.items) {
    const bucket = itemsBySection.get(item.section) ?? [];
    bucket.push(item);
    itemsBySection.set(item.section, bucket);
  }

  const sections = plan.sectionOrder.flatMap((section) => {
    const items = itemsBySection.get(section) ?? [];
    if (items.length === 0) return [];

    const ordered = [...items].sort((a, b) => a.ordinal - b.ordinal);
    return [{
      section,
      layout: layoutForSection(section),
      entries: ordered.map((item) => ({
        sourcePlanItemId: item.id,
        evidenceId: item.evidenceId,
        evidenceRevision: item.evidenceRevision,
        renderedText: item.renderedText,
      })),
    }];
  });

  const composition = ResumeCompositionSchema.parse({
    composerVersion: B9_RESUME_COMPOSER_VERSION,
    resumePlanId: plan.id,
    resumePlanSemanticKey: plan.semanticKey,
    mode: plan.mode,
    jobSnapshotId: plan.jobSnapshotId,
    opportunityAssessmentId: plan.opportunityAssessmentId,
    sections,
  });

  const composedItemIds = composition.sections.flatMap((section) =>
    section.entries.map((entry) => entry.sourcePlanItemId),
  );
  const expectedItemIds = [...plan.items]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((item) => item.id);

  if (composedItemIds.length !== expectedItemIds.length ||
      new Set(composedItemIds).size !== expectedItemIds.length ||
      expectedItemIds.some((id) => !composedItemIds.includes(id))) {
    throw new Error("B9_RESUME_COMPOSITION_PROVENANCE_INCOMPLETE");
  }

  return composition;
}
