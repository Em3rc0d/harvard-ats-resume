import type { CareerEvidenceId, CareerSourceId } from '../shared/identifiers';

export type EvidenceLocatorScope = 'SOURCE_DOCUMENT' | 'EXTRACTION_OUTPUT';
export type EvidenceGranularity = 'DOCUMENT' | 'PAGE' | 'SECTION' | 'FIELD';
export type CareerEvidenceReviewState =
  | 'UNREVIEWED_EXTRACTION'
  | 'CANDIDATE_CONFIRMED'
  | 'CANDIDATE_EDITED'
  | 'CANDIDATE_ADDED';

export interface CareerEvidenceLocator {
  readonly scope: EvidenceLocatorScope;
  readonly granularity: EvidenceGranularity;
  readonly page?: number;
  readonly section?: string;
  readonly fieldPath?: string;
}

export interface CareerEvidence {
  readonly id: CareerEvidenceId;
  readonly sourceId: CareerSourceId;
  readonly excerpt: string;
  readonly observedAt: string;
  readonly locator?: CareerEvidenceLocator;
  readonly confidence?: number;
  readonly reviewState?: CareerEvidenceReviewState;
}

export function createCareerEvidence(input: CareerEvidence): CareerEvidence {
  if (!input.excerpt.trim()) {
    throw new Error('CareerEvidence excerpt is required');
  }

  if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1)) {
    throw new Error('CareerEvidence confidence must be between 0 and 1');
  }

  if (input.locator?.granularity === 'PAGE' && input.locator.page === undefined) {
    throw new Error('CareerEvidence PAGE locator requires a page number');
  }

  if (input.locator?.granularity === 'SECTION' && !input.locator.section?.trim()) {
    throw new Error('CareerEvidence SECTION locator requires a section label');
  }

  if (input.locator?.granularity === 'FIELD' && !input.locator.fieldPath?.trim()) {
    throw new Error('CareerEvidence FIELD locator requires a fieldPath');
  }

  return input;
}
