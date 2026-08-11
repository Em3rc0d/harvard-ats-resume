import type { JobDescriptionId, JobRequirementId } from '../shared/identifiers';
import { fail, pass, type ValidationResult } from '../shared/truth';

export type JobRequirementKind =
  | 'SKILL'
  | 'EXPERIENCE'
  | 'RESPONSIBILITY'
  | 'EDUCATION'
  | 'CERTIFICATION'
  | 'LANGUAGE'
  | 'LOCATION'
  | 'WORK_AUTHORIZATION'
  | 'OTHER';

export type JobRequirementNecessity = 'REQUIRED' | 'PREFERRED' | 'UNKNOWN';

export interface JobRequirement {
  readonly id: JobRequirementId;
  readonly jobDescriptionId: JobDescriptionId;
  readonly statement: string;
  readonly kind: JobRequirementKind;
  readonly necessity: JobRequirementNecessity;
}

export function createJobRequirement(input: JobRequirement): JobRequirement {
  const validation = validateJobRequirement(input);

  if (!validation.ok) {
    throw new Error(validation.issues.map((issue) => issue.message).join('\n'));
  }

  return input;
}

export function validateJobRequirement(requirement: JobRequirement): ValidationResult {
  if (!requirement.statement.trim()) {
    return fail('INV-JOB-STATEMENT', 'JobRequirement statement is required.');
  }

  if (!requirement.jobDescriptionId) {
    return fail('INV-004', 'JobRequirement derives from JobDescription, never CandidateProfile.');
  }

  return pass();
}
