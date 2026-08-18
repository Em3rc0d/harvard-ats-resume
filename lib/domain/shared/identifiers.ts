export type DomainId<TScope extends string> = string & { readonly __scope: TScope };

export type CandidateProfileId = DomainId<'CandidateProfile'>;
export type CareerSourceId = DomainId<'CareerSource'>;
export type CareerEvidenceId = DomainId<'CareerEvidence'>;
export type CareerAssertionId = DomainId<'CareerAssertion'>;
export type CareerSnapshotId = DomainId<'CareerSnapshot'>;
export type CareerTargetId = DomainId<'CareerTarget'>;
export type MarketSourceId = DomainId<'MarketSource'>;
export type MarketObservationId = DomainId<'MarketObservation'>;
export type ObservationOccurrenceId = DomainId<'ObservationOccurrence'>;
export type DerivedMarketInterpretationId = DomainId<'DerivedMarketInterpretation'>;
export type MarketJobProjectionId = DomainId<'MarketJobProjection'>;
export type MarketOpportunityId = DomainId<'MarketOpportunity'>;
export type MarketOpportunityLinkId = DomainId<'MarketOpportunityLink'>;
export type MarketCandidateSetId = DomainId<'MarketCandidateSet'>;
export type JobDescriptionId = DomainId<'JobDescription'>;
export type JobRequirementId = DomainId<'JobRequirement'>;
export type JobSnapshotId = DomainId<'JobSnapshot'>;
export type RequirementMatchId = DomainId<'RequirementMatch'>;
export type MatchReportId = DomainId<'MatchReport'>;
export type OpportunityAssessmentId = DomainId<'OpportunityAssessment'>;
export type OpportunitySpaceId = DomainId<'OpportunitySpace'>;
export type ResumeClaimId = DomainId<'ResumeClaim'>;
export type ResumeVersionId = DomainId<'ResumeVersion'>;
export type ResumeManifestId = DomainId<'ResumeManifest'>;

const NON_EMPTY_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]*$/;

export function domainId<TScope extends string>(
  scope: TScope,
  value: string,
): DomainId<TScope> {
  if (!NON_EMPTY_ID.test(value)) {
    throw new Error(`${scope} id must be non-empty and stable: ${value}`);
  }

  return value as DomainId<TScope>;
}

export function uniqueIds(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}
