import type {
  CareerAssertionId,
  JobRequirementId,
  RequirementMatchId,
} from '../shared/identifiers';
import { fail, pass, type ValidationResult } from '../shared/truth';

export type RequirementMatchStatus =
  | 'MATCH'
  | 'POTENTIAL_MATCH'
  | 'GAP'
  | 'UNKNOWN'
  | 'BLOCKER';

export interface RequirementMatch {
  readonly id: RequirementMatchId;
  readonly requirementId: JobRequirementId;
  readonly assertionIds: readonly CareerAssertionId[];
  readonly status: RequirementMatchStatus;
  readonly rationale: string;
}

export function createRequirementMatch(input: RequirementMatch): RequirementMatch {
  const validation = validateRequirementMatch(input);

  if (!validation.ok) {
    throw new Error(validation.issues.map((issue) => issue.message).join('\n'));
  }

  return input;
}

export function validateRequirementMatch(match: RequirementMatch): ValidationResult {
  if (!match.rationale.trim()) {
    return fail('INV-MATCH-RATIONALE', 'RequirementMatch rationale is required.');
  }

  if (
    (match.status === 'MATCH' || match.status === 'POTENTIAL_MATCH') &&
    match.assertionIds.length === 0
  ) {
    return fail(
      'INV-005',
      'RequirementMatch connects existing JobRequirement and CareerAssertion identifiers.',
    );
  }

  return pass();
}
