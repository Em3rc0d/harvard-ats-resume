import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CredentialMode } from "../../domain/ai/AICapability";
import {
  type CandidateResumeDocument,
  type ResumeSourceRef,
  type SourceBackedText,
} from "../../domain/resume/CandidateResumeDocument";
import {
  GENERATED_RESUME_DOCUMENT_VERSION,
  GeneratedResumeDocumentSchema,
  type GeneratedResumeDocument,
  type GeneratedResumeEntry,
  type GeneratedResumeHeader,
  type GeneratedResumeListGroup,
  type GeneratedResumeTextUnit,
} from "../../domain/resume/GeneratedResumeDocument";
import {
  buildProviderAttemptPlan,
  type AIExecutionProvenance,
} from "../ai/AIGatewayFoundation";
import {
  executeAICapability,
  getAIExecutionBudget,
  type AIGatewayRuntimeConfig,
  type AIExecutionFailureCode,
  type AIProviderAttemptReceipt,
} from "../ai/AIGatewayRuntime";
import { assertProviderEconomicsWithinPolicy } from "../ai/AIProviderEconomics";

const SourceOrdinalsSchema = z.array(z.number().int().min(1).max(100)).min(1).max(100);
const RawTextUnitSchema = z.object({
  text: z.string().trim().min(1).max(5_000),
  sourceOrdinals: SourceOrdinalsSchema,
}).strict();
const RawHeaderSchema = z.object({
  displayName: z.unknown().nullable(),
  headline: z.unknown().nullable(),
  contactLines: z.array(z.unknown()).max(30),
  sourceOrdinals: SourceOrdinalsSchema,
}).strict();
const RawEntrySchema = z.object({
  title: z.unknown().nullable(),
  subtitle: z.unknown().nullable(),
  metaLines: z.array(z.unknown()).max(30),
  summary: z.unknown().nullable(),
  bullets: z.array(z.unknown()).max(60),
  sourceOrdinals: SourceOrdinalsSchema,
}).strict();
const RawGroupSchema = z.object({
  label: z.string().trim().min(1).max(200).nullable(),
  items: z.array(z.unknown()).min(1).max(120),
  sourceOrdinals: SourceOrdinalsSchema,
}).strict();
const ProviderEnvelopeSchema = z.object({
  locale: z.string().trim().min(2).max(35),
  header: z.unknown().nullable(),
  summary: z.unknown().nullable(),
  experience: z.array(z.unknown()).max(30),
  projects: z.array(z.unknown()).max(40),
  education: z.array(z.unknown()).max(20),
  certifications: z.array(z.unknown()).max(40),
  skillGroups: z.array(z.unknown()).max(30),
  languageGroups: z.array(z.unknown()).max(30),
  otherGroups: z.array(z.unknown()).max(30),
  omittedSourceOrdinals: z.array(z.number().int().min(1).max(100)).max(100),
}).strict();

const text = { type: "string" } as const;
const nullableText = { type: ["string", "null"] } as const;
const sourceOrdinals = { type: "array", items: { type: "integer" } } as const;
function objectSchema(properties: Record<string, unknown>) {
  return { type: "object", additionalProperties: false, properties, required: Object.keys(properties) };
}
function nullableObject(properties: Record<string, unknown>) {
  return { anyOf: [objectSchema(properties), { type: "null" }] };
}
const textUnit = objectSchema({ text, sourceOrdinals });
const nullableTextUnit = { anyOf: [textUnit, { type: "null" }] };
const textUnitArray = { type: "array", items: textUnit } as const;
const entry = objectSchema({
  title: nullableTextUnit,
  subtitle: nullableTextUnit,
  metaLines: textUnitArray,
  summary: nullableTextUnit,
  bullets: textUnitArray,
  sourceOrdinals,
});
const group = objectSchema({
  label: nullableText,
  items: textUnitArray,
  sourceOrdinals,
});

export const RESUME_HOLISTIC_IMPROVEMENT_SCHEMA: Readonly<Record<string, unknown>> = objectSchema({
  locale: text,
  header: nullableObject({
    displayName: nullableTextUnit,
    headline: nullableTextUnit,
    contactLines: textUnitArray,
    sourceOrdinals,
  }),
  summary: nullableTextUnit,
  experience: { type: "array", items: entry },
  projects: { type: "array", items: entry },
  education: { type: "array", items: entry },
  certifications: { type: "array", items: entry },
  skillGroups: { type: "array", items: group },
  languageGroups: { type: "array", items: group },
  otherGroups: { type: "array", items: group },
  omittedSourceOrdinals: { type: "array", items: { type: "integer" } },
});

export type HolisticEditorWarningCode =
  | "EDITOR_HEADER_RECOVERED"
  | "EDITOR_SUMMARY_RECOVERED"
  | "EDITOR_EXPERIENCE_RECOVERED"
  | "EDITOR_PROJECTS_RECOVERED"
  | "EDITOR_EDUCATION_RECOVERED"
  | "EDITOR_CERTIFICATIONS_RECOVERED"
  | "EDITOR_SKILLS_RECOVERED"
  | "EDITOR_LANGUAGES_RECOVERED"
  | "EDITOR_OTHER_RECOVERED"
  | "EDITOR_OMISSION_REFERENCE_INVALID";

export type HolisticResumeEditorSuccess = Readonly<{
  ok: true;
  document: GeneratedResumeDocument;
  warnings: readonly HolisticEditorWarningCode[];
  provenance: AIExecutionProvenance;
  attempts: readonly AIProviderAttemptReceipt[];
  resultSha256: string;
}>;
export type HolisticResumeEditorFailure = Readonly<{
  ok: false;
  failureCode: AIExecutionFailureCode | "EDITOR_OUTPUT_INVALID" | "AI_ECONOMICS_POLICY_FAILED";
  attempts: readonly AIProviderAttemptReceipt[];
}>;
export type HolisticResumeEditorOutcome = HolisticResumeEditorSuccess | HolisticResumeEditorFailure;
export type HolisticResumeEditorConfig = AIGatewayRuntimeConfig & Readonly<{
  credentialMode: CredentialMode;
  idFactory?: () => string;
  nowIso?: () => string;
}>;

function providerEnvelopeValidator(value: unknown) {
  ProviderEnvelopeSchema.parse(value);
}

function ordinals(refs: readonly ResumeSourceRef[]) {
  return refs.map((ref) => ref.ordinal);
}

function toProviderText(value: SourceBackedText | null) {
  return value ? { text: value.value, sourceOrdinals: ordinals(value.sourceRefs) } : null;
}

function buildProviderSource(document: CandidateResumeDocument) {
  return {
    locale: document.locale,
    identity: document.identity ? {
      displayName: toProviderText(document.identity.displayName),
      headline: toProviderText(document.identity.headline),
      location: toProviderText(document.identity.location),
      email: toProviderText(document.identity.email),
      phone: toProviderText(document.identity.phone),
      links: document.identity.links.map(toProviderText),
      sourceOrdinals: ordinals(document.identity.sourceRefs),
    } : null,
    profile: toProviderText(document.profile),
    employment: document.employment.map((item) => ({
      role: toProviderText(item.role), organization: toProviderText(item.organization),
      startDateText: toProviderText(item.startDateText), endDateText: toProviderText(item.endDateText),
      location: toProviderText(item.location), summary: toProviderText(item.summary),
      bullets: item.bullets.map(toProviderText), technologies: item.technologies.map(toProviderText),
      sourceOrdinals: ordinals(item.sourceRefs),
    })),
    projects: document.projects.map((item) => ({
      name: toProviderText(item.name), subtitle: toProviderText(item.subtitle), url: toProviderText(item.url),
      summary: toProviderText(item.summary), bullets: item.bullets.map(toProviderText),
      technologies: item.technologies.map(toProviderText), sourceOrdinals: ordinals(item.sourceRefs),
    })),
    education: document.education.map((item) => ({
      institution: toProviderText(item.institution), degree: toProviderText(item.degree), field: toProviderText(item.field),
      startDateText: toProviderText(item.startDateText), endDateText: toProviderText(item.endDateText),
      location: toProviderText(item.location), notes: item.notes.map(toProviderText), sourceOrdinals: ordinals(item.sourceRefs),
    })),
    certifications: document.certifications.map((item) => ({
      name: toProviderText(item.name), issuer: toProviderText(item.issuer), dateText: toProviderText(item.dateText),
      credentialId: toProviderText(item.credentialId), url: toProviderText(item.url), sourceOrdinals: ordinals(item.sourceRefs),
    })),
    skillGroups: document.skillGroups.map((item) => ({
      label: toProviderText(item.label), skills: item.skills.map(toProviderText), sourceOrdinals: ordinals(item.sourceRefs),
    })),
    languages: document.languages.map((item) => ({
      language: toProviderText(item.language), proficiency: toProviderText(item.proficiency), sourceOrdinals: ordinals(item.sourceRefs),
    })),
    otherSections: document.otherSections.map((item) => ({
      heading: toProviderText(item.heading), items: item.items.map(toProviderText), sourceOrdinals: ordinals(item.sourceRefs),
    })),
  };
}

function buildPrompt(document: CandidateResumeDocument, targetText: string | null) {
  const target = targetText
    ? `OPTIONAL TARGET JOB (market truth only; use it to prioritize and phrase, never to create candidate facts):\n${targetText}`
    : "NO TARGET JOB. Optimize for a strong general professional resume.";
  return [
    "Rewrite this complete candidate-authored resume into a materially stronger professional resume.",
    "Candidate source is authoritative. You may improve structure, clarity, impact, ordering, concision and ATS readability, but you must not add facts, metrics, employers, roles, dates, credentials, technologies or skills absent from the source.",
    "Every generated factual text unit must carry sourceOrdinals that support that exact unit. Section labels may be presentational; factual units may not be ungrounded.",
    "Do not upgrade uncertainty. Do not infer numeric impact. Do not transform a project into employment or a skill into experience.",
    "If you omit source material for relevance, list those exact ordinals in omittedSourceOrdinals.",
    target,
    "CANDIDATE SOURCE DOCUMENT:",
    JSON.stringify(buildProviderSource(document)),
  ].join("\n\n");
}

function refsFor(ordinalsInput: readonly number[], refsByOrdinal: ReadonlyMap<number, ResumeSourceRef>): ResumeSourceRef[] | null {
  const unique = [...new Set(ordinalsInput)];
  const refs: ResumeSourceRef[] = [];
  for (const ordinal of unique) {
    const ref = refsByOrdinal.get(ordinal);
    if (!ref) return null;
    refs.push(ref);
  }
  return refs;
}

function projectTextUnit(value: unknown, refsByOrdinal: ReadonlyMap<number, ResumeSourceRef>): GeneratedResumeTextUnit | null {
  const parsed = RawTextUnitSchema.safeParse(value);
  if (!parsed.success) return null;
  const sourceRefs = refsFor(parsed.data.sourceOrdinals, refsByOrdinal);
  return sourceRefs ? { text: parsed.data.text, sourceRefs } : null;
}

function projectNullableUnit(value: unknown, refsByOrdinal: ReadonlyMap<number, ResumeSourceRef>): GeneratedResumeTextUnit | null | undefined {
  if (value === null) return null;
  return projectTextUnit(value, refsByOrdinal) ?? undefined;
}

function projectHeader(value: unknown, refsByOrdinal: ReadonlyMap<number, ResumeSourceRef>): GeneratedResumeHeader | null | undefined {
  if (value === null) return null;
  const parsed = RawHeaderSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const sourceRefs = refsFor(parsed.data.sourceOrdinals, refsByOrdinal);
  if (!sourceRefs) return undefined;
  const displayName = projectNullableUnit(parsed.data.displayName, refsByOrdinal);
  const headline = projectNullableUnit(parsed.data.headline, refsByOrdinal);
  if (displayName === undefined || headline === undefined) return undefined;
  const contactLines = parsed.data.contactLines.map((item) => projectTextUnit(item, refsByOrdinal));
  if (contactLines.some((item) => item === null)) return undefined;
  return { displayName, headline, contactLines: contactLines as GeneratedResumeTextUnit[], sourceRefs };
}

function projectEntry(value: unknown, refsByOrdinal: ReadonlyMap<number, ResumeSourceRef>): GeneratedResumeEntry | null {
  const parsed = RawEntrySchema.safeParse(value);
  if (!parsed.success) return null;
  const sourceRefs = refsFor(parsed.data.sourceOrdinals, refsByOrdinal);
  if (!sourceRefs) return null;
  const title = projectNullableUnit(parsed.data.title, refsByOrdinal);
  const subtitle = projectNullableUnit(parsed.data.subtitle, refsByOrdinal);
  const summary = projectNullableUnit(parsed.data.summary, refsByOrdinal);
  if (title === undefined || subtitle === undefined || summary === undefined) return null;
  const metaLines = parsed.data.metaLines.map((item) => projectTextUnit(item, refsByOrdinal));
  const bullets = parsed.data.bullets.map((item) => projectTextUnit(item, refsByOrdinal));
  if (metaLines.some((item) => item === null) || bullets.some((item) => item === null)) return null;
  return { title, subtitle, metaLines: metaLines as GeneratedResumeTextUnit[], summary, bullets: bullets as GeneratedResumeTextUnit[], sourceRefs };
}

function projectGroup(value: unknown, refsByOrdinal: ReadonlyMap<number, ResumeSourceRef>): GeneratedResumeListGroup | null {
  const parsed = RawGroupSchema.safeParse(value);
  if (!parsed.success) return null;
  const sourceRefs = refsFor(parsed.data.sourceOrdinals, refsByOrdinal);
  if (!sourceRefs) return null;
  const items = parsed.data.items.map((item) => projectTextUnit(item, refsByOrdinal));
  if (items.some((item) => item === null)) return null;
  return { label: parsed.data.label, items: items as GeneratedResumeTextUnit[], sourceRefs };
}

function sourceUnit(value: SourceBackedText | null): GeneratedResumeTextUnit | null {
  return value ? { text: value.value, sourceRefs: value.sourceRefs } : null;
}
function compactUnits(values: readonly (SourceBackedText | null)[]): GeneratedResumeTextUnit[] {
  return values.map(sourceUnit).filter((value): value is GeneratedResumeTextUnit => value !== null);
}
function sourceEntry(
  title: SourceBackedText | null,
  subtitle: SourceBackedText | null,
  meta: readonly (SourceBackedText | null)[],
  summary: SourceBackedText | null,
  bullets: readonly SourceBackedText[],
  sourceRefs: readonly ResumeSourceRef[],
): GeneratedResumeEntry {
  return { title: sourceUnit(title), subtitle: sourceUnit(subtitle), metaLines: compactUnits(meta), summary: sourceUnit(summary), bullets: bullets.map((item) => sourceUnit(item)!), sourceRefs: [...sourceRefs] };
}
function sourceHeader(document: CandidateResumeDocument): GeneratedResumeHeader | null {
  const identity = document.identity;
  if (!identity) return null;
  return {
    displayName: sourceUnit(identity.displayName),
    headline: sourceUnit(identity.headline),
    contactLines: compactUnits([identity.location, identity.email, identity.phone, ...identity.links]),
    sourceRefs: [...identity.sourceRefs],
  };
}
function sourceExperience(document: CandidateResumeDocument): GeneratedResumeEntry[] {
  return document.employment.map((item) => sourceEntry(
    item.role, item.organization,
    [item.startDateText, item.endDateText, item.location, ...item.technologies],
    item.summary, item.bullets, item.sourceRefs,
  ));
}
function sourceProjects(document: CandidateResumeDocument): GeneratedResumeEntry[] {
  return document.projects.map((item) => sourceEntry(
    item.name, item.subtitle,
    [item.url, ...item.technologies], item.summary, item.bullets, item.sourceRefs,
  ));
}
function sourceEducation(document: CandidateResumeDocument): GeneratedResumeEntry[] {
  return document.education.map((item) => sourceEntry(
    item.degree ?? item.institution,
    item.degree ? item.institution : item.field,
    [item.field, item.startDateText, item.endDateText, item.location], null, item.notes, item.sourceRefs,
  ));
}
function sourceCertifications(document: CandidateResumeDocument): GeneratedResumeEntry[] {
  return document.certifications.map((item) => sourceEntry(
    item.name, item.issuer, [item.dateText, item.credentialId, item.url], null, [], item.sourceRefs,
  ));
}
function sourceSkillGroups(document: CandidateResumeDocument): GeneratedResumeListGroup[] {
  return document.skillGroups.map((group) => ({
    label: group.label?.value ?? null,
    items: group.skills.map((item) => sourceUnit(item)!),
    sourceRefs: [...group.sourceRefs],
  }));
}
function sourceLanguageGroups(document: CandidateResumeDocument): GeneratedResumeListGroup[] {
  if (document.languages.length === 0) return [];
  const refs = new Map<number, ResumeSourceRef>();
  const items: GeneratedResumeTextUnit[] = [];
  for (const language of document.languages) {
    language.sourceRefs.forEach((ref) => refs.set(ref.ordinal, ref));
    items.push(sourceUnit(language.language)!);
    const proficiency = sourceUnit(language.proficiency);
    if (proficiency) items.push(proficiency);
  }
  return [{ label: "Languages", items, sourceRefs: [...refs.values()] }];
}
function sourceOtherGroups(document: CandidateResumeDocument): GeneratedResumeListGroup[] {
  return document.otherSections.map((group) => ({
    label: group.heading?.value ?? null,
    items: group.items.map((item) => sourceUnit(item)!),
    sourceRefs: [...group.sourceRefs],
  }));
}

function projectArrayOrRecover<T>(
  values: readonly unknown[],
  projector: (value: unknown) => T | null,
  fallback: () => T[],
  warning: HolisticEditorWarningCode,
  warnings: HolisticEditorWarningCode[],
): T[] {
  const projected = values.map(projector);
  if (projected.some((item) => item === null)) {
    warnings.push(warning);
    return fallback();
  }
  return projected as T[];
}

export async function improveResumeHolistically(
  source: CandidateResumeDocument,
  targetTextInput: string | null,
  config: HolisticResumeEditorConfig,
): Promise<HolisticResumeEditorOutcome> {
  const targetText = targetTextInput === null ? null : z.string().trim().min(1).max(15_000).parse(targetTextInput);
  const capability = "RESUME_HOLISTIC_IMPROVEMENT" as const;
  const budget = getAIExecutionBudget(capability, config.budgetOverrides ?? {});
  try {
    assertProviderEconomicsWithinPolicy(capability, buildProviderAttemptPlan(capability, config.credentialMode), budget);
  } catch {
    return { ok: false, failureCode: "AI_ECONOMICS_POLICY_FAILED", attempts: [] };
  }

  const outcome = await executeAICapability({
    capability,
    credentialMode: config.credentialMode,
    prompt: buildPrompt(source, targetText),
    systemInstruction: "You are CV Engine's holistic resume editor. Improve presentation aggressively but remain epistemically conservative: candidate source is authoritative, job text is market truth only, and every factual output unit must cite supporting source ordinals. Return only the requested structured output.",
    responseJsonSchema: RESUME_HOLISTIC_IMPROVEMENT_SCHEMA,
    structuredOutputValidator: providerEnvelopeValidator,
  }, config);

  if (!outcome.ok) return { ok: false, failureCode: outcome.failureCode, attempts: outcome.attempts };

  let raw: z.infer<typeof ProviderEnvelopeSchema>;
  try {
    raw = ProviderEnvelopeSchema.parse(JSON.parse(outcome.proposal.text));
  } catch {
    return { ok: false, failureCode: "EDITOR_OUTPUT_INVALID", attempts: outcome.attempts };
  }

  const refsByOrdinal = new Map(source.provenanceIndex.map((ref) => [ref.ordinal, ref] as const));
  const warnings: HolisticEditorWarningCode[] = [];

  let header = projectHeader(raw.header, refsByOrdinal);
  if (header === undefined) {
    header = sourceHeader(source);
    warnings.push("EDITOR_HEADER_RECOVERED");
  }
  let summary = projectNullableUnit(raw.summary, refsByOrdinal);
  if (summary === undefined) {
    summary = sourceUnit(source.profile);
    warnings.push("EDITOR_SUMMARY_RECOVERED");
  }

  const experience = projectArrayOrRecover(raw.experience, (value) => projectEntry(value, refsByOrdinal), () => sourceExperience(source), "EDITOR_EXPERIENCE_RECOVERED", warnings);
  const projects = projectArrayOrRecover(raw.projects, (value) => projectEntry(value, refsByOrdinal), () => sourceProjects(source), "EDITOR_PROJECTS_RECOVERED", warnings);
  const education = projectArrayOrRecover(raw.education, (value) => projectEntry(value, refsByOrdinal), () => sourceEducation(source), "EDITOR_EDUCATION_RECOVERED", warnings);
  const certifications = projectArrayOrRecover(raw.certifications, (value) => projectEntry(value, refsByOrdinal), () => sourceCertifications(source), "EDITOR_CERTIFICATIONS_RECOVERED", warnings);
  const skillGroups = projectArrayOrRecover(raw.skillGroups, (value) => projectGroup(value, refsByOrdinal), () => sourceSkillGroups(source), "EDITOR_SKILLS_RECOVERED", warnings);
  const languageGroups = projectArrayOrRecover(raw.languageGroups, (value) => projectGroup(value, refsByOrdinal), () => sourceLanguageGroups(source), "EDITOR_LANGUAGES_RECOVERED", warnings);
  const otherGroups = projectArrayOrRecover(raw.otherGroups, (value) => projectGroup(value, refsByOrdinal), () => sourceOtherGroups(source), "EDITOR_OTHER_RECOVERED", warnings);

  const omittedSourceOrdinals = [...new Set(raw.omittedSourceOrdinals)].filter((ordinal) => {
    const known = refsByOrdinal.has(ordinal);
    if (!known) warnings.push("EDITOR_OMISSION_REFERENCE_INVALID");
    return known;
  });

  const document = GeneratedResumeDocumentSchema.parse({
    id: (config.idFactory ?? randomUUID)(),
    ownerUserId: source.ownerUserId,
    sourceDocumentId: source.id,
    sourceReceiptId: source.sourceReceiptId,
    sourceDocumentSha256: source.sourceDocumentSha256,
    documentVersion: GENERATED_RESUME_DOCUMENT_VERSION,
    editorStatus: warnings.length === 0 ? "AI_EDITED" : "PARTIAL_RECOVERY",
    locale: raw.locale,
    header,
    summary,
    experience,
    projects,
    education,
    certifications,
    skillGroups,
    languageGroups,
    otherGroups,
    omittedSourceOrdinals,
    sourceProvenanceIndex: source.provenanceIndex,
    createdAt: (config.nowIso ?? (() => new Date().toISOString()))(),
  });

  return {
    ok: true,
    document,
    warnings: [...new Set(warnings)],
    provenance: outcome.provenance,
    attempts: outcome.attempts,
    resultSha256: outcome.resultSha256,
  };
}
