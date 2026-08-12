import { resumeRequestSchema } from '../../schemas';

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
 * Checks whether a candidate draft can cross the final generation boundary.
 *
 * Native import is intentionally allowed to preserve incomplete source data
 * rather than inventing missing facts. That makes import acceptance different
 * from generation readiness. This function makes that boundary explicit so the
 * product can route an incomplete draft to candidate review instead of sending
 * a request that the generation API must reject.
 */
export function evaluateGenerationReadiness(candidate: unknown): GenerationReadinessResult {
  const parsed = resumeRequestSchema.safeParse(candidate);
  if (parsed.success) return { ready: true, issues: [] };

  return {
    ready: false,
    issues: generationValidationIssues(parsed.error.issues),
  };
}
