import {
  hasMaterialCareerEvidence,
  resumeRequestSchema,
} from '../../schemas';

export interface GenerationReadinessIssue {
  readonly fieldPath: string;
  readonly message: string;
}

export interface GenerationReadinessResult {
  readonly ready: boolean;
  readonly issues: readonly GenerationReadinessIssue[];
}

function issuePath(path: readonly (string | number)[]): string {
  return path.reduce<string>((result, segment) => {
    if (typeof segment === 'number') return `${result}[${segment}]`;
    return result ? `${result}.${segment}` : segment;
  }, '');
}

export function generationValidationIssues(
  issues: readonly { readonly path: readonly (string | number)[]; readonly message: string }[],
): GenerationReadinessIssue[] {
  return issues.map((issue) => ({
    fieldPath: issuePath(issue.path) || 'request',
    message: issue.message,
  }));
}

/**
 * Checks whether a candidate draft can cross assessment/generation boundaries.
 * Import is allowed to preserve incomplete source truth, but trusted generation
 * requires valid identity plus at least one material career-evidence dimension.
 * It never requires a particular biography template such as mandatory summary,
 * formal employment or education.
 */
export function evaluateGenerationReadiness(candidate: unknown): GenerationReadinessResult {
  const parsed = resumeRequestSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ready: false,
      issues: generationValidationIssues(parsed.error.issues),
    };
  }

  if (!hasMaterialCareerEvidence(parsed.data)) {
    return {
      ready: false,
      issues: [{
        fieldPath: 'careerEvidence',
        message: 'Add at least one material career evidence item before continuing.',
      }],
    };
  }

  return { ready: true, issues: [] };
}
