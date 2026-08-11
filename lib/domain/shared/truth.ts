import type { CareerAssertionId, CareerEvidenceId, CareerSourceId } from './identifiers';

export type TruthClass = 'VERIFIED_FACT' | 'DERIVED_FACT' | 'REWRITE' | 'SUGGESTION';

export interface TruthProvenance {
  readonly evidenceIds: readonly CareerEvidenceId[];
  readonly sourceIds: readonly CareerSourceId[];
  readonly derivedFromAssertionIds: readonly CareerAssertionId[];
  readonly derivationRule?: string;
}

export interface ValidationIssue {
  readonly invariant: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
}

export function pass(): ValidationResult {
  return { ok: true, issues: [] };
}

export function fail(invariant: string, message: string): ValidationResult {
  return { ok: false, issues: [{ invariant, message }] };
}

export function combineValidation(results: readonly ValidationResult[]): ValidationResult {
  const issues = results.flatMap((result) => result.issues);

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function assertValid(result: ValidationResult): void {
  if (!result.ok) {
    throw new Error(
      result.issues.map((issue) => `${issue.invariant}: ${issue.message}`).join('\n'),
    );
  }
}
