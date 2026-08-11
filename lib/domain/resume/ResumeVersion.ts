import type {
  CandidateProfileId,
  JobDescriptionId,
  MatchReportId,
  ResumeClaimId,
  ResumeVersionId,
} from '../shared/identifiers';
import { uniqueIds } from '../shared/identifiers';

export interface ResumeGenerationMetadata {
  readonly provider: string;
  readonly model: string;
  readonly contractVersion: string;
}

export interface ResumeVersion {
  readonly id: ResumeVersionId;
  readonly candidateProfileId: CandidateProfileId;
  readonly targetedJobDescriptionId?: JobDescriptionId;
  readonly targetJobDescriptionSha256?: string;
  readonly matchReportId?: MatchReportId;
  readonly claimIds: readonly ResumeClaimId[];
  readonly contentSha256: string;
  readonly generation: ResumeGenerationMetadata;
  readonly createdAt: string;
}

const SHA256 = /^[a-f0-9]{64}$/;

export function createResumeVersion(input: ResumeVersion): ResumeVersion {
  if (input.claimIds.length === 0) {
    throw new Error('ResumeVersion must reference at least one ResumeClaim.');
  }

  if (!uniqueIds(input.claimIds)) {
    throw new Error('ResumeVersion requires unique ResumeClaim identifiers.');
  }

  if (!SHA256.test(input.contentSha256)) {
    throw new Error('ResumeVersion contentSha256 must be a lowercase SHA-256 digest.');
  }

  if (input.targetJobDescriptionSha256 && !SHA256.test(input.targetJobDescriptionSha256)) {
    throw new Error('ResumeVersion targetJobDescriptionSha256 must be a lowercase SHA-256 digest.');
  }

  if (Boolean(input.targetedJobDescriptionId) !== Boolean(input.targetJobDescriptionSha256)) {
    throw new Error('ResumeVersion target id and target hash must either both be present or both be absent.');
  }

  if (!input.generation.provider.trim() || !input.generation.model.trim() || !input.generation.contractVersion.trim()) {
    throw new Error('ResumeVersion generation metadata is required.');
  }

  return input;
}
