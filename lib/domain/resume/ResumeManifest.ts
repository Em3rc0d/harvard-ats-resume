import type {
  CareerAssertionId,
  ResumeClaimId,
  ResumeManifestId,
  ResumeVersionId,
} from '../shared/identifiers';
import { fail, pass, type ValidationResult } from '../shared/truth';
import type { ResumeClaim } from './ResumeClaim';

export interface ResumeManifestEntry {
  readonly claimId: ResumeClaimId;
  readonly assertionIds: readonly CareerAssertionId[];
}

export interface ResumeManifest {
  readonly id: ResumeManifestId;
  readonly resumeVersionId: ResumeVersionId;
  readonly entries: readonly ResumeManifestEntry[];
}

export function createResumeManifest(
  input: ResumeManifest,
  claimsById: ReadonlyMap<ResumeClaimId, ResumeClaim>,
): ResumeManifest {
  const validation = validateResumeManifest(input, claimsById);

  if (!validation.ok) {
    throw new Error(validation.issues.map((issue) => issue.message).join('\n'));
  }

  return input;
}

export function validateResumeManifest(
  manifest: ResumeManifest,
  claimsById: ReadonlyMap<ResumeClaimId, ResumeClaim>,
): ValidationResult {
  const missingClaim = manifest.entries.find((entry) => !claimsById.has(entry.claimId));

  if (missingClaim) {
    return fail('INV-006', `ResumeManifest references unknown ResumeClaim: ${missingClaim.claimId}.`);
  }

  const mismatchedProvenance = manifest.entries.find((entry) => {
    const claim = claimsById.get(entry.claimId);

    if (!claim) {
      return false;
    }

    const manifestAssertionIds = new Set(entry.assertionIds);

    return (
      entry.assertionIds.length === 0 ||
      entry.assertionIds.length !== claim.assertionIds.length ||
      claim.assertionIds.some((assertionId) => !manifestAssertionIds.has(assertionId))
    );
  });

  if (mismatchedProvenance) {
    return fail(
      'INV-006',
      `ResumeManifest must preserve the complete provenance from each ResumeClaim to its CareerAssertions: ${mismatchedProvenance.claimId}.`,
    );
  }

  return pass();
}
