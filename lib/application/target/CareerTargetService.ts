import { createHash } from 'node:crypto';
import {
  domainId,
  type CandidateProfileId,
  type CareerTarget,
  type CareerTargetEmploymentType,
  type CareerTargetRelocation,
  type CareerTargetSeniority,
  type CareerTargetWorkModel,
} from '../../domain';
import { stableJson } from '../career-vault/CareerVaultIdentity';

export const CAREER_TARGET_POLICY_VERSION = 'career-target-v1' as const;

export interface CareerTargetInput {
  readonly roleTitle: string;
  readonly jobFamily?: string;
  readonly preferredSeniority?: CareerTargetSeniority;
  readonly preferredLocations?: readonly string[];
  readonly workModels?: readonly CareerTargetWorkModel[];
  readonly employmentTypes?: readonly CareerTargetEmploymentType[];
  readonly industries?: readonly string[];
  readonly relocation?: CareerTargetRelocation;
  readonly priority?: 1 | 2 | 3 | 4 | 5;
}

export type TargetDimensionStatus = 'ALIGNED' | 'PARTIAL' | 'CONFLICT' | 'UNKNOWN' | 'NOT_CONSTRAINED';
export type CareerTargetRelevanceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export interface CareerTargetRelevance {
  readonly policyVersion: typeof CAREER_TARGET_POLICY_VERSION;
  readonly level: CareerTargetRelevanceLevel;
  readonly role: TargetDimensionStatus;
  readonly seniority: TargetDimensionStatus;
  readonly location: TargetDimensionStatus;
  readonly workModel: TargetDimensionStatus;
  readonly employmentType: TargetDimensionStatus;
  readonly reasons: readonly string[];
  readonly scopeBoundary: 'PREFERENCE_ALIGNMENT_NOT_CAPABILITY_EVIDENCE';
}

const SENIORITY_TERMS: Readonly<Record<Exclude<CareerTargetSeniority, 'ANY'>, readonly string[]>> = {
  ENTRY: ['entry level', 'entry-level', 'graduate', 'new grad'],
  JUNIOR: ['junior', 'jr. ', 'jr '],
  MID: ['mid level', 'mid-level', 'mid level', 'intermediate'],
  SENIOR: ['senior', 'sr. ', 'sr '],
  LEAD: ['lead ', 'technical lead', 'tech lead'],
  STAFF: ['staff '],
  PRINCIPAL: ['principal '],
  MANAGER: ['manager', 'engineering manager'],
  DIRECTOR: ['director'],
};

const WORK_MODEL_TERMS: Readonly<Record<Exclude<CareerTargetWorkModel, 'FLEXIBLE'>, readonly string[]>> = {
  REMOTE: ['remote', 'work from home', 'fully remote', 'remoto', 'remota'],
  HYBRID: ['hybrid', 'híbrido', 'hibrido', 'híbrida', 'hibrida'],
  ONSITE: ['on-site', 'onsite', 'in office', 'office-based', 'presencial'],
};

const EMPLOYMENT_TERMS: Readonly<Record<Exclude<CareerTargetEmploymentType, 'ANY'>, readonly string[]>> = {
  FULL_TIME: ['full time', 'full-time', 'tiempo completo'],
  PART_TIME: ['part time', 'part-time', 'medio tiempo'],
  CONTRACT: ['contract', 'contractor', 'contrato', 'freelance'],
  INTERNSHIP: ['internship', 'intern ', 'prácticas', 'practicas', 'practicante'],
};

const ROLE_STOPWORDS = new Set(['engineer', 'engineering', 'developer', 'specialist', 'the', 'and', 'of', 'de', 'y']);

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\-/\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedList(values: readonly string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function createCareerTarget(
  candidateProfileId: CandidateProfileId,
  input: CareerTargetInput,
  createdAt = new Date().toISOString(),
): CareerTarget {
  const roleTitle = input.roleTitle.trim();
  if (roleTitle.length < 2) throw new Error('CareerTarget roleTitle is required.');

  const semantic = {
    candidateProfileId,
    roleTitle,
    jobFamily: input.jobFamily?.trim() || undefined,
    preferredSeniority: input.preferredSeniority ?? 'ANY',
    preferredLocations: normalizedList(input.preferredLocations),
    workModels: Array.from(new Set(input.workModels ?? ['FLEXIBLE'])),
    employmentTypes: Array.from(new Set(input.employmentTypes ?? ['ANY'])),
    industries: normalizedList(input.industries),
    relocation: input.relocation ?? 'UNSPECIFIED',
    priority: input.priority ?? 3,
  } as const;
  const contentSha256 = sha256(stableJson(semantic));

  return {
    id: domainId('CareerTarget', `career-target:${contentSha256.slice(0, 32)}`),
    ...semantic,
    contentSha256,
    createdAt,
  };
}

function includesAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(normalize(term)));
}

function roleStatus(target: CareerTarget, headerText: string): TargetDimensionStatus {
  const targetRole = normalize(target.roleTitle);
  if (headerText.includes(targetRole)) return 'ALIGNED';

  const tokens = targetRole
    .split(' ')
    .filter((token) => token.length >= 3 && !ROLE_STOPWORDS.has(token));
  if (tokens.length === 0) return 'UNKNOWN';
  const matched = tokens.filter((token) => headerText.includes(token)).length;
  if (matched === tokens.length) return 'ALIGNED';
  if (matched >= Math.max(1, Math.ceil(tokens.length / 2))) return 'PARTIAL';
  return 'UNKNOWN';
}

function seniorityStatus(target: CareerTarget, headerText: string): TargetDimensionStatus {
  if (target.preferredSeniority === 'ANY') return 'NOT_CONSTRAINED';
  const explicit = (Object.entries(SENIORITY_TERMS) as [Exclude<CareerTargetSeniority, 'ANY'>, readonly string[]][])
    .filter(([, terms]) => includesAny(headerText, terms))
    .map(([seniority]) => seniority);
  if (explicit.length === 0) return 'UNKNOWN';
  return explicit.includes(target.preferredSeniority) ? 'ALIGNED' : 'CONFLICT';
}

function workModelStatus(target: CareerTarget, text: string): TargetDimensionStatus {
  if (target.workModels.includes('FLEXIBLE')) return 'NOT_CONSTRAINED';
  const explicit = (Object.entries(WORK_MODEL_TERMS) as [Exclude<CareerTargetWorkModel, 'FLEXIBLE'>, readonly string[]][])
    .filter(([, terms]) => includesAny(text, terms))
    .map(([model]) => model);
  if (explicit.length === 0) return 'UNKNOWN';
  return explicit.some((model) => target.workModels.includes(model)) ? 'ALIGNED' : 'CONFLICT';
}

function employmentStatus(target: CareerTarget, text: string): TargetDimensionStatus {
  if (target.employmentTypes.includes('ANY')) return 'NOT_CONSTRAINED';
  const explicit = (Object.entries(EMPLOYMENT_TERMS) as [Exclude<CareerTargetEmploymentType, 'ANY'>, readonly string[]][])
    .filter(([, terms]) => includesAny(text, terms))
    .map(([type]) => type);
  if (explicit.length === 0) return 'UNKNOWN';
  return explicit.some((type) => target.employmentTypes.includes(type)) ? 'ALIGNED' : 'CONFLICT';
}

function locationStatus(target: CareerTarget, text: string): TargetDimensionStatus {
  if (target.preferredLocations.length === 0) return 'NOT_CONSTRAINED';
  return target.preferredLocations.some((location) => text.includes(normalize(location)))
    ? 'ALIGNED'
    : 'UNKNOWN';
}

/**
 * Compares explicit candidate intent to explicit signals in the job posting.
 * Unknown is preferred over guessing. This result never changes Job Match or
 * satisfies a requirement; it is a separate decision-support dimension.
 */
export function assessCareerTargetRelevance(
  target: CareerTarget,
  jobSourceText: string,
): CareerTargetRelevance {
  const text = normalize(jobSourceText);
  const headerText = normalize(jobSourceText.split(/\n+/).slice(0, 6).join(' '));
  const role = roleStatus(target, headerText);
  const seniority = seniorityStatus(target, headerText);
  const location = locationStatus(target, text);
  const workModel = workModelStatus(target, text);
  const employmentType = employmentStatus(target, text);
  const statuses = [role, seniority, location, workModel, employmentType];
  const conflicts = statuses.filter((status) => status === 'CONFLICT').length;
  const aligned = statuses.filter((status) => status === 'ALIGNED').length;
  const partial = statuses.filter((status) => status === 'PARTIAL').length;

  let level: CareerTargetRelevanceLevel = 'UNKNOWN';
  if (conflicts > 0) level = 'LOW';
  else if (role === 'ALIGNED' && aligned >= 2) level = 'HIGH';
  else if (role === 'ALIGNED' || role === 'PARTIAL' || aligned >= 1 || partial >= 1) level = 'MEDIUM';

  const reasons: string[] = [];
  if (role === 'ALIGNED') reasons.push(`Role language aligns with target: ${target.roleTitle}.`);
  else if (role === 'PARTIAL') reasons.push(`Role language partially overlaps target: ${target.roleTitle}.`);
  else reasons.push(`The posting does not expose enough title signal to confirm target-role alignment with ${target.roleTitle}.`);
  if (seniority === 'CONFLICT') reasons.push('The posting explicitly signals a different seniority than the target preference.');
  if (workModel === 'CONFLICT') reasons.push('The posting explicitly signals a work model outside the target preference.');
  if (employmentType === 'CONFLICT') reasons.push('The posting explicitly signals an employment type outside the target preference.');

  return {
    policyVersion: CAREER_TARGET_POLICY_VERSION,
    level,
    role,
    seniority,
    location,
    workModel,
    employmentType,
    reasons,
    scopeBoundary: 'PREFERENCE_ALIGNMENT_NOT_CAPABILITY_EVIDENCE',
  };
}
