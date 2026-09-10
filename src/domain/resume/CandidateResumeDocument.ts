import { z } from "zod";

export const CANDIDATE_RESUME_DOCUMENT_VERSION = "v12-candidate-resume-document-v1" as const;

export const ResumeSourceRefSchema = z.object({
  proposalId: z.string().uuid(),
  ordinal: z.number().int().min(1).max(100),
  sourceLine: z.number().int().positive(),
  sourceTextSha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export const SourceBackedTextSchema = z.object({
  value: z.string().trim().min(1).max(5_000),
  sourceRefs: z.array(ResumeSourceRefSchema).min(1).max(100),
}).strict();

const NullableSourceBackedTextSchema = SourceBackedTextSchema.nullable();
const EntitySourceRefsSchema = z.array(ResumeSourceRefSchema).min(1).max(100);

export const CandidateResumeIdentitySchema = z.object({
  displayName: NullableSourceBackedTextSchema,
  headline: NullableSourceBackedTextSchema,
  location: NullableSourceBackedTextSchema,
  email: NullableSourceBackedTextSchema,
  phone: NullableSourceBackedTextSchema,
  links: z.array(SourceBackedTextSchema).max(20),
  sourceRefs: EntitySourceRefsSchema,
}).strict();

export const CandidateEmploymentEntitySchema = z.object({
  role: NullableSourceBackedTextSchema,
  organization: NullableSourceBackedTextSchema,
  startDateText: NullableSourceBackedTextSchema,
  endDateText: NullableSourceBackedTextSchema,
  location: NullableSourceBackedTextSchema,
  summary: NullableSourceBackedTextSchema,
  bullets: z.array(SourceBackedTextSchema).max(40),
  technologies: z.array(SourceBackedTextSchema).max(60),
  sourceRefs: EntitySourceRefsSchema,
}).strict();

export const CandidateProjectEntitySchema = z.object({
  name: NullableSourceBackedTextSchema,
  subtitle: NullableSourceBackedTextSchema,
  url: NullableSourceBackedTextSchema,
  summary: NullableSourceBackedTextSchema,
  bullets: z.array(SourceBackedTextSchema).max(40),
  technologies: z.array(SourceBackedTextSchema).max(60),
  sourceRefs: EntitySourceRefsSchema,
}).strict();

export const CandidateEducationEntitySchema = z.object({
  institution: NullableSourceBackedTextSchema,
  degree: NullableSourceBackedTextSchema,
  field: NullableSourceBackedTextSchema,
  startDateText: NullableSourceBackedTextSchema,
  endDateText: NullableSourceBackedTextSchema,
  location: NullableSourceBackedTextSchema,
  notes: z.array(SourceBackedTextSchema).max(20),
  sourceRefs: EntitySourceRefsSchema,
}).strict();

export const CandidateCertificationEntitySchema = z.object({
  name: NullableSourceBackedTextSchema,
  issuer: NullableSourceBackedTextSchema,
  dateText: NullableSourceBackedTextSchema,
  credentialId: NullableSourceBackedTextSchema,
  url: NullableSourceBackedTextSchema,
  sourceRefs: EntitySourceRefsSchema,
}).strict();

export const CandidateSkillGroupEntitySchema = z.object({
  label: NullableSourceBackedTextSchema,
  skills: z.array(SourceBackedTextSchema).min(1).max(100),
  sourceRefs: EntitySourceRefsSchema,
}).strict();

export const CandidateLanguageEntitySchema = z.object({
  language: SourceBackedTextSchema,
  proficiency: NullableSourceBackedTextSchema,
  sourceRefs: EntitySourceRefsSchema,
}).strict();

export const CandidateOtherSectionEntitySchema = z.object({
  heading: NullableSourceBackedTextSchema,
  items: z.array(SourceBackedTextSchema).min(1).max(100),
  sourceRefs: EntitySourceRefsSchema,
}).strict();

export const CandidateResumeDocumentSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  sourceReceiptId: z.string().uuid(),
  sourceDocumentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  documentVersion: z.literal(CANDIDATE_RESUME_DOCUMENT_VERSION),
  understandingStatus: z.enum(["AI_STRUCTURED", "PARTIAL_RECOVERY"]),
  locale: z.string().trim().min(2).max(35),
  identity: CandidateResumeIdentitySchema.nullable(),
  profile: SourceBackedTextSchema.nullable(),
  employment: z.array(CandidateEmploymentEntitySchema).max(30),
  projects: z.array(CandidateProjectEntitySchema).max(40),
  education: z.array(CandidateEducationEntitySchema).max(20),
  certifications: z.array(CandidateCertificationEntitySchema).max(40),
  skillGroups: z.array(CandidateSkillGroupEntitySchema).max(30),
  languages: z.array(CandidateLanguageEntitySchema).max(30),
  otherSections: z.array(CandidateOtherSectionEntitySchema).max(30),
  unassignedSourceOrdinals: z.array(z.number().int().min(1).max(100)).max(100),
  provenanceIndex: z.array(ResumeSourceRefSchema).min(1).max(100),
  createdAt: z.iso.datetime(),
}).strict().superRefine((document, context) => {
  const provenanceOrdinals = document.provenanceIndex.map((ref) => ref.ordinal);
  if (new Set(provenanceOrdinals).size !== provenanceOrdinals.length) {
    context.addIssue({ code: "custom", path: ["provenanceIndex"], message: "Provenance ordinals must be unique." });
  }

  const unassigned = document.unassignedSourceOrdinals;
  if (new Set(unassigned).size !== unassigned.length) {
    context.addIssue({ code: "custom", path: ["unassignedSourceOrdinals"], message: "Unassigned source ordinals must be unique." });
  }
  const known = new Set(provenanceOrdinals);
  if (unassigned.some((ordinal) => !known.has(ordinal))) {
    context.addIssue({ code: "custom", path: ["unassignedSourceOrdinals"], message: "Unassigned ordinals must exist in provenance." });
  }
});

export type ResumeSourceRef = z.infer<typeof ResumeSourceRefSchema>;
export type SourceBackedText = z.infer<typeof SourceBackedTextSchema>;
export type CandidateResumeIdentity = z.infer<typeof CandidateResumeIdentitySchema>;
export type CandidateEmploymentEntity = z.infer<typeof CandidateEmploymentEntitySchema>;
export type CandidateProjectEntity = z.infer<typeof CandidateProjectEntitySchema>;
export type CandidateEducationEntity = z.infer<typeof CandidateEducationEntitySchema>;
export type CandidateCertificationEntity = z.infer<typeof CandidateCertificationEntitySchema>;
export type CandidateSkillGroupEntity = z.infer<typeof CandidateSkillGroupEntitySchema>;
export type CandidateLanguageEntity = z.infer<typeof CandidateLanguageEntitySchema>;
export type CandidateOtherSectionEntity = z.infer<typeof CandidateOtherSectionEntitySchema>;
export type CandidateResumeDocument = z.infer<typeof CandidateResumeDocumentSchema>;
