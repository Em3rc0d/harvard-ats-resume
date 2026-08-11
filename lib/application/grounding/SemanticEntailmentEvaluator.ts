import type { CareerAssertion } from '../../domain';

export type SemanticEntailmentVerdict =
  | 'ENTAILED'
  | 'PARTIALLY_ENTAILED'
  | 'NOT_ENTAILED'
  | 'INDETERMINATE';

export type SemanticGroundingStatus =
  | 'APPROVED'
  | 'NEEDS_USER_CONFIRMATION'
  | 'REJECTED';

export type SemanticEntailmentIssueKind =
  | 'RESPONSIBILITY_ESCALATION'
  | 'OWNERSHIP_ESCALATION'
  | 'DESIGN_ESCALATION'
  | 'ARCHITECTURE_ESCALATION'
  | 'UNSUPPORTED_SCOPE_QUALIFIER'
  | 'UNSUPPORTED_IMPACT_QUALIFIER';

export interface SemanticEntailmentIssue {
  readonly kind: SemanticEntailmentIssueKind;
  readonly verdict: Exclude<SemanticEntailmentVerdict, 'ENTAILED'>;
  readonly generatedClaim: string;
  readonly unsupportedTerms: readonly string[];
  readonly supportingAssertionIds: readonly string[];
  readonly message: string;
}

export interface SemanticEntailmentClaimEvaluation {
  readonly generatedClaim: string;
  readonly verdict: SemanticEntailmentVerdict;
  readonly supportingAssertionIds: readonly string[];
  readonly issues: readonly SemanticEntailmentIssue[];
}

export interface SemanticGroundingReport {
  readonly status: SemanticGroundingStatus;
  readonly evaluatedClaims: readonly SemanticEntailmentClaimEvaluation[];
  readonly issues: readonly SemanticEntailmentIssue[];
  readonly coverage: {
    readonly generatedNarrativeClaims: number;
    readonly highRiskClaimsEvaluated: number;
    readonly candidateAssertionsAvailable: number;
  };
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'under',
  'through', 'using', 'used', 'while', 'where', 'which', 'their', 'there', 'your',
  'our', 'his', 'her', 'its', 'was', 'were', 'are', 'has', 'have', 'had', 'been',
  'being', 'than', 'then', 'also', 'across', 'within', 'without', 'about', 'work',
  'worked', 'experience', 'professional', 'candidate', 'role', 'company', 'project',
  'projects', 'skills', 'skill', 'technical', 'summary', 'responsible', 'including',
  'con', 'para', 'por', 'del', 'las', 'los', 'una', 'uno', 'como', 'desde', 'hasta',
  'sobre', 'entre', 'donde', 'que', 'experiencia', 'profesional', 'trabajo',
  'proyecto', 'proyectos', 'habilidad', 'habilidades', 'incluyendo',
]);

const SECTION_HEADINGS = new Set([
  'professional summary',
  'summary',
  'experience',
  'work experience',
  'education',
  'projects',
  'certifications',
  'languages',
  'skills',
]);

const CONTRIBUTION_TERMS = new Set([
  'participated', 'participate', 'contributed', 'contribute', 'supported', 'support',
  'helped', 'help', 'collaborated', 'collaborate', 'assisted', 'assist',
  'participe', 'participar', 'contribui', 'contribuir', 'apoye', 'apoyar',
  'colabore', 'colaborar', 'asisti', 'asistir',
]);

const DELIVERY_TERMS = new Set([
  'built', 'build', 'developed', 'develop', 'implemented', 'implement', 'created',
  'create', 'engineered', 'engineer', 'delivered', 'deliver', 'constructed',
  'construí', 'construir', 'desarrolle', 'desarrollar', 'implemente', 'implementar',
  'cree', 'crear', 'entregue', 'entregar',
].map(normalizeToken));

const LEADERSHIP_TERMS = new Set([
  'led', 'lead', 'leading', 'managed', 'manage', 'directed', 'direct', 'oversaw',
  'oversee', 'supervised', 'supervise', 'spearheaded', 'spearhead', 'drove', 'drive',
  'lideré', 'lidero', 'liderar', 'gestione', 'gestionar', 'dirigi', 'dirigir',
  'supervise', 'supervisar', 'impulse', 'impulsar',
].map(normalizeToken));

const OWNERSHIP_TERMS = new Set([
  'owned', 'own', 'ownership', 'accountable', 'accountability',
  'responsable', 'responsabilidad', 'propietario',
].map(normalizeToken));

const DESIGN_TERMS = new Set([
  'designed', 'design', 'modeled', 'modelled', 'modeled', 'designed',
  'diseñe', 'disene', 'diseñar', 'disenar', 'modele', 'modelar',
].map(normalizeToken));

const ARCHITECTURE_TERMS = new Set([
  'architected', 'architect', 'architecture', 'architectural',
  'arquitecte', 'arquitectar', 'arquitectura', 'arquitectonico', 'arquitectonica',
].map(normalizeToken));

const SCOPE_QUALIFIERS = new Set([
  'enterprise-wide', 'enterprise', 'company-wide', 'organization-wide', 'global',
  'large-scale', 'large', 'scalable', 'distributed', 'mission-critical',
  'production-grade', 'high-performance', 'high-availability', 'fault-tolerant',
  'cross-functional', 'end-to-end', 'strategic',
  'empresarial', 'corporativo', 'global', 'gran-escala', 'escalable', 'distribuido',
  'distribuida', 'critico', 'critica', 'alto-rendimiento', 'alta-disponibilidad',
  'multifuncional', 'estrategico', 'estrategica',
].map(normalizeToken));

const IMPACT_QUALIFIERS = new Set([
  'significant', 'significantly', 'substantial', 'substantially', 'dramatic',
  'dramatically', 'major', 'material', 'materially', 'transformative', 'critical',
  'significativo', 'significativamente', 'sustancial', 'sustancialmente',
  'drastico', 'drastica', 'dramaticamente', 'transformador', 'transformadora',
].map(normalizeToken));

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeToken(value: string): string {
  return normalize(value).replace(/[^a-z0-9+#./-]/g, '');
}

function tokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .replace(/[^a-z0-9+#./\-\s]/g, ' ')
      .split(/\s+/)
      .map(normalizeToken)
      .filter((token) => token.length >= 3 && !STOPWORDS.has(token)),
  );
}

function hasAnyToken(valueTokens: ReadonlySet<string>, terms: ReadonlySet<string>): boolean {
  for (const term of terms) {
    if (valueTokens.has(term)) return true;
  }
  return false;
}

function termsPresent(valueTokens: ReadonlySet<string>, terms: ReadonlySet<string>): string[] {
  return Array.from(terms).filter((term) => valueTokens.has(term));
}

function isNarrativeClaim(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 12) return false;
  if (/@|https?:\/\//i.test(trimmed)) return false;

  const normalized = normalize(trimmed.replace(/^[-•*]\s*/, ''));
  if (!normalized || SECTION_HEADINGS.has(normalized)) return false;
  if (trimmed === trimmed.toUpperCase() && /[A-ZÀ-Ý]/.test(trimmed)) return false;

  // Contact/header and compact label-value lines are handled by deterministic grounding.
  if (/^[^:]{1,24}:\s*\S/.test(trimmed) && !/^[-•*]/.test(trimmed)) return false;
  return true;
}

function canonicalToken(token: string): string {
  if (CONTRIBUTION_TERMS.has(token)) return 'contribution';
  if (DELIVERY_TERMS.has(token)) return 'delivery';
  if (LEADERSHIP_TERMS.has(token)) return 'leadership';
  if (OWNERSHIP_TERMS.has(token)) return 'ownership';
  if (DESIGN_TERMS.has(token)) return 'design';
  if (ARCHITECTURE_TERMS.has(token)) return 'architecture';
  return token;
}

function canonicalTokens(value: string): Set<string> {
  return new Set(Array.from(tokens(value)).map(canonicalToken));
}

function overlapScore(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  left.forEach((token) => {
    if (right.has(token)) intersection += 1;
  });
  return intersection / Math.min(left.size, right.size);
}

function supportAssertionsForClaim(
  claim: string,
  assertions: readonly CareerAssertion[],
): readonly CareerAssertion[] {
  const claimTokens = canonicalTokens(claim);
  const ranked = assertions
    .map((assertion) => ({
      assertion,
      score: overlapScore(claimTokens, canonicalTokens(assertion.statement)),
    }))
    .filter((item) => item.score >= 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return ranked.map((item) => item.assertion);
}

function makeIssue(
  kind: SemanticEntailmentIssueKind,
  verdict: Exclude<SemanticEntailmentVerdict, 'ENTAILED'>,
  generatedClaim: string,
  unsupportedTerms: readonly string[],
  support: readonly CareerAssertion[],
  message: string,
): SemanticEntailmentIssue {
  return {
    kind,
    verdict,
    generatedClaim,
    unsupportedTerms,
    supportingAssertionIds: support.map((assertion) => assertion.id),
    message,
  };
}

function evaluateHighRiskClaim(
  generatedClaim: string,
  support: readonly CareerAssertion[],
): SemanticEntailmentClaimEvaluation {
  const generatedTokens = tokens(generatedClaim);
  const supportText = support.map((assertion) => assertion.statement).join(' ');
  const supportTokens = tokens(supportText);
  const issues: SemanticEntailmentIssue[] = [];

  const generatedLeadership = termsPresent(generatedTokens, LEADERSHIP_TERMS);
  if (generatedLeadership.length > 0 && !hasAnyToken(supportTokens, LEADERSHIP_TERMS)) {
    issues.push(makeIssue(
      'RESPONSIBILITY_ESCALATION',
      support.length === 0 ? 'INDETERMINATE' : 'NOT_ENTAILED',
      generatedClaim,
      generatedLeadership,
      support,
      support.length === 0
        ? 'Leadership wording was generated but no sufficiently related candidate assertion was found.'
        : 'Leadership wording is stronger than the related candidate assertions support.',
    ));
  }

  const generatedOwnership = termsPresent(generatedTokens, OWNERSHIP_TERMS);
  if (
    generatedOwnership.length > 0 &&
    !hasAnyToken(supportTokens, OWNERSHIP_TERMS) &&
    !hasAnyToken(supportTokens, LEADERSHIP_TERMS)
  ) {
    issues.push(makeIssue(
      'OWNERSHIP_ESCALATION',
      support.length === 0 ? 'INDETERMINATE' : 'NOT_ENTAILED',
      generatedClaim,
      generatedOwnership,
      support,
      'Ownership/accountability wording is not supported by the related candidate assertions.',
    ));
  }

  const generatedArchitecture = termsPresent(generatedTokens, ARCHITECTURE_TERMS);
  if (generatedArchitecture.length > 0 && !hasAnyToken(supportTokens, ARCHITECTURE_TERMS)) {
    issues.push(makeIssue(
      'ARCHITECTURE_ESCALATION',
      support.length === 0 ? 'INDETERMINATE' : 'NOT_ENTAILED',
      generatedClaim,
      generatedArchitecture,
      support,
      'Architecture-level responsibility is not supported by the related candidate assertions.',
    ));
  }

  const generatedDesign = termsPresent(generatedTokens, DESIGN_TERMS);
  if (
    generatedDesign.length > 0 &&
    !hasAnyToken(supportTokens, DESIGN_TERMS) &&
    !hasAnyToken(supportTokens, ARCHITECTURE_TERMS)
  ) {
    issues.push(makeIssue(
      'DESIGN_ESCALATION',
      support.length === 0 ? 'INDETERMINATE' : 'NOT_ENTAILED',
      generatedClaim,
      generatedDesign,
      support,
      'Design responsibility is not supported by the related candidate assertions.',
    ));
  }

  const unsupportedScope = termsPresent(generatedTokens, SCOPE_QUALIFIERS)
    .filter((term) => !supportTokens.has(term));
  if (unsupportedScope.length > 0) {
    issues.push(makeIssue(
      'UNSUPPORTED_SCOPE_QUALIFIER',
      support.length === 0 ? 'INDETERMINATE' : 'PARTIALLY_ENTAILED',
      generatedClaim,
      unsupportedScope,
      support,
      'Generated scope/scale qualifiers are not present in the related candidate assertions.',
    ));
  }

  const unsupportedImpact = termsPresent(generatedTokens, IMPACT_QUALIFIERS)
    .filter((term) => !supportTokens.has(term));
  if (unsupportedImpact.length > 0) {
    issues.push(makeIssue(
      'UNSUPPORTED_IMPACT_QUALIFIER',
      support.length === 0 ? 'INDETERMINATE' : 'PARTIALLY_ENTAILED',
      generatedClaim,
      unsupportedImpact,
      support,
      'Generated impact-strength wording is not present in the related candidate assertions.',
    ));
  }

  const verdict: SemanticEntailmentVerdict = issues.some((issue) => issue.verdict === 'NOT_ENTAILED')
    ? 'NOT_ENTAILED'
    : issues.some((issue) => issue.verdict === 'INDETERMINATE')
      ? 'INDETERMINATE'
      : issues.some((issue) => issue.verdict === 'PARTIALLY_ENTAILED')
        ? 'PARTIALLY_ENTAILED'
        : 'ENTAILED';

  return {
    generatedClaim,
    verdict,
    supportingAssertionIds: support.map((assertion) => assertion.id),
    issues,
  };
}

function containsHighRiskSemantics(line: string): boolean {
  const lineTokens = tokens(line);
  return (
    hasAnyToken(lineTokens, LEADERSHIP_TERMS) ||
    hasAnyToken(lineTokens, OWNERSHIP_TERMS) ||
    hasAnyToken(lineTokens, DESIGN_TERMS) ||
    hasAnyToken(lineTokens, ARCHITECTURE_TERMS) ||
    hasAnyToken(lineTokens, SCOPE_QUALIFIERS) ||
    hasAnyToken(lineTokens, IMPACT_QUALIFIERS)
  );
}

/**
 * Conservative semantic-drift guard that runs only after deterministic factual
 * grounding has approved the generated resume. It evaluates high-risk wording
 * (responsibility, ownership, design/architecture, scope and impact strength)
 * against candidate assertions and can never override a deterministic blocker.
 *
 * APPROVED means that this high-risk semantic guard found no unsupported
 * escalation in the claims it evaluated. It is not a universal proof that all
 * open-ended natural-language entailment is correct.
 */
export function evaluateGeneratedResumeSemanticGrounding(
  generatedResume: string,
  assertions: readonly CareerAssertion[],
): SemanticGroundingReport {
  const narrativeClaims = generatedResume
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(isNarrativeClaim);

  const highRiskClaims = narrativeClaims.filter(containsHighRiskSemantics);
  const evaluatedClaims = highRiskClaims.map((claim) =>
    evaluateHighRiskClaim(claim, supportAssertionsForClaim(claim, assertions)),
  );
  const issues = evaluatedClaims.flatMap((evaluation) => evaluation.issues);

  const status: SemanticGroundingStatus = issues.length === 0
    ? 'APPROVED'
    : issues.some((issue) => issue.verdict === 'NOT_ENTAILED')
      ? 'NEEDS_USER_CONFIRMATION'
      : 'NEEDS_USER_CONFIRMATION';

  return {
    status,
    evaluatedClaims,
    issues,
    coverage: {
      generatedNarrativeClaims: narrativeClaims.length,
      highRiskClaimsEvaluated: highRiskClaims.length,
      candidateAssertionsAvailable: assertions.length,
    },
  };
}
