import type {
  ExplainableJobMatchView,
  ExplainableJobRequirementView,
  ExplainableRequirementNecessity,
  ExplainableRequirementStatus,
} from './ProductResultContract';

export interface RequirementStatusCounts {
  readonly MATCH: number;
  readonly POTENTIAL_MATCH: number;
  readonly GAP: number;
  readonly UNKNOWN: number;
  readonly BLOCKER: number;
}

export interface ExplainabilitySummary {
  readonly totalRequirements: number;
  readonly statusCounts: RequirementStatusCounts;
  readonly required: readonly ExplainableJobRequirementView[];
  readonly preferred: readonly ExplainableJobRequirementView[];
  readonly unknownNecessity: readonly ExplainableJobRequirementView[];
}

export const REQUIREMENT_STATUS_LABELS: Readonly<Record<ExplainableRequirementStatus, string>> = {
  MATCH: 'Match',
  POTENTIAL_MATCH: 'Potential match',
  GAP: 'Gap',
  UNKNOWN: 'Unknown',
  BLOCKER: 'Blocker',
};

export const REQUIREMENT_STATUS_EXPLANATIONS: Readonly<Record<ExplainableRequirementStatus, string>> = {
  MATCH: 'Candidate evidence is sufficient for this requirement in the evaluated rule set.',
  POTENTIAL_MATCH: 'Related evidence exists, but it does not fully establish the requirement.',
  GAP: 'The available candidate evidence does not satisfy this requirement.',
  UNKNOWN: 'The system does not have enough evidence to decide responsibly.',
  BLOCKER: 'The evaluated evidence conflicts with a required constraint.',
};

function byNecessity(
  requirements: readonly ExplainableJobRequirementView[],
  necessity: ExplainableRequirementNecessity,
): readonly ExplainableJobRequirementView[] {
  return requirements.filter((requirement) => requirement.necessity === necessity);
}

export function summarizeJobMatch(jobMatch?: ExplainableJobMatchView): ExplainabilitySummary | null {
  if (!jobMatch) return null;

  const statusCounts: Record<ExplainableRequirementStatus, number> = {
    MATCH: 0,
    POTENTIAL_MATCH: 0,
    GAP: 0,
    UNKNOWN: 0,
    BLOCKER: 0,
  };

  jobMatch.requirements.forEach((requirement) => {
    statusCounts[requirement.status] += 1;
  });

  return {
    totalRequirements: jobMatch.requirements.length,
    statusCounts,
    required: byNecessity(jobMatch.requirements, 'REQUIRED'),
    preferred: byNecessity(jobMatch.requirements, 'PREFERRED'),
    unknownNecessity: byNecessity(jobMatch.requirements, 'UNKNOWN'),
  };
}
