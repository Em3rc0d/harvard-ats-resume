import type { CareerAssertion } from '../../domain';
import type { JobIntelligenceResult } from '../job/JobIntelligenceEngine';
import type { JobMatchResult } from '../matching/JobMatchEngine';
import type { ExplainableJobMatchView } from './ProductResultContract';

/**
 * Converts internal job-match inference into the public evidence-backed view.
 * Job requirements remain market truth; only existing CareerAssertions can be
 * attached as candidate evidence.
 */
export function toExplainableJobMatch(
  jobMatch: JobMatchResult,
  jobIntelligence: JobIntelligenceResult,
  assertions: readonly CareerAssertion[],
): ExplainableJobMatchView {
  const assertionsById = new Map(assertions.map((assertion) => [assertion.id, assertion]));

  return {
    score: jobMatch.score,
    language: jobIntelligence.language,
    breakdown: jobMatch.breakdown,
    requirements: jobMatch.requirements.map((requirement, index) => {
      const inference = jobMatch.report.matches[index];
      const assertionIds = inference?.assertionIds ?? [];

      return {
        id: requirement.id,
        statement: requirement.statement,
        kind: requirement.kind,
        necessity: requirement.necessity,
        canonicalConcept: requirement.canonicalConcept,
        minimumYears: requirement.minimumYears,
        status: inference?.status ?? 'UNKNOWN',
        rationale: inference?.rationale ?? 'No match inference available.',
        assertionIds,
        evidence: assertionIds
          .map((id) => assertionsById.get(id))
          .filter((assertion): assertion is CareerAssertion => Boolean(assertion))
          .map((assertion) => ({
            assertionId: assertion.id,
            statement: assertion.statement,
            truthClass: assertion.truthClass,
            sourceIds: assertion.sourceIds,
            evidenceIds: assertion.evidenceIds,
          })),
      };
    }),
  };
}
