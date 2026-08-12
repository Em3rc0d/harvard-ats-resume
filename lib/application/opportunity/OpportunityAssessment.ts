export const OPPORTUNITY_ASSESSMENT_POLICY_VERSION = 'market-opportunity-assessment-v1' as const;

const READY_NOW_MIN_SCORE = 70;
const STRONG_STRETCH_MIN_SCORE = 70;
const BUILDABLE_MIN_SCORE = 45;

export type OpportunityRecommendation =
  | 'READY_NOW'
  | 'STRONG_STRETCH'
  | 'BUILDABLE'
  | 'ASPIRATIONAL'
  | 'LOW_ALIGNMENT';

export type OpportunityApplicationDecision =
  | 'YES'
  | 'CONSIDER'
  | 'NOT_YET'
  | 'FUTURE_TARGET'
  | 'NO';

export type OpportunityAction =
  | 'APPLY'
  | 'APPLY_WITH_CAUTION'
  | 'BUILD_FIRST'
  | 'PLAN_PATH'
  | 'DEPRIORITIZE';

export type OpportunityEligibility = 'CLEAR' | 'UNCERTAIN' | 'BLOCKED';
export type OpportunityEvidenceStrength = 'STRONG' | 'MODERATE' | 'LIMITED';
export type OpportunityRequirementStatus = 'MATCH' | 'POTENTIAL_MATCH' | 'GAP' | 'UNKNOWN' | 'BLOCKER';
export type OpportunityRequirementNecessity = 'REQUIRED' | 'PREFERRED' | 'UNKNOWN';

export interface OpportunityRequirementInput {
  readonly id: string;
  readonly statement: string;
  readonly kind: string;
  readonly necessity: OpportunityRequirementNecessity;
  readonly status: OpportunityRequirementStatus;
  readonly evidence?: readonly { readonly statement: string }[];
}

export interface OpportunityMatchInput {
  readonly score: number;
  readonly requirements: readonly OpportunityRequirementInput[];
}

export interface OpportunityRequirementSignal {
  readonly id: string;
  readonly statement: string;
  readonly kind: string;
  readonly necessity: OpportunityRequirementNecessity;
  readonly status: OpportunityRequirementStatus;
  readonly evidenceStatements: readonly string[];
}

export interface OpportunityAssessment {
  readonly policyVersion: typeof OPPORTUNITY_ASSESSMENT_POLICY_VERSION;
  readonly recommendation: OpportunityRecommendation;
  readonly shouldApply: OpportunityApplicationDecision;
  readonly nextAction: OpportunityAction;
  readonly eligibility: OpportunityEligibility;
  readonly evidenceStrength: OpportunityEvidenceStrength;
  readonly rationale: string;
  readonly jobMatchScore: number;
  readonly requiredCoverage: number | null;
  readonly preferredCoverage: number | null;
  readonly strongEvidence: readonly OpportunityRequirementSignal[];
  readonly transferableEvidence: readonly OpportunityRequirementSignal[];
  readonly criticalGaps: readonly OpportunityRequirementSignal[];
  readonly optionalGaps: readonly OpportunityRequirementSignal[];
  readonly uncertainties: readonly OpportunityRequirementSignal[];
  readonly basis: {
    readonly totalRequirements: number;
    readonly requiredRequirements: number;
    readonly preferredRequirements: number;
    readonly unknownNecessityRequirements: number;
  };
  readonly scopeBoundary: string;
}

function statusValue(status: OpportunityRequirementStatus): number {
  if (status === 'MATCH') return 1;
  if (status === 'POTENTIAL_MATCH') return 0.5;
  return 0;
}

function coverage(requirements: readonly OpportunityRequirementInput[]): number | null {
  if (requirements.length === 0) return null;
  const earned = requirements.reduce((sum, requirement) => sum + statusValue(requirement.status), 0);
  return Math.round((earned / requirements.length) * 100);
}

function signal(requirement: OpportunityRequirementInput): OpportunityRequirementSignal {
  return {
    id: requirement.id,
    statement: requirement.statement,
    kind: requirement.kind,
    necessity: requirement.necessity,
    status: requirement.status,
    evidenceStatements: (requirement.evidence ?? []).map((item) => item.statement),
  };
}

function evidenceStrength(score: number): OpportunityEvidenceStrength {
  if (score >= 75) return 'STRONG';
  if (score >= 45) return 'MODERATE';
  return 'LIMITED';
}

function classify(
  match: OpportunityMatchInput,
  required: readonly OpportunityRequirementInput[],
  criticalGaps: readonly OpportunityRequirementInput[],
  requiredBlockers: readonly OpportunityRequirementInput[],
  supportCount: number,
  requiredCoverage: number | null,
): OpportunityRecommendation {
  if (requiredBlockers.length > 0) return 'LOW_ALIGNMENT';

  const allRequiredMatch =
    required.length > 0 &&
    required.every((requirement) => requirement.status === 'MATCH');

  // READY_NOW requires both full REQUIRED support and enough overall evidence
  // alignment to avoid a false-ready label when the role contains many other
  // material preferred/contextual requirements the candidate does not support.
  if (allRequiredMatch && match.score >= READY_NOW_MIN_SCORE) {
    return 'READY_NOW';
  }

  if (allRequiredMatch) {
    return match.score >= 50 ? 'STRONG_STRETCH' : 'BUILDABLE';
  }

  if (required.length > 0) {
    const allowedCriticalGaps = Math.max(1, Math.floor(required.length * 0.25));
    if (
      match.score >= STRONG_STRETCH_MIN_SCORE &&
      (requiredCoverage ?? 0) >= 50 &&
      criticalGaps.length <= allowedCriticalGaps
    ) {
      return 'STRONG_STRETCH';
    }

    if (
      match.score >= BUILDABLE_MIN_SCORE &&
      supportCount > 0 &&
      (requiredCoverage ?? 0) >= 25
    ) {
      return 'BUILDABLE';
    }

    if (supportCount > 0) return 'ASPIRATIONAL';
    return 'LOW_ALIGNMENT';
  }

  // Without explicit REQUIRED requirements the engine refuses to claim
  // READY_NOW. It can still offer a conservative direction from overall match.
  if (match.score >= 75 && supportCount > 0) return 'STRONG_STRETCH';
  if (match.score >= 50 && supportCount > 0) return 'BUILDABLE';
  if (supportCount > 0) return 'ASPIRATIONAL';
  return 'LOW_ALIGNMENT';
}

function decision(recommendation: OpportunityRecommendation): {
  readonly shouldApply: OpportunityApplicationDecision;
  readonly nextAction: OpportunityAction;
} {
  switch (recommendation) {
    case 'READY_NOW':
      return { shouldApply: 'YES', nextAction: 'APPLY' };
    case 'STRONG_STRETCH':
      return { shouldApply: 'CONSIDER', nextAction: 'APPLY_WITH_CAUTION' };
    case 'BUILDABLE':
      return { shouldApply: 'NOT_YET', nextAction: 'BUILD_FIRST' };
    case 'ASPIRATIONAL':
      return { shouldApply: 'FUTURE_TARGET', nextAction: 'PLAN_PATH' };
    default:
      return { shouldApply: 'NO', nextAction: 'DEPRIORITIZE' };
  }
}

function rationaleFor(
  recommendation: OpportunityRecommendation,
  match: OpportunityMatchInput,
  required: readonly OpportunityRequirementInput[],
  requiredCoverage: number | null,
  criticalGaps: readonly OpportunityRequirementInput[],
  requiredBlockers: readonly OpportunityRequirementInput[],
  requiredUnknowns: readonly OpportunityRequirementInput[],
): string {
  if (requiredBlockers.length > 0) {
    return `Candidate evidence conflicts with ${requiredBlockers.length} explicit required constraint(s). Resolve those blockers before treating this opportunity as an efficient application target.`;
  }

  if (recommendation === 'READY_NOW') {
    return `Candidate evidence fully supports all ${required.length} explicit required requirement(s), with ${match.score}/100 overall evidence alignment. No required gaps, blockers, or unresolved required requirements were found.`;
  }

  if (required.length === 0) {
    if (recommendation === 'STRONG_STRETCH') {
      return `No explicit REQUIRED requirements were extracted, so READY_NOW is intentionally withheld. Overall evidence alignment is ${match.score}/100 and the opportunity may still be reasonable to explore.`;
    }
    if (recommendation === 'BUILDABLE') {
      return `The job description did not yield explicit REQUIRED requirements. Overall evidence alignment is ${match.score}/100, which shows meaningful overlap but not enough basis for a ready-now recommendation.`;
    }
    if (recommendation === 'ASPIRATIONAL') {
      return 'Some related candidate evidence exists, but the job description does not provide enough strong, explicit requirement alignment for an efficient immediate application.';
    }
    return 'The available candidate evidence provides too little support for the extracted opportunity requirements to recommend prioritizing this application.';
  }

  if (recommendation === 'STRONG_STRETCH') {
    return `Evidence covers ${requiredCoverage ?? 0}% of explicit required requirements at full or partial strength, with ${criticalGaps.length} required gap(s), ${requiredUnknowns.length} unresolved required item(s), and no blocker. Overall evidence alignment is ${match.score}/100, so the candidature is reasonable but the gaps should be understood before applying.`;
  }

  if (recommendation === 'BUILDABLE') {
    return `The role has meaningful evidence overlap, but current support covers ${requiredCoverage ?? 0}% of explicit required requirements with ${match.score}/100 overall alignment and leaves ${criticalGaps.length} required gap(s). Strengthen the concrete gaps before treating this as a primary target.`;
  }

  if (recommendation === 'ASPIRATIONAL') {
    return `Some transferable evidence exists, but current support covers only ${requiredCoverage ?? 0}% of explicit required requirements. Treat this as a future-direction signal and plan the missing capabilities.`;
  }

  return `Current candidate evidence does not materially support the explicit required requirements for this opportunity (${requiredCoverage ?? 0}% evidence coverage).`;
}

/**
 * Converts an evidence-backed Job Match into an application decision.
 *
 * This is a derived recommendation only. It does not create candidate truth,
 * predict hiring probability, or claim that an employer/ATS will accept the
 * application. Job requirements remain market truth throughout the process.
 */
export function assessOpportunity(match: OpportunityMatchInput): OpportunityAssessment {
  if (match.requirements.length === 0) {
    throw new Error('OpportunityAssessment requires at least one extracted job requirement.');
  }

  const required = match.requirements.filter((item) => item.necessity === 'REQUIRED');
  const preferred = match.requirements.filter((item) => item.necessity === 'PREFERRED');
  const unknownNecessity = match.requirements.filter((item) => item.necessity === 'UNKNOWN');

  const strongEvidence = match.requirements.filter((item) => item.status === 'MATCH');
  const transferableEvidence = match.requirements.filter((item) => item.status === 'POTENTIAL_MATCH');
  const criticalGaps = required.filter((item) => item.status === 'GAP' || item.status === 'BLOCKER');
  const optionalGaps = preferred.filter((item) => item.status === 'GAP' || item.status === 'BLOCKER');
  const uncertainties = match.requirements.filter((item) => item.status === 'UNKNOWN');
  const requiredBlockers = required.filter((item) => item.status === 'BLOCKER');
  const requiredUnknowns = required.filter((item) => item.status === 'UNKNOWN');
  const supportCount = strongEvidence.length + transferableEvidence.length;
  const requiredCoverage = coverage(required);
  const preferredCoverage = coverage(preferred);

  const recommendation = classify(
    match,
    required,
    criticalGaps,
    requiredBlockers,
    supportCount,
    requiredCoverage,
  );
  const applicationDecision = decision(recommendation);

  return {
    policyVersion: OPPORTUNITY_ASSESSMENT_POLICY_VERSION,
    recommendation,
    shouldApply: applicationDecision.shouldApply,
    nextAction: applicationDecision.nextAction,
    eligibility: requiredBlockers.length > 0
      ? 'BLOCKED'
      : requiredUnknowns.length > 0
        ? 'UNCERTAIN'
        : 'CLEAR',
    evidenceStrength: evidenceStrength(match.score),
    rationale: rationaleFor(
      recommendation,
      match,
      required,
      requiredCoverage,
      criticalGaps,
      requiredBlockers,
      requiredUnknowns,
    ),
    jobMatchScore: Math.round(match.score),
    requiredCoverage,
    preferredCoverage,
    strongEvidence: strongEvidence.map(signal),
    transferableEvidence: transferableEvidence.map(signal),
    criticalGaps: criticalGaps.map(signal),
    optionalGaps: optionalGaps.map(signal),
    uncertainties: uncertainties.map(signal),
    basis: {
      totalRequirements: match.requirements.length,
      requiredRequirements: required.length,
      preferredRequirements: preferred.length,
      unknownNecessityRequirements: unknownNecessity.length,
    },
    scopeBoundary: 'Evidence-based application guidance only. This is not a hiring probability, recruiter decision, or score from a commercial ATS.',
  };
}
