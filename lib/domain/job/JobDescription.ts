import type { JobDescriptionId } from '../shared/identifiers';

export interface JobDescription {
  readonly id: JobDescriptionId;
  readonly title?: string;
  readonly company?: string;
  readonly sourceText: string;
  readonly capturedAt: string;
}

export function createJobDescription(input: JobDescription): JobDescription {
  if (!input.sourceText.trim()) {
    throw new Error('JobDescription sourceText is required');
  }

  return input;
}
