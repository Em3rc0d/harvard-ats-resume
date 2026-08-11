import type { CareerAssertion } from '../candidate/CareerAssertion';
import type { CareerAssertionId, ResumeClaimId } from '../shared/identifiers';
import { fail, pass, type ValidationResult } from '../shared/truth';

export interface ResumeClaim {
  readonly id: ResumeClaimId;
  readonly assertionIds: readonly CareerAssertionId[];
  readonly wording: string;
}

export function createResumeClaim(
  input: ResumeClaim,
  assertionsById: ReadonlyMap<CareerAssertionId, CareerAssertion>,
): ResumeClaim {
  const validation = validateResumeClaim(input, assertionsById);

  if (!validation.ok) {
    throw new Error(validation.issues.map((issue) => issue.message).join('\n'));
  }

  return input;
}

export function validateResumeClaim(
  claim: ResumeClaim,
  assertionsById: ReadonlyMap<CareerAssertionId, CareerAssertion>,
): ValidationResult {
  if (!claim.wording.trim()) {
    return fail('INV-CLAIM-WORDING', 'ResumeClaim wording is required.');
  }

  if (claim.assertionIds.length === 0) {
    return fail('INV-003', 'ResumeClaim must reference at least one CareerAssertion.');
  }

  const unknownAssertionId = claim.assertionIds.find(
    (assertionId) => !assertionsById.has(assertionId),
  );

  if (unknownAssertionId) {
    return fail('INV-003', `ResumeClaim references unknown CareerAssertion: ${unknownAssertionId}.`);
  }

  const suggestionId = claim.assertionIds.find(
    (assertionId) => assertionsById.get(assertionId)?.truthClass === 'SUGGESTION',
  );

  if (suggestionId) {
    return fail('INV-002', `SUGGESTION cannot be emitted as ResumeClaim: ${suggestionId}.`);
  }

  return pass();
}
