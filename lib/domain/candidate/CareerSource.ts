import type { CandidateProfileId, CareerSourceId } from '../shared/identifiers';

export type CareerSourceKind =
  | 'CANDIDATE_PROVIDED'
  | 'RESUME_UPLOAD'
  | 'LINKEDIN_PROFILE'
  | 'CERTIFICATE_UPLOAD'
  | 'MANUAL_REVIEW';

export interface SourceDocumentReceipt {
  readonly receiptId: string;
  readonly originalFileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly importer: string;
  readonly importerVersion: string;
}

export interface CareerSource {
  readonly id: CareerSourceId;
  readonly candidateProfileId: CandidateProfileId;
  readonly kind: CareerSourceKind;
  readonly label: string;
  readonly capturedAt: string;
  readonly document?: SourceDocumentReceipt;
}

export function createCareerSource(input: CareerSource): CareerSource {
  if (!input.label.trim()) {
    throw new Error('CareerSource label is required');
  }

  if (input.document) {
    if (!input.document.originalFileName.trim()) {
      throw new Error('CareerSource document originalFileName is required');
    }

    if (!Number.isInteger(input.document.byteSize) || input.document.byteSize <= 0) {
      throw new Error('CareerSource document byteSize must be a positive integer');
    }

    if (!/^[a-f0-9]{64}$/i.test(input.document.sha256)) {
      throw new Error('CareerSource document sha256 must be a 64-character hex digest');
    }
  }

  return input;
}
