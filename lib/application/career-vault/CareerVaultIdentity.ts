import { createHash } from 'node:crypto';
import { domainId, type CandidateProfileId } from '../../domain';
import type { ResumeRequest } from '../../schemas';
import type { ResumeImportContext } from '../import/ResumeImportProvider';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = stableValue((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }

  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export interface CareerVaultIdentity {
  readonly candidateProfileId: CandidateProfileId;
  readonly candidateProjectionKey: string;
  readonly jobProjectionKey?: string;
  readonly matchProjectionKey?: string;
  readonly candidateSnapshotSha256: string;
  readonly targetJobSha256?: string;
}

/**
 * Establishes stable server-side identities without placing raw email or Job
 * Description content into domain identifiers or Redis keys.
 *
 * Email is used only as the best available logical-candidate key in the legacy
 * unauthenticated product. It is NOT an authentication mechanism; a later auth
 * boundary must replace/alias this identity without weakening provenance.
 */
export function deriveCareerVaultIdentity(
  data: ResumeRequest,
  sourceContext?: ResumeImportContext,
): CareerVaultIdentity {
  const normalizedEmail = data.personalInfo.email.trim().toLowerCase();
  const candidateIdentitySha = sha256(normalizedEmail);
  const candidateProfileId = domainId(
    'CandidateProfile',
    `candidate:email-sha256:${candidateIdentitySha.slice(0, 32)}`,
  );

  const { jobDescription: _jobDescription, ...candidateData } = data;
  const candidateSnapshotSha256 = sha256(stableJson({
    candidateData,
    sourceDocumentSha256: sourceContext?.receipt.sha256 ?? null,
  }));
  const candidateProjectionKey = `candidate-snapshot:${candidateSnapshotSha256.slice(0, 24)}`;

  const targetJob = data.jobDescription?.trim();
  if (!targetJob) {
    return {
      candidateProfileId,
      candidateProjectionKey,
      candidateSnapshotSha256,
    };
  }

  const targetJobSha256 = sha256(targetJob);
  const jobProjectionKey = `job-snapshot:${targetJobSha256.slice(0, 24)}`;
  const matchProjectionKey = `match:${candidateSnapshotSha256.slice(0, 12)}:${targetJobSha256.slice(0, 12)}`;

  return {
    candidateProfileId,
    candidateProjectionKey,
    jobProjectionKey,
    matchProjectionKey,
    candidateSnapshotSha256,
    targetJobSha256,
  };
}
