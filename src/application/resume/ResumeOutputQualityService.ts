import { CandidateResumeDocumentSchema, type CandidateResumeDocument, type SourceBackedText } from "../../domain/resume/CandidateResumeDocument";
import { GeneratedResumeDocumentSchema, type GeneratedResumeDocument, type GeneratedResumeTextUnit } from "../../domain/resume/GeneratedResumeDocument";

export const V12_MATERIAL_CHANGE_RATIO_MIN = 0.30;
export const V12_NEAR_COPY_SIMILARITY_MAX = 0.86;
export const V12_SUMMARY_PRESERVATION_RATIO_MIN = 0.58;

export type ResumeOutputQualityAssessment = Readonly<{
  localeConsistent: boolean;
  summaryPositioningPreserved: boolean;
  materialImprovementPresent: boolean;
  materialChangeRatio: number;
  eligibleNarrativeUnits: number;
  materiallyChangedNarrativeUnits: number;
  nearCopyNarrativeUnits: number;
  summaryLengthRatio: number | null;
  passed: boolean;
}>;

function normalizedLocale(locale: string) {
  return locale.trim().toLowerCase().replace("_", "-").split("-")[0] ?? "";
}

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return new Set(normalizeText(value).split(" ").filter((token) => token.length > 1));
}

function jaccard(left: string, right: string) {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function sourceFacts(document: CandidateResumeDocument) {
  const facts: SourceBackedText[] = [];
  const add = (unit: SourceBackedText | null) => { if (unit) facts.push(unit); };
  add(document.profile);
  document.employment.forEach((entry) => {
    add(entry.summary);
    entry.bullets.forEach(add);
  });
  document.projects.forEach((entry) => {
    add(entry.summary);
    entry.bullets.forEach(add);
  });
  document.education.forEach((entry) => entry.notes.forEach(add));
  document.otherSections.forEach((section) => section.items.forEach(add));
  return facts;
}

function generatedNarrative(document: GeneratedResumeDocument) {
  const units: GeneratedResumeTextUnit[] = [];
  const add = (unit: GeneratedResumeTextUnit | null) => { if (unit) units.push(unit); };
  add(document.summary);
  document.experience.forEach((entry) => {
    add(entry.summary);
    entry.bullets.forEach(add);
  });
  document.projects.forEach((entry) => {
    add(entry.summary);
    entry.bullets.forEach(add);
  });
  document.education.forEach((entry) => entry.bullets.forEach(add));
  document.otherGroups.forEach((group) => group.items.forEach(add));
  return units;
}

function maxSourceSimilarity(unit: GeneratedResumeTextUnit, facts: readonly SourceBackedText[]) {
  const ordinals = new Set(unit.sourceRefs.map((ref) => ref.ordinal));
  const supported = facts.filter((fact) => fact.sourceRefs.some((ref) => ordinals.has(ref.ordinal)));
  if (supported.length === 0) return 1;
  return Math.max(...supported.map((fact) => jaccard(unit.text, fact.value)));
}

export function assessResumeOutputQuality(
  sourceInput: CandidateResumeDocument,
  generatedInput: GeneratedResumeDocument,
): ResumeOutputQualityAssessment {
  const source = CandidateResumeDocumentSchema.parse(sourceInput);
  const generated = GeneratedResumeDocumentSchema.parse(generatedInput);
  const localeConsistent = normalizedLocale(source.locale) === normalizedLocale(generated.locale);

  const sourceProfile = source.profile?.value.trim() ?? "";
  const generatedSummary = generated.summary?.text.trim() ?? "";
  const summaryLengthRatio = sourceProfile.length > 0
    ? generatedSummary.length / sourceProfile.length
    : null;
  const summaryPositioningPreserved = sourceProfile.length === 0
    ? true
    : generatedSummary.length > 0 && (
      sourceProfile.length < 240 ||
      (summaryLengthRatio ?? 0) >= V12_SUMMARY_PRESERVATION_RATIO_MIN
    );

  const facts = sourceFacts(source);
  const narrative = generatedNarrative(generated).filter((unit) => tokens(unit.text).size >= 6);
  let materiallyChangedNarrativeUnits = 0;
  let nearCopyNarrativeUnits = 0;
  for (const unit of narrative) {
    const similarity = maxSourceSimilarity(unit, facts);
    if (similarity >= V12_NEAR_COPY_SIMILARITY_MAX) nearCopyNarrativeUnits += 1;
    else materiallyChangedNarrativeUnits += 1;
  }
  const materialChangeRatio = narrative.length > 0
    ? materiallyChangedNarrativeUnits / narrative.length
    : 0;
  const materialImprovementPresent = narrative.length > 0 && materialChangeRatio >= V12_MATERIAL_CHANGE_RATIO_MIN;
  const passed = localeConsistent && summaryPositioningPreserved && materialImprovementPresent;

  return {
    localeConsistent,
    summaryPositioningPreserved,
    materialImprovementPresent,
    materialChangeRatio,
    eligibleNarrativeUnits: narrative.length,
    materiallyChangedNarrativeUnits,
    nearCopyNarrativeUnits,
    summaryLengthRatio,
    passed,
  };
}

export function resumeOutputQualityRank(assessment: ResumeOutputQualityAssessment) {
  return (
    (assessment.localeConsistent ? 4 : 0) +
    (assessment.summaryPositioningPreserved ? 4 : 0) +
    (assessment.materialImprovementPresent ? 6 : 0) +
    Math.min(assessment.materialChangeRatio, 1)
  );
}

/**
 * Prevents a concise editor response from deleting a candidate-authored positioning
 * statement. This is a conservative, source-only repair performed before Fact Guardian.
 */
export function preserveCriticalSourcePresentation(
  sourceInput: CandidateResumeDocument,
  generatedInput: GeneratedResumeDocument,
): GeneratedResumeDocument {
  const source = CandidateResumeDocumentSchema.parse(sourceInput);
  const generated = GeneratedResumeDocumentSchema.parse(generatedInput);
  const assessment = assessResumeOutputQuality(source, generated);
  const sourceProfile = source.profile;

  return GeneratedResumeDocumentSchema.parse({
    ...generated,
    locale: source.locale,
    summary: !assessment.summaryPositioningPreserved && sourceProfile
      ? { text: sourceProfile.value, sourceRefs: [...sourceProfile.sourceRefs] }
      : generated.summary,
  });
}
