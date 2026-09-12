import { createHash } from "node:crypto";
import { z } from "zod";
import type { CredentialMode } from "../../domain/ai/AICapability";
import type {
  CandidateResumeDocument,
  ResumeSourceRef,
  SourceBackedText,
} from "../../domain/resume/CandidateResumeDocument";
import {
  FACT_GUARDIAN_REPORT_VERSION,
  FactGuardianClassificationSchema,
  FactGuardianReasonCodeSchema,
  FactGuardianReportSchema,
  type FactGuardianFinding,
  type FactGuardianPass,
  type FactGuardianReport,
} from "../../domain/resume/FactGuardian";
import {
  GeneratedResumeDocumentSchema,
  type GeneratedResumeDocument,
  type GeneratedResumeEntry,
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

const GeneratedPathSchema = z.string().trim().min(1).max(300);
const RawFindingSchema = z.object({
  generatedPath: GeneratedPathSchema.nullable(),
  classification: FactGuardianClassificationSchema,
  sourceOrdinals: z.array(z.number().int().min(1).max(100)).max(100),
  reasonCode: FactGuardianReasonCodeSchema,
}).strict();
const RawGuardianEnvelopeSchema = z.object({
  reviewedPaths: z.array(GeneratedPathSchema).max(500),
  reviewedSourceOrdinals: z.array(z.number().int().min(1).max(100)).max(100),
  findings: z.array(RawFindingSchema).max(600),
}).strict();
type RawGuardianEnvelope = z.infer<typeof RawGuardianEnvelopeSchema>;

const stringArray = { type: "array", items: { type: "string" } } as const;
const integerArray = { type: "array", items: { type: "integer" } } as const;
function objectSchema(properties: Record<string, unknown>) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  };
}
const findingSchema = objectSchema({
  generatedPath: { type: ["string", "null"] },
  classification: { type: "string", enum: FactGuardianClassificationSchema.options },
  sourceOrdinals: integerArray,
  reasonCode: { type: "string", enum: FactGuardianReasonCodeSchema.options },
});
export const RESUME_FACT_GUARD_SCHEMA: Readonly<Record<string, unknown>> = objectSchema({
  reviewedPaths: stringArray,
  reviewedSourceOrdinals: integerArray,
  findings: { type: "array", items: findingSchema },
});

const HARMFUL = new Set([
  "POSSIBLE_NEW_CLAIM",
  "UNSUPPORTED_NEW_CLAIM",
  "SOURCE_CONFLICT",
] as const);
const CLASSIFICATION_RISK: Readonly<Record<z.infer<typeof FactGuardianClassificationSchema>, number>> = {
  SOURCE_PRESERVED: 0,
  SAFE_REPHRASE: 0,
  SAFE_RESTRUCTURE: 0,
  SOURCE_OMISSION: 0,
  POSSIBLE_NEW_CLAIM: 1,
  UNSUPPORTED_NEW_CLAIM: 2,
  SOURCE_CONFLICT: 3,
};

type GeneratedUnitDescriptor = Readonly<{
  path: string;
  unit: GeneratedResumeTextUnit;
}>;
type SourceFact = Readonly<{
  text: string;
  sourceRefs: readonly ResumeSourceRef[];
}>;
type NormalizedGuardianEnvelope = Readonly<{
  reviewedPaths: readonly string[];
  reviewedSourceOrdinals: readonly number[];
  findings: readonly z.infer<typeof RawFindingSchema>[];
}>;

type GuardianPassOutcome =
  | Readonly<{
      ok: true;
      pass: FactGuardianPass;
      harmfulPaths: readonly string[];
      attempts: readonly AIProviderAttemptReceipt[];
    }>
  | Readonly<{
      ok: false;
      failureCode:
        | AIExecutionFailureCode
        | "FACT_GUARD_OUTPUT_INVALID"
        | "AI_ECONOMICS_POLICY_FAILED";
      attempts: readonly AIProviderAttemptReceipt[];
    }>;

export type FactGuardianSuccess = Readonly<{
  ok: true;
  document: GeneratedResumeDocument;
  report: FactGuardianReport;
  attempts: readonly AIProviderAttemptReceipt[];
}>;
export type FactGuardianFailure = Readonly<{
  ok: false;
  failureCode:
    | AIExecutionFailureCode
    | "FACT_GUARD_OUTPUT_INVALID"
    | "FACT_GUARD_REJECTED"
    | "AI_ECONOMICS_POLICY_FAILED";
  report: FactGuardianReport | null;
  attempts: readonly AIProviderAttemptReceipt[];
}>;
export type FactGuardianOutcome = FactGuardianSuccess | FactGuardianFailure;
export type FactGuardianConfig = AIGatewayRuntimeConfig &
  Readonly<{
    credentialMode: CredentialMode;
    nowIso?: () => string;
  }>;

function sha256(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
function sortedUniqueNumbers(values: readonly number[]) {
  return [...new Set(values)].sort((a, b) => a - b);
}
function sortedUniqueStrings(values: readonly string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function collectGeneratedUnits(document: GeneratedResumeDocument): GeneratedUnitDescriptor[] {
  const units: GeneratedUnitDescriptor[] = [];
  const add = (path: string, unit: GeneratedResumeTextUnit | null) => {
    if (unit) units.push({ path, unit });
  };
  if (document.header) {
    add("header.displayName", document.header.displayName);
    add("header.headline", document.header.headline);
    document.header.contactLines.forEach((unit, index) =>
      add(`header.contactLines[${index}]`, unit),
    );
  }
  add("summary", document.summary);

  const collectEntry = (prefix: string, entry: GeneratedResumeEntry) => {
    add(`${prefix}.title`, entry.title);
    add(`${prefix}.subtitle`, entry.subtitle);
    entry.metaLines.forEach((unit, index) => add(`${prefix}.metaLines[${index}]`, unit));
    add(`${prefix}.summary`, entry.summary);
    entry.bullets.forEach((unit, index) => add(`${prefix}.bullets[${index}]`, unit));
  };
  document.experience.forEach((entry, index) => collectEntry(`experience[${index}]`, entry));
  document.projects.forEach((entry, index) => collectEntry(`projects[${index}]`, entry));
  document.education.forEach((entry, index) => collectEntry(`education[${index}]`, entry));
  document.certifications.forEach((entry, index) =>
    collectEntry(`certifications[${index}]`, entry),
  );

  const collectGroup = (prefix: string, group: GeneratedResumeListGroup) => {
    group.items.forEach((unit, index) => add(`${prefix}.items[${index}]`, unit));
  };
  document.skillGroups.forEach((group, index) => collectGroup(`skillGroups[${index}]`, group));
  document.languageGroups.forEach((group, index) =>
    collectGroup(`languageGroups[${index}]`, group),
  );
  document.otherGroups.forEach((group, index) => collectGroup(`otherGroups[${index}]`, group));
  return units;
}

/**
 * Only text that is actually rendered can satisfy factual source coverage.
 * Entity/container sourceRefs are provenance metadata and must never hide a
 * candidate-authored fact that disappeared from the generated resume.
 */
function collectRenderedSourceOrdinals(document: GeneratedResumeDocument) {
  const values = collectGeneratedUnits(document).flatMap(({ unit }) =>
    unit.sourceRefs.map((ref) => ref.ordinal),
  );
  return new Set(values);
}

function collectSourceFacts(document: CandidateResumeDocument) {
  const facts: SourceFact[] = [];
  const seen = new Set<string>();
  const add = (unit: SourceBackedText | null) => {
    if (!unit) return;
    const key = `${unit.value}\n${sortedUniqueNumbers(
      unit.sourceRefs.map((ref) => ref.ordinal),
    ).join(",")}`;
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({ text: unit.value, sourceRefs: unit.sourceRefs });
  };

  if (document.identity) {
    add(document.identity.displayName);
    add(document.identity.headline);
    add(document.identity.location);
    add(document.identity.email);
    add(document.identity.phone);
    document.identity.links.forEach(add);
  }
  add(document.profile);
  document.employment.forEach((item) => {
    add(item.role);
    add(item.organization);
    add(item.startDateText);
    add(item.endDateText);
    add(item.location);
    add(item.summary);
    item.bullets.forEach(add);
    item.technologies.forEach(add);
  });
  document.projects.forEach((item) => {
    add(item.name);
    add(item.subtitle);
    add(item.url);
    add(item.summary);
    item.bullets.forEach(add);
    item.technologies.forEach(add);
  });
  document.education.forEach((item) => {
    add(item.institution);
    add(item.degree);
    add(item.field);
    add(item.startDateText);
    add(item.endDateText);
    add(item.location);
    item.notes.forEach(add);
  });
  document.certifications.forEach((item) => {
    add(item.name);
    add(item.issuer);
    add(item.dateText);
    add(item.credentialId);
    add(item.url);
  });
  document.skillGroups.forEach((item) => {
    add(item.label);
    item.skills.forEach(add);
  });
  document.languages.forEach((item) => {
    add(item.language);
    add(item.proficiency);
  });
  document.otherSections.forEach((item) => {
    add(item.heading);
    item.items.forEach(add);
  });
  return facts;
}

function actualOmittedOrdinals(source: CandidateResumeDocument, draft: GeneratedResumeDocument) {
  const rendered = collectRenderedSourceOrdinals(draft);
  const nonFactual = new Set(source.unassignedSourceOrdinals);
  return sortedUniqueNumbers(
    source.provenanceIndex
      .map((ref) => ref.ordinal)
      .filter((ordinal) => !rendered.has(ordinal) && !nonFactual.has(ordinal)),
  );
}

function buildGuardianPrompt(source: CandidateResumeDocument, draft: GeneratedResumeDocument) {
  const sourceFacts = collectSourceFacts(source).map((fact) => ({
    text: fact.text,
    sourceOrdinals: sortedUniqueNumbers(fact.sourceRefs.map((ref) => ref.ordinal)),
  }));
  const generatedUnits = collectGeneratedUnits(draft).map(({ path, unit }) => ({
    path,
    text: unit.text,
    sourceOrdinals: sortedUniqueNumbers(unit.sourceRefs.map((ref) => ref.ordinal)),
  }));
  return [
    "Audit every generated factual text unit against the candidate-authoritative source facts.",
    "Classify meaning preservation, not writing style. Candidate assertions do not require external verification.",
    "Job requirements are never candidate facts. Unsupported additions, stronger metrics, changed dates/roles/skills, or contradictions are unsafe.",
    "Return one non-omission finding for each generated path you can audit. CV Engine derives final path/source coverage server-side; never invent paths or source ordinals.",
    "SOURCE FACTS:",
    JSON.stringify(sourceFacts),
    "GENERATED UNITS:",
    JSON.stringify(generatedUnits),
    "EXPECTED OMITTED SOURCE ORDINALS (server-derived):",
    JSON.stringify(actualOmittedOrdinals(source, draft)),
  ].join("\n\n");
}

function guardianShapeValidator(value: unknown) {
  RawGuardianEnvelopeSchema.parse(value);
}

/**
 * AI judges semantic meaning; CV Engine owns coverage and provenance.
 * Missing/invalid AI coverage never becomes an implicit PASS. Instead, every
 * unclassified generated path is conservatively marked POSSIBLE_NEW_CLAIM,
 * which forces exact-source repair and a bounded second Guardian pass.
 */
function normalizeGuardianEnvelope(
  source: CandidateResumeDocument,
  draft: GeneratedResumeDocument,
  raw: RawGuardianEnvelope,
): NormalizedGuardianEnvelope {
  const units = collectGeneratedUnits(draft);
  const unitsByPath = new Map(units.map((item) => [item.path, item.unit] as const));
  const expectedPaths = units.map((item) => item.path);
  const expectedSourceOrdinals = sortedUniqueNumbers(
    source.provenanceIndex.map((ref) => ref.ordinal),
  );
  const byPath = new Map<string, z.infer<typeof RawFindingSchema>>();

  for (const finding of raw.findings) {
    if (finding.classification === "SOURCE_OMISSION") continue;
    const path = finding.generatedPath;
    if (!path) continue;
    const unit = unitsByPath.get(path);
    if (!unit) continue;

    const normalized: z.infer<typeof RawFindingSchema> = {
      generatedPath: path,
      classification: finding.classification,
      sourceOrdinals: sortedUniqueNumbers(unit.sourceRefs.map((ref) => ref.ordinal)),
      reasonCode: finding.reasonCode,
    };
    const previous = byPath.get(path);
    if (!previous || CLASSIFICATION_RISK[normalized.classification] > CLASSIFICATION_RISK[previous.classification]) {
      byPath.set(path, normalized);
    }
  }

  for (const { path, unit } of units) {
    if (byPath.has(path)) continue;
    byPath.set(path, {
      generatedPath: path,
      classification: "POSSIBLE_NEW_CLAIM",
      sourceOrdinals: sortedUniqueNumbers(unit.sourceRefs.map((ref) => ref.ordinal)),
      reasonCode: "SUPPORT_AMBIGUOUS",
    });
  }

  const findings = expectedPaths.map((path) => byPath.get(path)!);
  for (const ordinal of actualOmittedOrdinals(source, draft)) {
    findings.push({
      generatedPath: null,
      classification: "SOURCE_OMISSION",
      sourceOrdinals: [ordinal],
      reasonCode: "SOURCE_NOT_RENDERED",
    });
  }

  return {
    reviewedPaths: sortedUniqueStrings(expectedPaths),
    reviewedSourceOrdinals: expectedSourceOrdinals,
    findings,
  };
}

function providerProvenance(value: AIExecutionProvenance) {
  return {
    provider: value.provider,
    model: value.model,
    requestId: value.requestId,
    contractVersion: value.contractVersion,
    attempt: value.attempt,
    fallbackUsed: value.fallbackUsed,
    credentialMode: value.credentialMode,
  } as const;
}

async function runGuardianPass(
  source: CandidateResumeDocument,
  draft: GeneratedResumeDocument,
  passNumber: 1 | 2,
  config: FactGuardianConfig,
): Promise<GuardianPassOutcome> {
  const capability = "RESUME_FACT_GUARD" as const;
  const budget = getAIExecutionBudget(capability, config.budgetOverrides ?? {});
  try {
    assertProviderEconomicsWithinPolicy(
      capability,
      buildProviderAttemptPlan(capability, config.credentialMode),
      budget,
    );
  } catch {
    return { ok: false, failureCode: "AI_ECONOMICS_POLICY_FAILED", attempts: [] };
  }

  const outcome = await executeAICapability(
    {
      capability,
      credentialMode: config.credentialMode,
      prompt: buildGuardianPrompt(source, draft),
      systemInstruction:
        "You are CV Engine's independent Fact Guardian. The Editor has no authority to approve its own output. Compare generated meaning to candidate-authoritative source only, classify factual units, and return structured findings without rewriting the resume.",
      responseJsonSchema: RESUME_FACT_GUARD_SCHEMA,
      structuredOutputValidator: guardianShapeValidator,
    },
    config,
  );
  if (!outcome.ok) {
    return { ok: false, failureCode: outcome.failureCode, attempts: outcome.attempts };
  }

  let normalized: NormalizedGuardianEnvelope;
  try {
    const raw = RawGuardianEnvelopeSchema.parse(JSON.parse(outcome.proposal.text));
    normalized = normalizeGuardianEnvelope(source, draft, raw);
  } catch {
    return {
      ok: false,
      failureCode: "FACT_GUARD_OUTPUT_INVALID",
      attempts: outcome.attempts,
    };
  }

  const unitsByPath = new Map(collectGeneratedUnits(draft).map((unit) => [unit.path, unit] as const));
  const findings: FactGuardianFinding[] = normalized.findings.map((finding) => ({
    generatedPath: finding.generatedPath,
    generatedTextSha256: finding.generatedPath
      ? sha256(unitsByPath.get(finding.generatedPath)!.unit.text)
      : null,
    classification: finding.classification,
    sourceOrdinals: sortedUniqueNumbers(finding.sourceOrdinals),
    reasonCode: finding.reasonCode,
  }));
  const harmfulPaths = findings
    .filter(
      (finding) =>
        finding.generatedPath !== null &&
        HARMFUL.has(
          finding.classification as
            | "POSSIBLE_NEW_CLAIM"
            | "UNSUPPORTED_NEW_CLAIM"
            | "SOURCE_CONFLICT",
        ),
    )
    .map((finding) => finding.generatedPath!);

  const pass: FactGuardianPass = {
    passNumber,
    providerProvenance: providerProvenance(outcome.provenance),
    reviewedPaths: [...normalized.reviewedPaths],
    reviewedSourceOrdinals: [...normalized.reviewedSourceOrdinals],
    findings,
  };
  return {
    ok: true,
    pass,
    harmfulPaths: sortedUniqueStrings(harmfulPaths),
    attempts: outcome.attempts,
  };
}

function sourceReplacement(
  unit: GeneratedResumeTextUnit,
  facts: readonly SourceFact[],
): GeneratedResumeTextUnit | null {
  const requested = new Set(unit.sourceRefs.map((ref) => ref.ordinal));
  const candidates = facts
    .map((fact) => {
      const factOrdinals = new Set(fact.sourceRefs.map((ref) => ref.ordinal));
      const overlap = [...requested].filter((ordinal) => factOrdinals.has(ordinal)).length;
      return { fact, overlap, width: factOrdinals.size };
    })
    .filter((candidate) => candidate.overlap > 0)
    .sort(
      (a, b) =>
        b.overlap - a.overlap ||
        a.width - b.width ||
        a.fact.text.localeCompare(b.fact.text),
    );
  const selected = candidates[0]?.fact;
  return selected ? { text: selected.text, sourceRefs: [...selected.sourceRefs] } : null;
}

function repairDraft(
  source: CandidateResumeDocument,
  draft: GeneratedResumeDocument,
  harmfulPaths: readonly string[],
) {
  const harmful = new Set(harmfulPaths);
  const facts = collectSourceFacts(source);
  const repairNullable = (path: string, unit: GeneratedResumeTextUnit | null) => {
    if (!unit || !harmful.has(path)) return unit;
    return sourceReplacement(unit, facts);
  };
  const repairArray = (prefix: string, units: readonly GeneratedResumeTextUnit[]) =>
    units
      .map((unit, index) => repairNullable(`${prefix}[${index}]`, unit))
      .filter((unit): unit is GeneratedResumeTextUnit => unit !== null);
  const repairEntry = (prefix: string, entry: GeneratedResumeEntry): GeneratedResumeEntry => ({
    ...entry,
    title: repairNullable(`${prefix}.title`, entry.title),
    subtitle: repairNullable(`${prefix}.subtitle`, entry.subtitle),
    metaLines: repairArray(`${prefix}.metaLines`, entry.metaLines),
    summary: repairNullable(`${prefix}.summary`, entry.summary),
    bullets: repairArray(`${prefix}.bullets`, entry.bullets),
  });
  const repairGroup = (
    prefix: string,
    group: GeneratedResumeListGroup,
  ): GeneratedResumeListGroup => ({
    ...group,
    items: repairArray(`${prefix}.items`, group.items),
  });

  return GeneratedResumeDocumentSchema.parse({
    ...draft,
    editorStatus: "PARTIAL_RECOVERY",
    header: draft.header
      ? {
          ...draft.header,
          displayName: repairNullable("header.displayName", draft.header.displayName),
          headline: repairNullable("header.headline", draft.header.headline),
          contactLines: repairArray("header.contactLines", draft.header.contactLines),
        }
      : null,
    summary: repairNullable("summary", draft.summary),
    experience: draft.experience.map((entry, index) =>
      repairEntry(`experience[${index}]`, entry),
    ),
    projects: draft.projects.map((entry, index) => repairEntry(`projects[${index}]`, entry)),
    education: draft.education.map((entry, index) =>
      repairEntry(`education[${index}]`, entry),
    ),
    certifications: draft.certifications.map((entry, index) =>
      repairEntry(`certifications[${index}]`, entry),
    ),
    skillGroups: draft.skillGroups.map((group, index) =>
      repairGroup(`skillGroups[${index}]`, group),
    ),
    languageGroups: draft.languageGroups.map((group, index) =>
      repairGroup(`languageGroups[${index}]`, group),
    ),
    otherGroups: draft.otherGroups.map((group, index) =>
      repairGroup(`otherGroups[${index}]`, group),
    ),
  });
}

export async function guardAndRepairResume(
  source: CandidateResumeDocument,
  draft: GeneratedResumeDocument,
  config: FactGuardianConfig,
): Promise<FactGuardianOutcome> {
  const nowIso = config.nowIso ?? (() => new Date().toISOString());
  const first = await runGuardianPass(source, draft, 1, config);
  if (!first.ok) {
    return {
      ok: false,
      failureCode: first.failureCode,
      report: null,
      attempts: first.attempts,
    };
  }

  if (first.harmfulPaths.length === 0) {
    const report = FactGuardianReportSchema.parse({
      schemaVersion: FACT_GUARDIAN_REPORT_VERSION,
      decision: "PASS",
      passes: [first.pass],
      repairedPaths: [],
      createdAt: nowIso(),
    });
    return { ok: true, document: draft, report, attempts: first.attempts };
  }

  const repaired = repairDraft(source, draft, first.harmfulPaths);
  const second = await runGuardianPass(source, repaired, 2, config);
  if (!second.ok) {
    const report = FactGuardianReportSchema.parse({
      schemaVersion: FACT_GUARDIAN_REPORT_VERSION,
      decision: "REJECTED",
      passes: [first.pass],
      repairedPaths: first.harmfulPaths,
      createdAt: nowIso(),
    });
    return {
      ok: false,
      failureCode: second.failureCode,
      report,
      attempts: [...first.attempts, ...second.attempts],
    };
  }

  if (second.harmfulPaths.length > 0) {
    const report = FactGuardianReportSchema.parse({
      schemaVersion: FACT_GUARDIAN_REPORT_VERSION,
      decision: "REJECTED",
      passes: [first.pass, second.pass],
      repairedPaths: first.harmfulPaths,
      createdAt: nowIso(),
    });
    return {
      ok: false,
      failureCode: "FACT_GUARD_REJECTED",
      report,
      attempts: [...first.attempts, ...second.attempts],
    };
  }

  const report = FactGuardianReportSchema.parse({
    schemaVersion: FACT_GUARDIAN_REPORT_VERSION,
    decision: "REPAIRED_PASS",
    passes: [first.pass, second.pass],
    repairedPaths: first.harmfulPaths,
    createdAt: nowIso(),
  });
  return {
    ok: true,
    document: repaired,
    report,
    attempts: [...first.attempts, ...second.attempts],
  };
}
