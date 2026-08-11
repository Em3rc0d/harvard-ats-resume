import type { ResumeRequest } from '../../schemas';

export const PRODUCT_EVALUATION_VERSION = 'ats2-product-evaluation-v1' as const;

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

const ACTION_VERBS = [
  'built', 'developed', 'implemented', 'designed', 'architected', 'created', 'delivered',
  'led', 'managed', 'improved', 'reduced', 'increased', 'automated', 'maintained', 'supported',
  'construi', 'desarrolle', 'implemente', 'disene', 'arquitecte', 'cree', 'entregue', 'lidere',
  'gestione', 'mejore', 'reduje', 'aumente', 'automaticé', 'mantuv', 'apoye',
];

function beginsWithActionVerb(value: string): boolean {
  const firstToken = normalize(value).split(/[^a-z0-9]+/)[0] ?? '';
  return ACTION_VERBS.some((verb) => firstToken.startsWith(verb));
}

function evaluateResumeQuality(data: ResumeRequest, formattedResume: string): ProductMetricEvaluation {
  const experienceDescriptions = data.experience.map((item) => item.description.trim()).filter(Boolean);
  const actionCount = experienceDescriptions.filter(beginsWithActionVerb).length;
  const actionRatio = experienceDescriptions.length === 0 ? 0 : actionCount / experienceDescriptions.length;
  const allSkills = [...data.skills.hardSkills, ...data.skills.softSkills]
    .map(normalize)
    .filter(Boolean);
  const uniqueSkills = new Set(allSkills);
  const materialLines = formattedResume
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const overlongLines = materialLines.filter((line) => line.length > 180).length;

  const checks: ProductEvaluationCheck[] = [
    weightedCheck({
      id: 'quality-summary',
      label: 'Professional summary',
      passed: data.summary.trim().length >= 40 && data.summary.trim().length <= 700,
      detailPass: 'Summary is present and concise enough for a resume overview.',
      detailWarn: 'Summary is unusually short or long; review clarity before submitting.',
      weight: 15,
    }),
    weightedCheck({
      id: 'quality-experience-detail',
      label: 'Experience detail',
      passed: experienceDescriptions.every((description) => description.length >= 30),
      detailPass: 'Each experience entry contains substantive responsibility or achievement detail.',
      detailWarn: 'At least one experience entry is too thin to communicate meaningful responsibility.',
      weight: 20,
    }),
    weightedCheck({
      id: 'quality-action-language',
      label: 'Action-oriented experience language',
      passed: actionRatio >= 0.5,
      detailPass: 'Most experience descriptions begin with concrete action-oriented language.',
      detailWarn: 'Several experience descriptions could be clearer if they begin with the work actually performed.',
      weight: 20,
    }),
    weightedCheck({
      id: 'quality-skills',
      label: 'Focused skills inventory',
      passed: data.skills.hardSkills.length >= 2 && uniqueSkills.size === allSkills.length,
      detailPass: 'Technical skills are explicit and do not contain normalized duplicates.',
      detailWarn: 'Add at least two real technical skills and remove duplicate skill labels if present.',
      weight: 15,
    }),
    weightedCheck({
      id: 'quality-education',
      label: 'Education context',
      passed: data.education.length > 0,
      detailPass: 'Education context is represented.',
      detailWarn: 'No education entry is present in the current candidate data.',
      weight: 10,
    }),
    weightedCheck({
      id: 'quality-readable-lines',
      label: 'Readable statement length',
      passed: overlongLines === 0,
      detailPass: 'Rendered resume lines avoid unusually dense long-form statements.',
      detailWarn: `${overlongLines} rendered line(s) exceed 180 characters and may be difficult to scan.`,
      weight: 20,
    }),
    infoCheck(
      'quality-metrics-truth-boundary',
      'Verified outcomes only',
      'Numeric achievements are not required for a good score. Add metrics only when they are true and supportable; ATS v2 never recommends inventing them.',
    ),
  ];

  return {
    score: score(checks),
    version: PRODUCT_EVALUATION_VERSION,
    scope: 'Deterministic resume-content quality checks. This is not a recruiter acceptance probability.',
    checks,
  };
}

const STANDARD_HEADING_GROUPS: readonly (readonly string[])[] = [
  ['professional summary', 'summary', 'resumen profesional', 'resumen'],
  ['experience', 'work experience', 'experiencia', 'experiencia laboral'],
  ['education', 'educacion', 'formacion'],
  ['skills', 'technical skills', 'habilidades', 'habilidades tecnicas'],
];

function hasHeading(lines: readonly string[], aliases: readonly string[]): boolean {
  const normalizedLines = lines.map((line) => normalize(line.replace(/[:：]$/, '')));
  return aliases.some((alias) => normalizedLines.includes(normalize(alias)));
}

function evaluateAtsParseability(data: ResumeRequest, formattedResume: string): ProductMetricEvaluation {
  const lines = formattedResume.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const unusualTableSyntax = /\t|[┌┐└┘├┤┬┴┼]|\|.*\|/.test(formattedResume);
  const veryLongLines = lines.filter((line) => line.length > 200).length;
  const headingMatches = STANDARD_HEADING_GROUPS.filter((group) => hasHeading(lines, group)).length;
  const emailVisible = normalize(formattedResume).includes(normalize(data.personalInfo.email));
  const identityVisible = normalize(formattedResume).includes(normalize(data.personalInfo.fullName));

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
      id: 'parse-line-density',
      label: 'Line density',
      passed: veryLongLines === 0,
      detailPass: 'No extremely long rendered lines were detected.',
      detailWarn: `${veryLongLines} line(s) exceed 200 characters and may reduce structural readability.`,
      weight: 10,
    }),
    infoCheck(
      'parse-scope-boundary',
      'Scope boundary',
      'This estimates structural machine readability only. It does not predict a score from Workday, Greenhouse, Lever, or another commercial ATS.',
    ),
  ];

  return {
    score: score(checks),
    version: PRODUCT_EVALUATION_VERSION,
    scope: 'Deterministic structural parseability checks over the generated plain-text resume.',
    checks,
  };
}

export function evaluateProductResume(data: ResumeRequest, formattedResume: string): ProductEvaluation {
  return {
    resumeQuality: evaluateResumeQuality(data, formattedResume),
    atsParseability: evaluateAtsParseability(data, formattedResume),
  };
}
