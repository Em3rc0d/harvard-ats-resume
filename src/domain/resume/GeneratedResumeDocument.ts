import { z } from "zod";
import { ResumeSourceRefSchema } from "./CandidateResumeDocument";

export const GENERATED_RESUME_DOCUMENT_VERSION = "v12-generated-resume-document-v1" as const;

export const GeneratedResumeTextUnitSchema = z.object({
  text: z.string().trim().min(1).max(5_000),
  sourceRefs: z.array(ResumeSourceRefSchema).min(1).max(100),
}).strict();

export const GeneratedResumeHeaderSchema = z.object({
  displayName: GeneratedResumeTextUnitSchema.nullable(),
  headline: GeneratedResumeTextUnitSchema.nullable(),
  contactLines: z.array(GeneratedResumeTextUnitSchema).max(30),
  sourceRefs: z.array(ResumeSourceRefSchema).min(1).max(100),
}).strict();

export const GeneratedResumeEntrySchema = z.object({
  title: GeneratedResumeTextUnitSchema.nullable(),
  subtitle: GeneratedResumeTextUnitSchema.nullable(),
  metaLines: z.array(GeneratedResumeTextUnitSchema).max(30),
  summary: GeneratedResumeTextUnitSchema.nullable(),
  bullets: z.array(GeneratedResumeTextUnitSchema).max(60),
  sourceRefs: z.array(ResumeSourceRefSchema).min(1).max(100),
}).strict();

export const GeneratedResumeListGroupSchema = z.object({
  label: z.string().trim().min(1).max(200).nullable(),
  items: z.array(GeneratedResumeTextUnitSchema).min(1).max(120),
  sourceRefs: z.array(ResumeSourceRefSchema).min(1).max(100),
}).strict();

export const GeneratedResumeDocumentSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  sourceDocumentId: z.string().uuid(),
  sourceReceiptId: z.string().uuid(),
  sourceDocumentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  documentVersion: z.literal(GENERATED_RESUME_DOCUMENT_VERSION),
  editorStatus: z.enum(["AI_EDITED", "PARTIAL_RECOVERY"]),
  locale: z.string().trim().min(2).max(35),
  header: GeneratedResumeHeaderSchema.nullable(),
  summary: GeneratedResumeTextUnitSchema.nullable(),
  experience: z.array(GeneratedResumeEntrySchema).max(30),
  projects: z.array(GeneratedResumeEntrySchema).max(40),
  education: z.array(GeneratedResumeEntrySchema).max(20),
  certifications: z.array(GeneratedResumeEntrySchema).max(40),
  skillGroups: z.array(GeneratedResumeListGroupSchema).max(30),
  languageGroups: z.array(GeneratedResumeListGroupSchema).max(30),
  otherGroups: z.array(GeneratedResumeListGroupSchema).max(30),
  omittedSourceOrdinals: z.array(z.number().int().min(1).max(100)).max(100),
  sourceProvenanceIndex: z.array(ResumeSourceRefSchema).min(1).max(100),
  createdAt: z.iso.datetime(),
}).strict().superRefine((document, context) => {
  const knownByOrdinal = new Map(document.sourceProvenanceIndex.map((ref) => [ref.ordinal, ref] as const));
  if (knownByOrdinal.size !== document.sourceProvenanceIndex.length) {
    context.addIssue({ code: "custom", path: ["sourceProvenanceIndex"], message: "Source provenance ordinals must be unique." });
  }

  const refs: z.infer<typeof ResumeSourceRefSchema>[] = [];
  const collectUnit = (unit: z.infer<typeof GeneratedResumeTextUnitSchema> | null) => {
    if (unit) refs.push(...unit.sourceRefs);
  };
  const collectEntry = (entry: z.infer<typeof GeneratedResumeEntrySchema>) => {
    collectUnit(entry.title);
    collectUnit(entry.subtitle);
    entry.metaLines.forEach(collectUnit);
    collectUnit(entry.summary);
    entry.bullets.forEach(collectUnit);
    refs.push(...entry.sourceRefs);
  };
  if (document.header) {
    collectUnit(document.header.displayName);
    collectUnit(document.header.headline);
    document.header.contactLines.forEach(collectUnit);
    refs.push(...document.header.sourceRefs);
  }
  collectUnit(document.summary);
  document.experience.forEach(collectEntry);
  document.projects.forEach(collectEntry);
  document.education.forEach(collectEntry);
  document.certifications.forEach(collectEntry);
  for (const group of [...document.skillGroups, ...document.languageGroups, ...document.otherGroups]) {
    group.items.forEach(collectUnit);
    refs.push(...group.sourceRefs);
  }

  for (const ref of refs) {
    const known = knownByOrdinal.get(ref.ordinal);
    if (!known || known.proposalId !== ref.proposalId || known.sourceLine !== ref.sourceLine || known.sourceTextSha256 !== ref.sourceTextSha256) {
      context.addIssue({ code: "custom", path: ["sourceProvenanceIndex"], message: "Every generated unit must reference exact candidate-source provenance." });
      break;
    }
  }

  if (new Set(document.omittedSourceOrdinals).size !== document.omittedSourceOrdinals.length) {
    context.addIssue({ code: "custom", path: ["omittedSourceOrdinals"], message: "Omitted source ordinals must be unique." });
  }
  if (document.omittedSourceOrdinals.some((ordinal) => !knownByOrdinal.has(ordinal))) {
    context.addIssue({ code: "custom", path: ["omittedSourceOrdinals"], message: "Omitted source ordinals must exist in source provenance." });
  }
});

export type GeneratedResumeTextUnit = z.infer<typeof GeneratedResumeTextUnitSchema>;
export type GeneratedResumeHeader = z.infer<typeof GeneratedResumeHeaderSchema>;
export type GeneratedResumeEntry = z.infer<typeof GeneratedResumeEntrySchema>;
export type GeneratedResumeListGroup = z.infer<typeof GeneratedResumeListGroupSchema>;
export type GeneratedResumeDocument = z.infer<typeof GeneratedResumeDocumentSchema>;
