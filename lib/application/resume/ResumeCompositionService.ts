import { createHash } from 'node:crypto';
import {
  createClaimLedger,
  createResumeManifest,
  createResumeVersion,
  domainId,
  registerResumeClaim,
  type CandidateProfileId,
  type CareerAssertion,
  type JobDescriptionId,
  type MatchReportId,
  type ResumeClaim,
  type ResumeClaimId,
  type ResumeGenerationMetadata,
  type ResumeManifest,
  type ResumeVersion,
} from '../../domain';

export interface ResumeCompositionInput {
  readonly formattedResume: string;
  readonly candidateProfileId: CandidateProfileId;
  readonly assertions: readonly CareerAssertion[];
  readonly targetedJobDescriptionId?: JobDescriptionId;
  readonly targetJobDescription?: string;
  readonly matchReportId?: MatchReportId;
  readonly generation: ResumeGenerationMetadata;
  readonly createdAt?: string;
}

export interface RuntimeResumeComposition {
  readonly version: ResumeVersion;
  readonly manifest: ResumeManifest;
  readonly claims: readonly ResumeClaim[];
  readonly renderedResume: string;
  readonly persistence: 'EPHEMERAL_RUNTIME';
}

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

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'under',
  'through', 'using', 'used', 'while', 'where', 'which', 'their', 'there', 'your',
  'our', 'his', 'her', 'its', 'was', 'were', 'are', 'has', 'have', 'had', 'been',
  'being', 'than', 'then', 'also', 'across', 'within', 'without', 'about', 'work',
  'worked', 'experience', 'professional', 'candidate', 'role', 'company', 'project',
  'projects', 'skills', 'skill', 'technical', 'summary', 'responsible', 'including',
  'focused', 'focus', 'at', 'as', 'to', 'on', 'in', 'of', 'a', 'an',
  'con', 'para', 'por', 'del', 'las', 'los', 'una', 'uno', 'como', 'desde', 'hasta',
  'sobre', 'entre', 'donde', 'que', 'experiencia', 'profesional', 'trabajo',
  'proyecto', 'proyectos', 'habilidad', 'habilidades', 'incluyendo', 'en', 'de',
]);

const DELIVERY_TERMS = new Set([
  'built', 'build', 'developed', 'develop', 'implemented', 'implement', 'created',
  'create', 'engineered', 'engineer', 'delivered', 'deliver', 'constructed',
  'construi', 'construir', 'desarrolle', 'desarrollar', 'implemente', 'implementar',
  'cree', 'crear', 'entregue', 'entregar',
]);

const LEADERSHIP_TERMS = new Set([
  'led', 'lead', 'leading', 'managed', 'manage', 'directed', 'direct', 'oversaw',
  'oversee', 'supervised', 'supervise', 'spearheaded', 'spearhead', 'drove', 'drive',
  'lidere', 'lidero', 'liderar', 'gestione', 'gestionar', 'dirigi', 'dirigir',
]);

const DESIGN_TERMS = new Set([
  'designed', 'design', 'modeled', 'modelled', 'disene', 'disenar', 'modele', 'modelar',
]);

const ARCHITECTURE_TERMS = new Set([
  'architected', 'architect', 'architecture', 'architectural',
  'arquitecte', 'arquitectar', 'arquitectura', 'arquitectonico', 'arquitectonica',
]);

const OWNERSHIP_TERMS = new Set([
  'owned', 'own', 'ownership', 'accountable', 'accountability',
  'responsable', 'responsabilidad', 'propietario',
]);

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalToken(token: string): string {
  if (DELIVERY_TERMS.has(token)) return 'delivery';
  if (LEADERSHIP_TERMS.has(token)) return 'leadership';
  if (DESIGN_TERMS.has(token)) return 'design';
  if (ARCHITECTURE_TERMS.has(token)) return 'architecture';
  if (OWNERSHIP_TERMS.has(token)) return 'ownership';
  return token;
}

function meaningfulTokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .replace(/[^a-z0-9+#./\-\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.replace(/^[^a-z0-9+#]+|[^a-z0-9+#]+$/g, ''))
      .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
      .map(canonicalToken),
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function overlap(left: ReadonlySet<string>, right: ReadonlySet<string>): { score: number; count: number } {
  if (left.size === 0 || right.size === 0) return { score: 0, count: 0 };

  let count = 0;
  left.forEach((token) => {
    if (right.has(token)) count += 1;
  });

  return {
    count,
    score: count / Math.min(left.size, right.size),
  };
}

function isDateOnlyLine(line: string): boolean {
  return /^[\s\d.,/\-–—]+(?:present|current|actual|presente)?[\s\d.,/\-–—]*$/i.test(line.trim());
}

function isPresentationLine(line: string, nonEmptyIndex: number): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;

  const normalized = normalize(trimmed.replace(/^[-•*]\s*/, ''));
  if (SECTION_HEADINGS.has(normalized)) return true;
  if (nonEmptyIndex === 0) return true;
  if (/@|https?:\/\//i.test(trimmed)) return true;
  if (isDateOnlyLine(trimmed)) return true;
  return false;
}

function materialClaimLines(formattedResume: string): string[] {
  let nonEmptyIndex = -1;

  return formattedResume
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      nonEmptyIndex += 1;
      return !isPresentationLine(line, nonEmptyIndex);
    })
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter((line) => line.length >= 2);
}

function supportingAssertions(
  claim: string,
  assertions: readonly CareerAssertion[],
): readonly CareerAssertion[] {
  const claimTokens = meaningfulTokens(claim);

  const ranked = assertions
    .map((assertion) => {
      const assertionTokens = meaningfulTokens(assertion.statement);
      const result = overlap(claimTokens, assertionTokens);
      return { assertion, ...result };
    })
    .filter((item) => {
      if (item.score < 0.5) return false;
      if (item.count >= 2) return true;
      return claimTokens.size <= 2 && item.count === 1;
    })
    .sort((a, b) => b.score - a.score || b.count - a.count);

  const best = ranked[0]?.score ?? 0;
  return ranked
    .filter((item) => item.score >= Math.max(0.5, best - 0.15))
    .map((item) => item.assertion);
}

function assertionProvenanceHash(assertions: readonly CareerAssertion[]): string {
  return sha256(
    assertions
      .map((assertion) => assertion.id)
      .sort()
      .join('|'),
  );
}

function createGeneratedClaims(
  formattedResume: string,
  assertions: readonly CareerAssertion[],
  contentSha256: string,
): readonly ResumeClaim[] {
  const lines = materialClaimLines(formattedResume);

  if (lines.length === 0) {
    throw new Error('Resume composition found no material candidate claims in the approved resume.');
  }

  let ledger = createClaimLedger(assertions);

  lines.forEach((wording, index) => {
    const support = supportingAssertions(wording, assertions);

    if (support.length === 0) {
      throw new Error(`Resume composition cannot trace approved wording to candidate assertions: ${wording}`);
    }

    const provenanceIdentity = assertionProvenanceHash(support).slice(0, 12);
    const claimId = domainId(
      'ResumeClaim',
      `generated-claim:${contentSha256.slice(0, 16)}:${provenanceIdentity}:${String(index + 1).padStart(3, '0')}`,
    );

    ledger = registerResumeClaim(ledger, {
      id: claimId,
      assertionIds: support.map((assertion) => assertion.id),
      wording,
    });
  });

  return Array.from(ledger.claimsById.values());
}

function claimProvenanceHash(claims: readonly ResumeClaim[]): string {
  return sha256(
    claims
      .map((claim) => `${claim.id}:${[...claim.assertionIds].sort().join(',')}`)
      .join('|'),
  );
}

/**
 * Materializes an already-grounded generated resume into a content-addressed,
 * provenance-sensitive runtime ResumeVersion and full provenance manifest.
 * Callers must run deterministic and semantic grounding first. The exact same
 * content/target can receive a distinct logical version when its supporting
 * CareerAssertion provenance changes, preventing history from being overwritten.
 */
export function composeApprovedResumeVersion(
  input: ResumeCompositionInput,
): RuntimeResumeComposition {
  if (!input.formattedResume.trim()) {
    throw new Error('Resume composition requires approved formatted resume content.');
  }

  if (input.assertions.length === 0) {
    throw new Error('Resume composition requires candidate assertions.');
  }

  const hasTargetId = Boolean(input.targetedJobDescriptionId);
  const hasTargetText = Boolean(input.targetJobDescription?.trim());
  if (hasTargetId !== hasTargetText) {
    throw new Error('Resume composition target id and target text must either both be present or both be absent.');
  }

  const contentSha256 = sha256(input.formattedResume);
  const targetJobDescriptionSha256 = input.targetJobDescription?.trim()
    ? sha256(input.targetJobDescription)
    : undefined;
  const targetIdentity = targetJobDescriptionSha256?.slice(0, 16) ?? 'general';
  const claims = createGeneratedClaims(input.formattedResume, input.assertions, contentSha256);
  const provenanceIdentity = claimProvenanceHash(claims).slice(0, 16);
  const versionId = domainId(
    'ResumeVersion',
    `resume-version:${contentSha256.slice(0, 24)}:${targetIdentity}:${provenanceIdentity}`,
  );
  const claimIds: ResumeClaimId[] = claims.map((claim) => claim.id);
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));

  const version = createResumeVersion({
    id: versionId,
    candidateProfileId: input.candidateProfileId,
    targetedJobDescriptionId: input.targetedJobDescriptionId,
    targetJobDescriptionSha256,
    matchReportId: input.matchReportId,
    claimIds,
    contentSha256,
    generation: input.generation,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });

  const manifest = createResumeManifest({
    id: domainId(
      'ResumeManifest',
      `resume-manifest:${contentSha256.slice(0, 24)}:${targetIdentity}:${provenanceIdentity}`,
    ),
    resumeVersionId: version.id,
    entries: claims.map((claim) => ({
      claimId: claim.id,
      assertionIds: claim.assertionIds,
    })),
  }, claimsById);

  return {
    version,
    manifest,
    claims,
    renderedResume: input.formattedResume,
    persistence: 'EPHEMERAL_RUNTIME',
  };
}
