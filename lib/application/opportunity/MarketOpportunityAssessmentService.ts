import type {
  CareerAssertion,
  JobSnapshot,
} from '../../domain';
import {
  JOB_MATCH_PERSISTENCE_VERSION,
} from '../career-vault/CareerVaultIdentity';
import type { JobIntelligenceResult } from '../job/JobIntelligenceEngine';
import { validateMarketProjectedJobSnapshotIntegrity } from '../market/MarketJobProjectionService';
import { matchJobToCandidate, type JobMatchResult } from '../matching/JobMatchEngine';
import { toExplainableJobMatch } from '../product/ExplainableJobMatchMapper';
import type { ExplainableJobMatchView } from '../product/ProductResultContract';
import { assessOpportunity, type OpportunityAssessment } from './OpportunityAssessment';

export const MARKET_OPPORTUNITY_ASSESSMENT_INTEGRATION_VERSION = 'market-opportunity-assessment-integration-v1' as const;

export class MarketOpportunityAssessmentUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketOpportunityAssessmentUnavailableError';
  }
}

export interface AssessMarketJobSnapshotInput {
  readonly jobSnapshot: JobSnapshot;
  readonly assertions: readonly CareerAssertion[];
  readonly candidateSnapshotSha256: string;
  readonly assessedAt?: string;
}

export interface MarketOpportunityAssessmentResult {
  readonly jobSnapshot: JobSnapshot;
  readonly jobMatch: JobMatchResult;
  readonly explainableJobMatch: ExplainableJobMatchView;
  readonly assessment: OpportunityAssessment;
  readonly matchProjectionKey: string;
  readonly integrationVersion: typeof MARKET_OPPORTUNITY_ASSESSMENT_INTEGRATION_VERSION;
  readonly scopeBoundary: 'PREBUILT_MARKET_JOB_SNAPSHOT_TO_ASSESSMENT_NO_REPARSING_OR_CANDIDATE_TRUTH_MUTATION';
}

function requireAssessment(condition: boolean, message: string): asserts condition {
  if (!condition) throw new MarketOpportunityAssessmentUnavailableError(message);
}

/**
 * A JobSnapshot already contains the exact job-side contract consumed by the
 * matcher/presentation layer. This view preserves object references and never
 * invokes Job Intelligence again.
 */
function jobIntelligenceView(jobSnapshot: JobSnapshot): JobIntelligenceResult {
  return {
    jobDescription: jobSnapshot.jobDescription,
    requirements: jobSnapshot.requirements,
    language: jobSnapshot.language,
  };
}

function marketMatchProjectionKey(candidateSnapshotSha256: string, jobSnapshot: JobSnapshot): string {
  requireAssessment(
    /^[a-f0-9]{64}$/.test(candidateSnapshotSha256),
    'candidateSnapshotSha256 must be a canonical SHA-256 digest.',
  );
  return [
    'market-match',
    candidateSnapshotSha256.slice(0, 16),
    jobSnapshot.contentSha256.slice(0, 16),
    JOB_MATCH_PERSISTENCE_VERSION,
  ].join(':');
}

/**
 * M4B-06 pure assessment bridge.
 *
 * The exact durable M4B-05 JobSnapshot is consumed as market truth. No parser is
 * called and the supplied CareerAssertions are read-only candidate truth.
 */
export function assessMarketJobSnapshot(
  input: AssessMarketJobSnapshotInput,
): MarketOpportunityAssessmentResult {
  validateMarketProjectedJobSnapshotIntegrity(input.jobSnapshot);
  requireAssessment(Boolean(input.jobSnapshot.marketProvenance), 'M4B-06 requires M4B-05 market provenance.');
  requireAssessment(input.assertions.length > 0, 'M4B-06 requires candidate assertions.');
  requireAssessment(
    input.jobSnapshot.requirements.length > 0,
    'The stored market JobSnapshot has no extracted requirements and cannot support an OpportunityAssessment.',
  );

  const assessedAt = input.assessedAt ?? new Date().toISOString();
  requireAssessment(Number.isFinite(Date.parse(assessedAt)), 'assessedAt must be a valid timestamp.');
  const assertionIdentityBefore = input.assertions.map((item) => `${item.id}:${item.statement}`).join('|');
  const jobTruth = jobIntelligenceView(input.jobSnapshot);
  const matchProjectionKey = marketMatchProjectionKey(input.candidateSnapshotSha256, input.jobSnapshot);
  const jobMatch = matchJobToCandidate(jobTruth, input.assertions, {
    projectionKey: matchProjectionKey,
    generatedAt: assessedAt,
  });
  const explainableJobMatch = toExplainableJobMatch(jobMatch, jobTruth, input.assertions);
  const assessment = assessOpportunity(explainableJobMatch);
  const assertionIdentityAfter = input.assertions.map((item) => `${item.id}:${item.statement}`).join('|');

  requireAssessment(
    assertionIdentityAfter === assertionIdentityBefore,
    'Market assessment mutated candidate assertions.',
  );
  requireAssessment(
    jobMatch.report.jobDescriptionId === input.jobSnapshot.jobDescription.id,
    'Job Match is not bound to the exact market JobSnapshot description.',
  );
  requireAssessment(
    jobMatch.requirements === input.jobSnapshot.requirements,
    'Job Match did not preserve the exact JobSnapshot requirement collection.',
  );

  return {
    jobSnapshot: input.jobSnapshot,
    jobMatch,
    explainableJobMatch,
    assessment,
    matchProjectionKey,
    integrationVersion: MARKET_OPPORTUNITY_ASSESSMENT_INTEGRATION_VERSION,
    scopeBoundary: 'PREBUILT_MARKET_JOB_SNAPSHOT_TO_ASSESSMENT_NO_REPARSING_OR_CANDIDATE_TRUTH_MUTATION',
  };
}
