import type { CareerEvidenceId, CareerSourceId } from '../shared/identifiers';

export interface CareerEvidence {
  readonly id: CareerEvidenceId;
  readonly sourceId: CareerSourceId;
  readonly excerpt: string;
  readonly observedAt: string;
}

export function createCareerEvidence(input: CareerEvidence): CareerEvidence {
  if (!input.excerpt.trim()) {
    throw new Error('CareerEvidence excerpt is required');
  }

  return input;
}
