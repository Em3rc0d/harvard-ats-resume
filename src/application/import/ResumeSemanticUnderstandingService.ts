import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CredentialMode } from "../../domain/ai/AICapability";
import type { ImportReceipt } from "../../domain/import/Import";
import {
  CANDIDATE_RESUME_DOCUMENT_VERSION,
  CandidateResumeDocumentSchema,
  type CandidateResumeDocument,
  type ResumeSourceRef,
} from "../../domain/resume/CandidateResumeDocument";
import { buildProviderAttemptPlan } from "../ai/AIGatewayFoundation";
import {
  executeAICapability,
  getAIExecutionBudget,
  type AIGatewayRuntimeConfig,
  type AIExecutionFailureCode,
  type AIExecutionProvenance,
  type AIProviderAttemptReceipt,
} from "../ai/AIGatewayRuntime";
import { assertProviderEconomicsWithinPolicy } from "../ai/AIProviderEconomics";

const NullableTextSchema = z.string().trim().min(1).max(5_000).nullable();
const SourceOrdinalsSchema = z.array(z.number().int().min(1).max(100)).min(1).max(100);

const RawIdentitySchema = z.object({
  displayName: NullableTextSchema,
  headline: NullableTextSchema,
  location: NullableTextSchema,
  email: NullableTextSchema,
  phone: NullableTextSchema,
  links: z.array(z.string().trim().min(1).max(2_000)).max(20),
  sourceOrdinals: SourceOrdinalsSchema,
}).strict();

const RawProfileSchema = z.object({
  text: z.string().trim().min(1).max(5_000),
  sourceOrdinals: SourceOrdinalsSchema,
}).strict();

const RawEmploymentSchema = z.object({
  role: NullableTextSchema,
  organization: NullableTextSchema,
  startDateText: NullableTextSchema,
  endDateText: NullableTextSchema,
  location: NullableTextSchema,
  summary: NullableTextSchema,
  bullets: z.array(z.string().trim().min(1).max(5_000)).max(40),
  technologies: z.array(z.string().trim().min(1).max(500)).max(60),
  sourceOrdinals: SourceOrdinalsSchema,
}).strict();

const RawProjectSchema = z.object({
  name: NullableTextSchema,
  subtitle: NullableTextSchema,
  url: NullableTextSchema,
  summary: NullableTextSchema,
  bullets: z.array(z.string().trim().min(1).max(5_000)).max(40),
  technologies: z.array(z.string().trim().min(1).max(500)).max(60),
  sourceOrdinals: SourceOrdinalsSchema,
}).strict();

const RawEducationSchema = z.object({
  institution: NullableTextSchema,
  degree: NullableTextSchema,
  field: NullableTextSchema,
  startDateText: NullableTextSchema,
  endDateText: NullableTextSchema,
  location: NullableTextSchema,
  notes: z.array(z.string().trim().min(1).max(2_000)).max(20),
  sourceOrdinals: SourceOrdinalsSchema,
}).strict();

const RawCertificationSchema = z.object({
  name: NullableTextSchema,
  issuer: NullableTextSchema,
  dateText: NullableTextSchema,
  credentialId: NullableTextSchema,
  url: NullableTextSchema,
  sourceOrdinals: SourceOrdinalsSchema,
}).strict();

const RawSkillGroupSchema = z.object({
  label: NullableTextSchema,
  skills: z.array(z.string().trim().min(1).max(500)).min(1).max(100),
  sourceOrdinals: SourceOrdinalsSchema,
}).strict();

const RawLanguageSchema = z.object({
  language: z.string().trim().min(1).max(200),
  proficiency: NullableTextSchema,
  sourceOrdinals: SourceOrdinalsSchema,
}).strict();

const RawOtherSectionSchema = z.object({
  heading: NullableTextSchema,
  items: z.array(z.string().trim().min(1).max(5_000)).min(1).max(100),
  sourceOrdinals: SourceOrdinalsSchema,
}).strict();

const ProviderEnvelopeSchema = z.object({
  locale: z.string().trim().min(2).max(35),
  identity: z.unknown().nullable(),
  profile: z.unknown().nullable(),
  employment: z.array(z.unknown()).max(30),
  projects: z.array(z.unknown()).max(40),
  education: z.array(z.unknown()).max(20),
  certifications: z.array(z.unknown()).max(40),
  skillGroups: z.array(z.unknown()).max(30),
  languages: z.array(z.unknown()).max(30),
  otherSections: z.array(z.unknown()).max(30),
  unassignedSourceOrdinals: z.array(z.number().int().min(1).max(100)).max(100),
}).strict();

export const RESUME_SEMANTIC_UNDERSTANDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    locale: { type: "string" },
    identity: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            displayName: { type: ["string", "null"] },
            headline: { type: ["string", "null"] },
            location: { type: ["string", "null"] },
            email: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            links: { type: "array", items: { type: "string" } },
            sourceOrdinals: { type: "array", items: { type: "integer" } },
          },
          required: ["displayName", "headline", "location", "email", "phone", "links", "sourceOrdinals"],
        },
        { type: "null" },
      ],
    },
    profile: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            sourceOrdinals: { type: "array", items: { type: "integer" } },
          },
          required: ["text", "sourceOrdinals"],
        },
        { type: "null" },
      ],
    },
    employment: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          role: { type: ["string", "null"] },
          organization: { type: ["string", "null"] },
          startDateText: { type: ["string", "null"] },
          endDateText: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          summary: { type: ["string", "null"] },
          bullets: { type: "array", items: { type: "string" } },
          technologies: { type: "array", items: { type: "string" } },
          sourceOrdinals: { type: "array", items: { type: "integer" } },
        },
        required: ["role", "organization", "startDateText", "endDateText", "location", "summary", "bullets", "technologies", "sourceOrdinals"],
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: ["string", "null"] },
          subtitle: { type: ["string", "null"] },
          url: { type: ["string", "null"] },
          summary: { type: ["string", "null"] },
          bullets: { type: "array", items: { type: "string" } },
          technologies: { type: "array", items: { type: "string" } },
          sourceOrdinals: { type: "array", items: { type: "integer" } },
        },
        required: ["name", "subtitle", "url", "summary", "bullets", "technologies", "sourceOrdinals"],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          institution: { type: ["string", "null"] },
          degree: { type: ["string", "null"] },
          field: { type: ["string", "null"] },
          startDateText: { type: ["string", "null"] },
          endDateText: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          notes: { type: "array", items: { type: "string" } },
          sourceOrdinals: { type: "array", items: { type: "integer" } },
        },
        required: ["institution", "degree", "field", "startDateText", "endDateText", "location", "notes", "sourceOrdinals"],
      },
    },
    certifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: ["string", "null"] },
          issuer: { type: ["string", "null"] },
          dateText: { type: ["string", "null"] },
          credentialId: { type: ["string", "null"] },
          url: { type: ["string", "null"] },
          sourceOrdinals: { type: "array", items: { type: "integer" } },
        },
        required: ["name", "issuer", "dateText", "credentialId", "url", "sourceOrdinals"],
      },
    },
    skillGroups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: ["string", "null"] },
          skills: { type: "array", items: { type: "string" } },
          sourceOrdinals: { type: "array", items: { type: "integer" } },
        },
        required: ["label", "skills", "sourceOrdinals"],
      },
    },
    languages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          language: { type: "string" },
          proficiency: { type: ["string", "null"] },
          sourceOrdinals: { type: "array", items: { type: "integer" } },
        },
        required: ["language", "proficiency", "sourceOrdinals"],
      },
    },
    otherSections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          heading: { type: ["string", "null"] },
          items: { type: "array", items: { type: "string" } },
          sourceOrdinals: { type: "array", items: { type: "integer" } },
        },
        required: ["heading", "items", "sourceOrdinals"],
      },
    },
    unassignedSourceOrdinals: { type: "array", items: { type: "integer" } },
  },
  required: [
    "locale",
    "identity",
    "profile",
    "employment",
    "projects",
    "education",
    "certifications",
    "skillGroups",
    "languages",
    "otherSections",
    "unassignedSourceOrdinals",
  ],
} as const satisfies Readonly<Record<string, unknown>>;

export type SemanticUnderstandingWarningCode =
  | "SEMANTIC_ENTITY_INVALID"
  | "SEMANTIC_REFERENCE_INVALID";

export type ResumeSemanticUnderstandingSuccess = Readonly<{
  ok: true;
  document: CandidateResumeDocument;
  warnings: readonly SemanticUnderstandingWarningCode[];
  provenance: AIExecutionProvenance;
  attempts: readonly AIProviderAttemptReceipt[];
  resultSha256: string;
}>;

export type ResumeSemanticUnderstandingFailure = Readonly<{
  ok: false;
  failureCode: AIExecutionFailureCode | "SOURCE_NOT_EXTRACTED" | "SEMANTIC_OUTPUT_INVALID";
  attempts: readonly AIProviderAttemptReceipt[];
}>;

export type ResumeSemanticUnderstandingOutcome =
  | ResumeSemanticUnderstandingSuccess
  | ResumeSemanticUnderstandingFailure;

export type ResumeSemanticUnderstandingConfig = AIGatewayRuntimeConfig & Readonly<{
  credentialMode: CredentialMode;
  idFactory?: () => string;
  nowIso?: () => string;
}>;

function providerEnvelopeValidator(value: unknown) {
  ProviderEnvelopeSchema.parse(value);
}

function sourceRefFromProposal(proposal: ImportReceipt["proposals"][number]): ResumeSourceRef {
  return {
    proposalId: proposal.id,
    ordinal: proposal.ordinal,
    sourceLine: proposal.sourceLine,
    sourceTextSha256: proposal.sourceTextSha256,
  };
}

function buildPrompt(receipt: ImportReceipt) {
  const lines = receipt.proposals
    .map((proposal) => `${proposal.ordinal}\tline=${proposal.sourceLine}\t${proposal.canonicalText}`)
    .join("\n");

  return [
    "Understand this candidate-authored resume as one complete professional document.",
    "The candidate-provided text is authoritative source material. Do not judge whether the biography is externally verified.",
    "Do not improve wording and do not invent facts in this step. Only identify semantic entities and link each entity to sourceOrdinals from the input.",
    "A source ordinal that is only a section heading may be left in unassignedSourceOrdinals.",
    "Never return a source ordinal that is absent from the input.",
    "SOURCE LINES:",
    lines,
  ].join("\n");
}

function uniqueRefs(ordinals: readonly number[], refsByOrdinal: ReadonlyMap<number, ResumeSourceRef>): ResumeSourceRef[] | null {
  const unique = [...new Set(ordinals)];
  if (unique.length === 0 || unique.some((ordinal) => !refsByOrdinal.has(ordinal))) return null;
  return unique.map((ordinal) => refsByOrdinal.get(ordinal) as ResumeSourceRef);
}

function backed(value: string | null, refs: ResumeSourceRef[]) {
  return value === null ? null : { value, sourceRefs: refs };
}

function backedMany(values: readonly string[], refs: ResumeSourceRef[]) {
  return values.map((value) => ({ value, sourceRefs: refs }));
}

function rawOrdinals(value: unknown): number[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const candidate = (value as { sourceOrdinals?: unknown }).sourceOrdinals;
  if (!Array.isArray(candidate)) return [];
  return candidate.filter((item): item is number => Number.isInteger(item) && Number(item) > 0);
}

export function projectSemanticProviderOutput(
  receipt: ImportReceipt,
  rawValue: unknown,
  options: Readonly<{ id?: string; createdAt?: string }> = {},
): Readonly<{ document: CandidateResumeDocument; warnings: readonly SemanticUnderstandingWarningCode[] }> {
  const envelope = ProviderEnvelopeSchema.parse(rawValue);
  const provenanceIndex = receipt.proposals.map(sourceRefFromProposal);
  const refsByOrdinal = new Map(provenanceIndex.map((ref) => [ref.ordinal, ref] as const));
  const usedOrdinals = new Set<number>();
  const warnings = new Set<SemanticUnderstandingWarningCode>();

  const validRefs = (value: { sourceOrdinals: readonly number[] }): ResumeSourceRef[] | null => {
    const refs = uniqueRefs(value.sourceOrdinals, refsByOrdinal);
    if (!refs) {
      warnings.add("SEMANTIC_REFERENCE_INVALID");
      return null;
    }
    refs.forEach((ref) => usedOrdinals.add(ref.ordinal));
    return refs;
  };

  const parseOne = <T>(schema: z.ZodType<T>, value: unknown): { value: T; refs: ResumeSourceRef[] } | null => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      warnings.add("SEMANTIC_ENTITY_INVALID");
      return null;
    }
    const refs = validRefs(parsed.data as T & { sourceOrdinals: readonly number[] });
    return refs ? { value: parsed.data, refs } : null;
  };

  const parseMany = <T>(schema: z.ZodType<T>, values: readonly unknown[]) =>
    values.map((value) => parseOne(schema, value)).filter((value): value is { value: T; refs: ResumeSourceRef[] } => value !== null);

  const identityParsed = envelope.identity === null ? null : parseOne(RawIdentitySchema, envelope.identity);
  const profileParsed = envelope.profile === null ? null : parseOne(RawProfileSchema, envelope.profile);
  const employmentParsed = parseMany(RawEmploymentSchema, envelope.employment);
  const projectsParsed = parseMany(RawProjectSchema, envelope.projects);
  const educationParsed = parseMany(RawEducationSchema, envelope.education);
  const certificationsParsed = parseMany(RawCertificationSchema, envelope.certifications);
  const skillGroupsParsed = parseMany(RawSkillGroupSchema, envelope.skillGroups);
  const languagesParsed = parseMany(RawLanguageSchema, envelope.languages);
  const otherSectionsParsed = parseMany(RawOtherSectionSchema, envelope.otherSections);

  for (const value of [
    envelope.identity,
    envelope.profile,
    ...envelope.employment,
    ...envelope.projects,
    ...envelope.education,
    ...envelope.certifications,
    ...envelope.skillGroups,
    ...envelope.languages,
    ...envelope.otherSections,
  ]) {
    const ordinals = rawOrdinals(value);
    if (ordinals.some((ordinal) => !refsByOrdinal.has(ordinal))) warnings.add("SEMANTIC_REFERENCE_INVALID");
  }

  const providerUnassigned = envelope.unassignedSourceOrdinals.filter((ordinal) => refsByOrdinal.has(ordinal));
  const unassigned = new Set<number>(providerUnassigned);
  for (const proposal of receipt.proposals) {
    if (!usedOrdinals.has(proposal.ordinal)) unassigned.add(proposal.ordinal);
  }

  const document = CandidateResumeDocumentSchema.parse({
    id: options.id ?? randomUUID(),
    ownerUserId: receipt.ownerUserId,
    sourceReceiptId: receipt.id,
    sourceDocumentSha256: receipt.sourceSha256,
    documentVersion: CANDIDATE_RESUME_DOCUMENT_VERSION,
    understandingStatus: warnings.size > 0 ? "PARTIAL_RECOVERY" : "AI_STRUCTURED",
    locale: envelope.locale,
    identity: identityParsed ? {
      displayName: backed(identityParsed.value.displayName, identityParsed.refs),
      headline: backed(identityParsed.value.headline, identityParsed.refs),
      location: backed(identityParsed.value.location, identityParsed.refs),
      email: backed(identityParsed.value.email, identityParsed.refs),
      phone: backed(identityParsed.value.phone, identityParsed.refs),
      links: backedMany(identityParsed.value.links, identityParsed.refs),
      sourceRefs: identityParsed.refs,
    } : null,
    profile: profileParsed ? { value: profileParsed.value.text, sourceRefs: profileParsed.refs } : null,
    employment: employmentParsed.map(({ value, refs }) => ({
      role: backed(value.role, refs),
      organization: backed(value.organization, refs),
      startDateText: backed(value.startDateText, refs),
      endDateText: backed(value.endDateText, refs),
      location: backed(value.location, refs),
      summary: backed(value.summary, refs),
      bullets: backedMany(value.bullets, refs),
      technologies: backedMany(value.technologies, refs),
      sourceRefs: refs,
    })),
    projects: projectsParsed.map(({ value, refs }) => ({
      name: backed(value.name, refs),
      subtitle: backed(value.subtitle, refs),
      url: backed(value.url, refs),
      summary: backed(value.summary, refs),
      bullets: backedMany(value.bullets, refs),
      technologies: backedMany(value.technologies, refs),
      sourceRefs: refs,
    })),
    education: educationParsed.map(({ value, refs }) => ({
      institution: backed(value.institution, refs),
      degree: backed(value.degree, refs),
      field: backed(value.field, refs),
      startDateText: backed(value.startDateText, refs),
      endDateText: backed(value.endDateText, refs),
      location: backed(value.location, refs),
      notes: backedMany(value.notes, refs),
      sourceRefs: refs,
    })),
    certifications: certificationsParsed.map(({ value, refs }) => ({
      name: backed(value.name, refs),
      issuer: backed(value.issuer, refs),
      dateText: backed(value.dateText, refs),
      credentialId: backed(value.credentialId, refs),
      url: backed(value.url, refs),
      sourceRefs: refs,
    })),
    skillGroups: skillGroupsParsed.map(({ value, refs }) => ({
      label: backed(value.label, refs),
      skills: backedMany(value.skills, refs),
      sourceRefs: refs,
    })),
    languages: languagesParsed.map(({ value, refs }) => ({
      language: { value: value.language, sourceRefs: refs },
      proficiency: backed(value.proficiency, refs),
      sourceRefs: refs,
    })),
    otherSections: otherSectionsParsed.map(({ value, refs }) => ({
      heading: backed(value.heading, refs),
      items: backedMany(value.items, refs),
      sourceRefs: refs,
    })),
    unassignedSourceOrdinals: [...unassigned].sort((a, b) => a - b),
    provenanceIndex,
    createdAt: options.createdAt ?? new Date().toISOString(),
  });

  return { document, warnings: [...warnings] };
}

export async function understandResumeSemantics(
  receipt: ImportReceipt,
  config: ResumeSemanticUnderstandingConfig,
): Promise<ResumeSemanticUnderstandingOutcome> {
  if (receipt.status !== "EXTRACTED" || receipt.proposals.length === 0) {
    return { ok: false, failureCode: "SOURCE_NOT_EXTRACTED", attempts: [] };
  }

  const capability = "RESUME_SEMANTIC_UNDERSTANDING" as const;
  const budget = getAIExecutionBudget(capability, config.budgetOverrides ?? {});
  assertProviderEconomicsWithinPolicy(
    capability,
    buildProviderAttemptPlan(capability, config.credentialMode),
    budget,
  );

  const outcome = await executeAICapability({
    capability,
    credentialMode: config.credentialMode,
    prompt: buildPrompt(receipt),
    systemInstruction: "Return a source-linked semantic representation of the candidate-authored resume. Preserve source meaning. Never add career facts.",
    responseJsonSchema: RESUME_SEMANTIC_UNDERSTANDING_SCHEMA,
    structuredOutputValidator: providerEnvelopeValidator,
  }, config);

  if (!outcome.ok) {
    return { ok: false, failureCode: outcome.failureCode, attempts: outcome.attempts };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(outcome.proposal.text);
  } catch {
    return { ok: false, failureCode: "SEMANTIC_OUTPUT_INVALID", attempts: outcome.attempts };
  }

  try {
    const projected = projectSemanticProviderOutput(receipt, raw, {
      id: config.idFactory?.() ?? randomUUID(),
      createdAt: config.nowIso?.() ?? new Date().toISOString(),
    });
    return {
      ok: true,
      document: projected.document,
      warnings: projected.warnings,
      provenance: outcome.provenance,
      attempts: outcome.attempts,
      resultSha256: outcome.resultSha256,
    };
  } catch {
    return { ok: false, failureCode: "SEMANTIC_OUTPUT_INVALID", attempts: outcome.attempts };
  }
}
