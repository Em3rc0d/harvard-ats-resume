import type { ResumeRequest } from '../../schemas';

export const PRODUCT_EVALUATION_VERSION = 'ats2-product-evaluation-v2' as const;

export type ProductCheckStatus = 'PASS' | 'WARN' | 'INFO';

export interface ProductEvaluationCheck {
  readonly id: string;
  readonly label: string;
  readonly status: ProductCheckStatus;
  readonly detail: string;
  readonly weight: number;
}

export interface ProductMetricEvaluation {
  readonly score: number;
  readonly version: typeof PRODUCT_EVALUATION_VERSION;
  readonly scope: string;
  readonly checks: readonly ProductEvaluationCheck[];
}

export interface ProductEvaluation {
  readonly resumeQuality: ProductMetricEvaluation;
  readonly atsParseability: ProductMetricEvaluation;
}

interface WeightedCheckInput {
  readonly id: string;
  readonly label: string;
  readonly passed: boolean;
  readonly detailPass: string;
  readonly detailWarn: string;
  readonly weight: number;
}

function weightedCheck(input: WeightedCheckInput): ProductEvaluationCheck {
  return {
    id: input.id,
    label: input.label,
    status: input.passed ? 'PASS' : 'WARN',
    detail: input.passed ? input.detailPass : input.detailWarn,
    weight: input.weight,
  };
}

function infoCheck(id: string, label: string, detail: string): ProductEvaluationCheck {
  return { id, label, status: 'INFO', detail, weight: 0 };
}

function score(checks: readonly ProductEvaluationCheck[]): number {
  const weighted = checks.filter((check) => check.weight > 0);
  const totalWeight = weighted.reduce((sum, check) => sum + check.weight, 0);
  if (totalWeight === 0) return 0;
  const earned = weighted
    .filter((check) => check.status === 'PASS')
    .reduce((sum, check) => sum + check.weight, 0);
  return Math.round((earned / totalWeight) * 100);
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value: string): string[] {
  return value
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}+#./-]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function semanticUnits(value: string): string[] {
  return value
    .replace(/\r\n/g, '\n')
    .split(/\n+|[.!?]+\s+/u)
    .map((unit) => unit.replace(/^[•*\-–—]\s*/, '').trim())
    .filter(Boolean);
}

function candidateSemanticUnits(data: ResumeRequest): string[] {
  return [
    ...semanticUnits(data.summary),
    ...data.experience.flatMap((item) => semanticUnits(item.description)),
    ...(data.projects ?? []).flatMap((item) => semanticUnits(item.description)),
  ];
}

function hasSubstantiveEvidence(data: ResumeRequest): boolean {
  const descriptions = [
    ...data.experience.map((item) => item.description),
    ...(data.projects ?? []).map((item) => item.description),
  ].filter((value) => value.trim().length > 0);

  if (descriptions.length === 0) return false;
  return descriptions.some((description) => words(description).length >= 6);
}

function evaluateResumeQuality(data: ResumeRequest): ProductMetricEvaluation {
  const allSkills = [...data.skills.hardSkills, ...data.skills.softSkills]
    .map(normalize)
    .filter(Boolean);
  const uniqueSkills = new Set(allSkills);
  const units = candidateSemanticUnits(data);
  const denseUnits = units.filter((unit) => words(unit).length > 60);
  const summaryWords = words(data.summary).length;
  const hasSummary = summaryWords >= 8 && summaryWords <= 180;
  const representedDomains = [
    data.experience.length > 0,
    (data.projects?.length ?? 0) > 0,
    data.education.length > 0,
    (data.certifications?.length ?? 0) > 0,
    (data.languages?.length ?? 0) > 0,
  ].filter(Boolean).length;

  const checks: ProductEvaluationCheck[] = [
    weightedCheck({
      id: 'quality-summary',
      label: 'Professional summary',
      passed: hasSummary,
      detailPass: 'The summary contains enough grounded context to orient a reviewer without becoming a long-form biography.',
      detailWarn: data.summary.trim()
        ? 'The summary is unusually brief or long. Review it for concise, evidence-backed positioning.'
        : 'No professional summary is present. Add one only from facts already represented in Career Evidence.',
      weight: 15,
    }),
    weightedCheck({
      id: 'quality-substantive-evidence',
      label: 'Substantive evidence statements',
      passed: hasSubstantiveEvidence(data),
      detailPass: 'At least one experience or project statement communicates substantive work rather than only a title or technology list.',
      detailWarn: 'Experience and project evidence is too thin to communicate what work was actually performed.',
      weight: 30,
    }),
    weightedCheck({
      id: 'quality-skills',
      label: 'Focused skills inventory',
      passed: data.skills.hardSkills.length >= 2 && uniqueSkills.size === allSkills.length,
      detailPass: 'Technical skills are explicit and do not contain normalized duplicates.',
      detailWarn: 'Add at least two real technical skills and remove normalized duplicate labels if present.',
      weight: 15,
    }),
    weightedCheck({
      id: 'quality-evidence-coverage',
      label: 'Career evidence coverage',
      passed: representedDomains >= 2,
      detailPass: 'The resume is supported by more than one career-evidence domain such as experience, projects, education, certifications, or languages.',
      detailWarn: 'The current resume has a narrow evidence surface. Add another career-evidence domain only when it is true and relevant.',
      weight: 15,
    }),
    weightedCheck({
      id: 'quality-semantic-density',
      label: 'Scannable semantic units',
      passed: denseUnits.length === 0,
      detailPass: 'Summary, experience, and project statements are broken into reasonably scannable semantic units.',
      detailWarn: `${denseUnits.length} statement(s) exceed 60 words. Review the statement boundaries rather than relying on visual line wrapping.`,
      weight: 25,
    }),
    infoCheck(
      'quality-action-language-boundary',
      'Language-neutral evaluation',
      'CV Engine does not score a resume by matching the first word of a sentence against a hardcoded language-specific action-verb list.',
    ),
    infoCheck(
      'quality-metrics-truth-boundary',
      'Verified outcomes only',
      'Numeric achievements are not required for a good score. Add metrics only when they are true and supportable; CV Engine never recommends inventing them.',
    ),
  ];

  return {
    score: score(checks),
    version: PRODUCT_EVALUATION_VERSION,
    scope: 'Deterministic resume-content quality checks over semantic evidence units. This is not a recruiter acceptance probability.',
    checks,
  };
}

const STANDARD_HEADING_GROUPS: readonly (readonly string[])[] = [
  ['professional summary', 'summary', 'resumen profesional', 'resumen', 'profil professionnel', 'profil', 'resumo profissional', 'resumo'],
  ['experience', 'work experience', 'experiencia', 'experiencia laboral', 'experience professionnelle', 'experiencia profissional'],
  ['education', 'educacion', 'formacion', 'formation', 'educacao', 'formacao'],
  ['skills', 'technical skills', 'habilidades', 'habilidades tecnicas', 'competences', 'competences techniques'],
];

function hasHeading(lines: readonly string[], aliases: readonly string[]): boolean {
  const normalizedLines = lines.map((line) => normalize(line.replace(/[:：]$/, '')));
  return aliases.some((alias) => normalizedLines.includes(normalize(alias)));
}

function hasAmbiguousClaimSerialization(formattedResume: string): boolean {
  if (formattedResume.includes('\\n')) return true;

  return formattedResume
    .split(/\r?\n/)
    .some((line) => (line.match(/[•]/g) ?? []).length > 1);
}

function evaluateAtsParseability(data: ResumeRequest, formattedResume: string): ProductMetricEvaluation {
  const lines = formattedResume.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const unusualTableSyntax = /\t|[┌┐└┘├┤┬┴┼]|\|.*\|/.test(formattedResume);
  const headingMatches = STANDARD_HEADING_GROUPS.filter((group) => hasHeading(lines, group)).length;
  const emailVisible = normalize(formattedResume).includes(normalize(data.personalInfo.email));
  const identityVisible = normalize(formattedResume).includes(normalize(data.personalInfo.fullName));
  const ambiguousSerialization = hasAmbiguousClaimSerialization(formattedResume);

  const checks: ProductEvaluationCheck[] = [
    weightedCheck({
      id: 'parse-text',
      label: 'Machine-readable text',
      passed: formattedResume.trim().length > 0,
      detailPass: 'The generated artifact is plain text and directly extractable.',
      detailWarn: 'No extractable resume text was produced.',
      weight: 20,
    }),
    weightedCheck({
      id: 'parse-identity',
      label: 'Candidate identity',
      passed: identityVisible && emailVisible,
      detailPass: 'Candidate name and email are detectable in the rendered text.',
      detailWarn: 'Candidate name or email could not be detected in the rendered text.',
      weight: 15,
    }),
    weightedCheck({
      id: 'parse-headings',
      label: 'Standard section headings',
      passed: headingMatches >= 3,
      detailPass: `${headingMatches} core section heading groups are recognizable.`,
      detailWarn: `Only ${headingMatches} core section heading group(s) are recognizable; standard headings improve structural parsing.`,
      weight: 35,
    }),
    weightedCheck({
      id: 'parse-layout',
      label: 'Linear reading flow',
      passed: !unusualTableSyntax,
      detailPass: 'No table-like or box-drawing syntax was detected in the text artifact.',
      detailWarn: 'Table-like or box-drawing syntax may create an ambiguous machine reading order.',
      weight: 20,
    }),
    weightedCheck({
      id: 'parse-claim-separation',
      label: 'Claim separation',
      passed: !ambiguousSerialization,
      detailPass: 'Material claims use actual section/claim boundaries rather than escaped newlines or multiple bullets compressed into one serialized line.',
      detailWarn: 'Some material claims are serialized ambiguously. Use real line/claim boundaries instead of escaped newlines or compressed bullets.',
      weight: 10,
    }),
    infoCheck(
      'parse-wrap-boundary',
      'Visual wrapping boundary',
      'CV Engine does not penalize a paragraph merely because its plain-text serialization is long; visual wrapping and semantic structure are different concerns.',
    ),
    infoCheck(
      'parse-scope-boundary',
      'Scope boundary',
      'This estimates structural machine readability only. It does not predict a score from Workday, Greenhouse, Lever, or another commercial ATS.',
    ),
  ];

  return {
    score: score(checks),
    version: PRODUCT_EVALUATION_VERSION,
    scope: 'Deterministic structural parseability checks over headings, identity, linear flow, and claim serialization.',
    checks,
  };
}

export function evaluateProductResume(data: ResumeRequest, formattedResume: string): ProductEvaluation {
  return {
    resumeQuality: evaluateResumeQuality(data),
    atsParseability: evaluateAtsParseability(data, formattedResume),
  };
}
