import { z } from "zod";
import {
  ResumePlanSchema,
  ResumePlanSectionSchema,
  type ResumePlan,
  type ResumePlanItem,
} from "./ResumePlan";

export const B9_RESUME_COMPOSER_VERSION = "b9-deterministic-resume-composition-v2" as const;

export const ResumeCompositionLayoutSchema = z.enum([
  "BULLETS",
  "INLINE_LIST",
]);

export const ResumeCompositionEntrySchema = z.object({
  sourcePlanItemId: z.string().uuid(),
  evidenceId: z.string().uuid(),
  evidenceRevision: z.number().int().positive(),
  renderedText: z.string().trim().min(1).max(10_000),
}).strict();

export const ResumeProfessionalSummarySchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  sourcePlanItemIds: z.array(z.string().uuid()).min(1).max(20),
  evidenceSources: z.array(z.object({
    evidenceId: z.string().uuid(),
    evidenceRevision: z.number().int().positive(),
  }).strict()).min(1).max(20),
}).strict();

export const ResumeCompositionSectionSchema = z.object({
  section: ResumePlanSectionSchema.exclude(["PROFILE"]),
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
  professionalSummary: ResumeProfessionalSummarySchema.nullable(),
  sections: z.array(ResumeCompositionSectionSchema).min(0).max(6),
}).strict().superRefine((composition, context) => {
  const seen = new Set<string>();
  for (const sourcePlanItemId of composition.professionalSummary?.sourcePlanItemIds ?? []) {
    if (seen.has(sourcePlanItemId)) {
      context.addIssue({ code: "custom", message: "Each ResumePlan item may appear only once in a composition.", path: ["professionalSummary"] });
    }
    seen.add(sourcePlanItemId);
  }
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

function layoutForSection(section: Exclude<ResumePlanItem["section"], "PROFILE">): z.infer<typeof ResumeCompositionLayoutSchema> {
  if (section === "SKILLS" || section === "LANGUAGES" || section === "CERTIFICATIONS") {
    return "INLINE_LIST";
  }
  return "BULLETS";
}

/**
 * B9.4 composition is intentionally a pure projection. It may organize and
 * concatenate already-selected ResumePlan text, but it may not generate,
 * paraphrase, enrich, or infer claims.
 */
export function composeResumePlan(input: ResumePlan): ResumeComposition {
  const plan = ResumePlanSchema.parse(input);
  const profileItems = plan.items
    .filter((item) => item.section === "PROFILE")
    .sort((a, b) => a.ordinal - b.ordinal);

  const professionalSummary = profileItems.length === 0 ? null : {
    text: profileItems.map((item) => item.renderedText).join(" "),
    sourcePlanItemIds: profileItems.map((item) => item.id),
    evidenceSources: profileItems.map((item) => ({
      evidenceId: item.evidenceId,
      evidenceRevision: item.evidenceRevision,
    })),
  };

  const itemsBySection = new Map<Exclude<ResumePlanItem["section"], "PROFILE">, ResumePlanItem[]>();
  for (const item of plan.items) {
    if (item.section === "PROFILE") continue;
    const section = item.section;
    const bucket = itemsBySection.get(section) ?? [];
    bucket.push(item);
    itemsBySection.set(section, bucket);
  }

  const sections = plan.sectionOrder.flatMap((section) => {
    if (section === "PROFILE") return [];
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
    professionalSummary,
    sections,
  });

  const composedItemIds = [
    ...(composition.professionalSummary?.sourcePlanItemIds ?? []),
    ...composition.sections.flatMap((section) => section.entries.map((entry) => entry.sourcePlanItemId)),
  ];
  const expectedItemIds = plan.items.map((item) => item.id);

  if (composedItemIds.length !== expectedItemIds.length ||
      new Set(composedItemIds).size !== expectedItemIds.length ||
      expectedItemIds.some((id) => !composedItemIds.includes(id))) {
    throw new Error("B9_RESUME_COMPOSITION_PROVENANCE_INCOMPLETE");
  }

  return composition;
}
