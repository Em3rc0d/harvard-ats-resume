import type { ResumeRequest } from '../../schemas';
import type { ProductEvaluation } from './ProductEvaluationService';

export const TRUSTED_ADVICE_VERSION = 'ats2-trusted-advice-v1' as const;

export type TrustedAdviceCategory = 'EVIDENCE' | 'CONTENT' | 'STRUCTURE' | 'TARGETING' | 'TEMPORAL';
export type TrustedAdviceSeverity = 'ACTION' | 'INFO';

export interface TrustedAdviceItem {
  readonly id: string;
  readonly version: typeof TRUSTED_ADVICE_VERSION;
  readonly category: TrustedAdviceCategory;
  readonly severity: TrustedAdviceSeverity;
  readonly message: string;
  readonly rationale: string;
}

export interface TrustedAdviceJobContext {
  readonly score: number;
  readonly requirements: readonly {
    readonly statement: string;
    readonly necessity: 'REQUIRED' | 'PREFERRED' | 'UNKNOWN';
    readonly status: 'MATCH' | 'POTENTIAL_MATCH' | 'GAP' | 'UNKNOWN' | 'BLOCKER';
  }[];
}

export interface TrustedAdviceOptions {
  readonly now?: Date;
  readonly jobMatch?: TrustedAdviceJobContext;
}

function item(
  id: string,
  category: TrustedAdviceCategory,
  severity: TrustedAdviceSeverity,
  message: string,
  rationale: string,
): TrustedAdviceItem {
  return { id, version: TRUSTED_ADVICE_VERSION, category, severity, message, rationale };
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, january: 1, ene: 1, enero: 1, janv: 1, janvier: 1, janeiro: 1,
  feb: 2, february: 2, febrero: 2, fev: 2, fevrier: 2, fevereiro: 2,
  mar: 3, march: 3, marzo: 3, mars: 3, marco: 3,
  apr: 4, april: 4, abr: 4, abril: 4, avr: 4, avril: 4,
  may: 5, mayo: 5, mai: 5, maio: 5,
  jun: 6, june: 6, junio: 6, juin: 6, junho: 6,
  jul: 7, july: 7, julio: 7, juillet: 7, julho: 7,
  aug: 8, august: 8, ago: 8, agosto: 8, aout: 8,
  sep: 9, sept: 9, september: 9, septiembre: 9, septembre: 9, setembro: 9,
  oct: 10, october: 10, octubre: 10, octobre: 10, outubro: 10,
  nov: 11, november: 11, noviembre: 11, novembre: 11, novembro: 11,
  dec: 12, december: 12, dic: 12, diciembre: 12, decembre: 12, dez: 12, dezembro: 12,
};

const PRESENT_LABELS = new Set([
  'present', 'current', 'currently', 'actualidad', 'presente', 'actuel', 'actuellement', 'atual', 'atualmente', 'hoje',
]);

interface ParsedCareerDate {
  readonly year: number;
  readonly month: number;
}

function parseCareerDate(value: string, now: Date): ParsedCareerDate | undefined {
  const normalized = normalize(value).replace(/[.,]/g, ' ');
  if (!normalized) return undefined;
  if (PRESENT_LABELS.has(normalized)) {
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  }

  const yearMatch = normalized.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) return undefined;
  const year = Number(yearMatch[0]);
  const monthToken = normalized
    .split(/[^a-z]+/)
    .map((token) => token.trim())
    .find((token) => MONTHS[token] !== undefined);

  return { year, month: monthToken ? MONTHS[monthToken]! : 1 };
}

function dateOrder(value: ParsedCareerDate): number {
  return (value.year * 12) + value.month;
}

function temporalAdvice(data: ResumeRequest, now: Date): TrustedAdviceItem[] {
  const advice: TrustedAdviceItem[] = [];

  data.experience.forEach((experience, index) => {
    const start = parseCareerDate(experience.startDate, now);
    const end = parseCareerDate(experience.endDate, now);
    if (start && end && dateOrder(start) > dateOrder(end)) {
      advice.push(item(
        `temporal-experience-${index}`,
        'TEMPORAL',
        'ACTION',
        `Review the date order for ${experience.company || experience.role || `experience ${index + 1}`}.`,
        'The documented start date is later than the documented end date. CV Engine is flagging the ordering only; it is not inferring which date is correct.',
      ));
    }
  });

  data.education.forEach((education, index) => {
    const start = parseCareerDate(education.startDate, now);
    const end = parseCareerDate(education.endDate, now);
    if (start && end && dateOrder(start) > dateOrder(end)) {
      advice.push(item(
        `temporal-education-${index}`,
        'TEMPORAL',
        'ACTION',
        `Review the date order for ${education.institution || education.degree || `education ${index + 1}`}.`,
        'The documented start date is later than the documented end date. CV Engine does not guess a replacement date.',
      ));
    }
  });

  return advice;
}

function hasVerifiedNumericOutcome(data: ResumeRequest): boolean {
  const evidenceText = [
    ...data.experience.map((experience) => experience.description),
    ...(data.projects ?? []).map((project) => project.description),
  ].join(' ');

  return /(?:\b\d+(?:[.,]\d+)?\s*%|\b\d+(?:[.,]\d+)?\s*[x×]\b|[$€£]\s*\d|\b\d+\s*(?:users?|usuarios?|clients?|clientes?|hours?|horas?|days?|dias?)\b)/iu.test(evidenceText);
}

function evaluationAdvice(evaluation: ProductEvaluation): TrustedAdviceItem[] {
  const warnings = new Map(
    [...evaluation.resumeQuality.checks, ...evaluation.atsParseability.checks]
      .filter((check) => check.status === 'WARN')
      .map((check) => [check.id, check]),
  );
  const advice: TrustedAdviceItem[] = [];

  if (warnings.has('quality-summary')) {
    advice.push(item(
      'content-summary',
      'CONTENT',
      'ACTION',
      'Review the professional summary for concise, evidence-backed positioning.',
      warnings.get('quality-summary')!.detail,
    ));
  }
  if (warnings.has('quality-substantive-evidence')) {
    advice.push(item(
      'evidence-substantive-work',
      'EVIDENCE',
      'ACTION',
      'Add clearer responsibility or project evidence only from work you can defend.',
      warnings.get('quality-substantive-evidence')!.detail,
    ));
  }
  if (warnings.has('quality-skills')) {
    advice.push(item(
      'content-skills',
      'CONTENT',
      'ACTION',
      'Review the skills inventory for real technical coverage and normalized duplicates.',
      warnings.get('quality-skills')!.detail,
    ));
  }
  if (warnings.has('quality-evidence-coverage')) {
    advice.push(item(
      'evidence-coverage',
      'EVIDENCE',
      'INFO',
      'The current resume is supported by a narrow set of career-evidence domains.',
      'Add projects, education, certifications, languages, or experience only when they are true and relevant; missing evidence is never filled automatically.',
    ));
  }
  if (warnings.has('quality-semantic-density')) {
    advice.push(item(
      'content-semantic-density',
      'CONTENT',
      'ACTION',
      'Break unusually dense statements into smaller evidence-preserving units.',
      warnings.get('quality-semantic-density')!.detail,
    ));
  }
  if (warnings.has('parse-headings') || warnings.has('parse-layout') || warnings.has('parse-claim-separation')) {
    const details = ['parse-headings', 'parse-layout', 'parse-claim-separation']
      .map((id) => warnings.get(id)?.detail)
      .filter((detail): detail is string => Boolean(detail))
      .join(' ');
    advice.push(item(
      'structure-parseability',
      'STRUCTURE',
      'ACTION',
      'Keep the resume in a simple linear structure with standard headings and explicit claim boundaries.',
      details,
    ));
  }

  return advice;
}

function targetingAdvice(data: ResumeRequest, jobMatch?: TrustedAdviceJobContext): TrustedAdviceItem[] {
  if (!data.jobDescription?.trim() || !jobMatch) return [];

  const unsupported = jobMatch.requirements.filter((requirement) =>
    requirement.status === 'GAP' || requirement.status === 'BLOCKER' || requirement.status === 'UNKNOWN');
  if (unsupported.length === 0) return [];

  const requiredUnsupported = unsupported.filter((requirement) => requirement.necessity === 'REQUIRED');
  return [item(
    'targeting-evidence-gaps',
    'TARGETING',
    requiredUnsupported.length > 0 ? 'ACTION' : 'INFO',
    requiredUnsupported.length > 0
      ? `Review ${requiredUnsupported.length} required target requirement(s) that are not currently supported by Career Evidence.`
      : `Review ${unsupported.length} target requirement(s) that are not currently supported by Career Evidence.`,
    'A target requirement is market truth, not candidate truth. Add supporting evidence only if the underlying fact is genuinely yours; otherwise keep the gap visible.',
  )];
}

/**
 * Produces product-owned advice from candidate evidence, deterministic product
 * evaluation, and optional Job Match context. Model-authored suggestions never
 * enter this boundary.
 */
export function deriveTrustedAdvice(
  data: ResumeRequest,
  evaluation: ProductEvaluation,
  options: TrustedAdviceOptions = {},
): TrustedAdviceItem[] {
  const now = options.now ?? new Date();
  const advice = [
    ...temporalAdvice(data, now),
    ...evaluationAdvice(evaluation),
    ...targetingAdvice(data, options.jobMatch),
  ];

  const hasOutcomeEvidence = hasVerifiedNumericOutcome(data);
  const hasWorkEvidence = data.experience.length > 0 || (data.projects?.length ?? 0) > 0;
  if (hasWorkEvidence && !hasOutcomeEvidence) {
    advice.push(item(
      'evidence-verified-outcomes',
      'EVIDENCE',
      'INFO',
      'Quantified outcomes are optional. Add them only when you have a real, supportable result that is not yet captured in Career Evidence.',
      'CV Engine does not invent percentages, money, counts, or impact claims to make a resume look stronger.',
    ));
  }

  return advice.filter((entry, index, entries) => entries.findIndex((candidate) => candidate.id === entry.id) === index);
}
