import type { CandidateProfileId, JobDescriptionId, MatchReportId } from '../shared/identifiers';
import type { RequirementMatch } from './RequirementMatch';

export interface MatchReport {
  readonly id: MatchReportId;
  readonly candidateProfileId: CandidateProfileId;
  readonly jobDescriptionId: JobDescriptionId;
  readonly matches: readonly RequirementMatch[];
  readonly generatedAt: string;
}

export function createMatchReport(input: MatchReport): MatchReport {
  return input;
}
