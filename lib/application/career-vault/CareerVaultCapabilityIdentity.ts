import { createHash } from 'node:crypto';
import { domainId, type CandidateProfileId } from '../../domain';

/**
 * Resolves the candidate-scoped persistence identity from the opaque browser
 * Career Vault capability without requiring mutable resume content.
 *
 * This intentionally mirrors the candidateProfileId derivation used by
 * deriveCareerVaultIdentity. Raw capabilities never become Redis keys.
 */
export function candidateProfileIdFromCareerVaultCapability(careerVaultId: string): CandidateProfileId {
  const normalizedVaultId = careerVaultId.trim().toLowerCase();
  if (!normalizedVaultId) throw new Error('Career Vault identity requires an opaque careerVaultId.');
  const vaultIdentitySha = createHash('sha256').update(normalizedVaultId, 'utf8').digest('hex');
  return domainId('CandidateProfile', `candidate:vault-sha256:${vaultIdentitySha.slice(0, 32)}`);
}
