import type {
  CandidateProfileId,
  CareerAssertionId,
  CareerEvidenceId,
  CareerSourceId,
} from '../shared/identifiers';
import type { TruthClass } from '../shared/truth';
import { fail, pass, type ValidationResult } from '../shared/truth';

export interface CareerAssertion {
  readonly id: CareerAssertionId;
  readonly candidateProfileId: CandidateProfileId;
  readonly statement: string;
  readonly truthClass: TruthClass;
  readonly evidenceIds: readonly CareerEvidenceId[];
  readonly sourceIds: readonly CareerSourceId[];
  readonly derivedFromAssertionIds: readonly CareerAssertionId[];
  readonly derivationRule?: string;
  readonly createdAt: string;
}

export function createCareerAssertion(input: CareerAssertion): CareerAssertion {
  const validation = validateCareerAssertion(input);

  if (!validation.ok) {
    throw new Error(validation.issues.map((issue) => issue.message).join('\n'));
  }

  return input;
}

export function validateCareerAssertion(assertion: CareerAssertion): ValidationResult {
  if (!assertion.statement.trim()) {
    return fail('INV-ASSERTION-STATEMENT', 'CareerAssertion statement is required.');
  }

  if (
    assertion.truthClass === 'VERIFIED_FACT' &&
    assertion.evidenceIds.length === 0 &&
    assertion.sourceIds.length === 0
  ) {
    return fail(
      'INV-001',
      'CareerAssertion VERIFIED_FACT must reference evidence or explicit candidate-provided source.',
    );
  }

  if (assertion.truthClass === 'DERIVED_FACT' && !assertion.derivationRule?.trim()) {
    return fail('INV-DERIVED-RULE', 'DERIVED_FACT must include an explicit derivation rule.');
  }

  if (assertion.truthClass === 'REWRITE' && assertion.derivedFromAssertionIds.length === 0) {
    return fail('INV-REWRITE-SOURCE', 'REWRITE must reference the assertion it preserves.');
  }

  return pass();
}
