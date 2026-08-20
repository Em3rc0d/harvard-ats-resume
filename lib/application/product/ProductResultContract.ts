import type { OpportunityAssessment } from '../opportunity/OpportunityAssessment';
import type { ProductEvaluation } from './ProductEvaluationService';
import type { TrustedAdviceItem } from './TrustedAdviceService';

export type ExplainableRequirementStatus = 'MATCH' | 'POTENTIAL_MATCH' | 'GAP' | 'UNKNOWN' | 'BLOCKER';
export type ExplainableRequirementNecessity = 'REQUIRED' | 'PREFERRED' | 'UNKNOWN';

export interface AssertionEvidenceView {
  readonly assertionId: string;
  readonly statement: string;
  readonly truthClass: string;
  readonly sourceIds: readonly string[];
  readonly evidenceIds: readonly string[];
}

export interface ExplainableJobRequirementView {
  readonly id: string;
  readonly statement: string;
  readonly kind: string;
  readonly necessity: ExplainableRequirementNecessity;
  readonly canonicalConcept?: string;
  readonly minimumYears?: number;
  readonly status: ExplainableRequirementStatus;
  readonly rationale: string;
  readonly assertionIds: readonly string[];
  readonly evidence: readonly AssertionEvidenceView[];
}

export interface ExplainableJobMatchView {
  readonly score: number;
  readonly language: 'EN' | 'ES' | 'UNKNOWN';
  readonly breakdown: {
    readonly required: { readonly matched: number; readonly total: number };
    readonly preferred: { readonly matched: number; readonly total: number };
    readonly unknown: { readonly matched: number; readonly total: number };
    readonly gaps: number;
    readonly blockers: number;
  };
  readonly requirements: readonly ExplainableJobRequirementView[];
}

export interface ClaimTraceabilityView {
  readonly claimId: string;
  readonly wording: string;
  readonly assertionIds: readonly string[];
  readonly evidence: readonly AssertionEvidenceView[];
}

export interface ResumeVersionView {
  readonly id: string;
  readonly contentSha256: string;
  readonly targetJobDescriptionSha256?: string;
  readonly generation: {
    readonly provider: string;
    readonly model: string;
    readonly contractVersion: string;
  };
  readonly createdAt: string;
}

export interface CareerVaultView {
  readonly schemaVersion: string;
  readonly candidateProfileId: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GeneratedResumeResult {
  readonly formattedResume: string;
  readonly productEvaluation: ProductEvaluation;
  readonly jobMatch?: ExplainableJobMatchView;
  readonly opportunityAssessment?: OpportunityAssessment;
  readonly claimTraceability: readonly ClaimTraceabilityView[];
  readonly resumeVersion: ResumeVersionView;
  readonly resumePersistence: 'DURABLE_CAREER_VAULT';
  readonly careerVault: CareerVaultView;
  readonly trustedAdvice: readonly TrustedAdviceItem[];
  /**
   * Compatibility projection for the existing results surface. Every item must
   * be derived from trustedAdvice.message; model-authored suggestions never
   * enter this field.
   */
  readonly suggestions: readonly string[];
  readonly improvedResume?: string;
  // Legacy compatibility only. The ATS v2 UX must not present this as a single
  // ATS compatibility truth.
  readonly atsScore?: number;
  readonly matchedKeywords?: readonly string[];
  readonly missingKeywords?: readonly string[];
  readonly legacyAnalysis?: {
    readonly status: 'LEGACY_COMPATIBILITY_ONLY';
    readonly atsScore: number;
    readonly matchedKeywords: readonly string[];
    readonly missingKeywords: readonly string[];
  };
}
