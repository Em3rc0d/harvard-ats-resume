import { createHash } from 'node:crypto';
import { domainId, type CandidateProfileId } from '../../domain';
import type { ResumeRequest } from '../../schemas';
import type { ResumeImportContext } from '../import/ResumeImportProvider';

export const JOB_INTELLIGENCE_PERSISTENCE_VERSION = 'ji-g10-v1' as const;
export const JOB_MATCH_PERSISTENCE_VERSION = 'jm-g10-v1' as const;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
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
 * Establishes stable server-side identities from an opaque browser-held vault
 * capability. Raw capability values, email, and Job Description content never
 * appear in domain IDs or Redis keys.
 *
 * This capability is intentionally narrower than authentication: possession is
 * enough to continue writing the same vault, but there is still no public vault
 * read API and no identity/account claim in G12. A later auth gate must replace
 * or bind this capability to an authenticated principal.
 */
export function deriveCareerVaultIdentity(
  data: ResumeRequest,
  careerVaultId: string,
  sourceContext?: ResumeImportContext,
): CareerVaultIdentity {
  const normalizedVaultId = careerVaultId.trim().toLowerCase();
  if (!normalizedVaultId) {
    throw new Error('Career Vault identity requires an opaque careerVaultId.');
  }

  const vaultIdentitySha = sha256(normalizedVaultId);
  const candidateProfileId = domainId(
    'CandidateProfile',
    `candidate:vault-sha256:${vaultIdentitySha.slice(0, 32)}`,
  );

  const normalizedEmail = data.personalInfo.email.trim().toLowerCase();
  const { jobDescription: _jobDescription, ...candidateData } = data;
  const canonicalCandidateData = {
    ...candidateData,
    personalInfo: {
      ...candidateData.personalInfo,
      email: normalizedEmail,
    },
  };
  const candidateSnapshotSha256 = sha256(stableJson({
    candidateData: canonicalCandidateData,
    sourceDocumentSha256: sourceContext?.receipt.sha256 ?? null,
    sourceReceiptId: sourceContext?.receipt.receiptId ?? null,
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
  const jobProjectionKey = `job-snapshot:${targetJobSha256.slice(0, 18)}:${JOB_INTELLIGENCE_PERSISTENCE_VERSION}`;
  const matchProjectionKey = `match:${candidateSnapshotSha256.slice(0, 10)}:${targetJobSha256.slice(0, 10)}:${JOB_MATCH_PERSISTENCE_VERSION}`;

  return {
    candidateProfileId,
    candidateProjectionKey,
    jobProjectionKey,
    matchProjectionKey,
    candidateSnapshotSha256,
    targetJobSha256,
  };
}
