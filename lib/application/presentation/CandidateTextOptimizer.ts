import { normalizeCandidatePresentationText } from './InlineCandidateTextCleanup';

export const CANDIDATE_TEXT_OPTIMIZER_POLICY_VERSION = 'candidate-text-optimizer-v1' as const;

export type CandidateTextOptimizationMode =
  | 'FACT_PRESERVING_AI'
  | 'PRESENTATION_ONLY_FALLBACK';

export interface CandidateTextOptimizationProvider {
  optimize(sourceText: string): Promise<string>;
}

export interface CandidateTextOptimizationResult {
  readonly output: string;
  readonly mode: CandidateTextOptimizationMode;
  readonly policyVersion: typeof CANDIDATE_TEXT_OPTIMIZER_POLICY_VERSION;
  readonly changed: boolean;
  readonly fallbackReason?: string;
}

const NUMBER_PATTERN = /(?:[$€£]\s*)?\b\d+(?:[.,]\d+)?%?\b/g;
const URL_PATTERN = /https?:\/\/[^\s]+/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .trim();
}

// Only grammatical/connective vocabulary may be newly introduced. Action verbs,
// scope qualifiers, technologies, outcomes, responsibility words and domain nouns
// must already occur in the candidate-authored source. This intentionally makes
// the optimizer conservative: if a model needs a stronger verb to make the text
// sound better, the rewrite is rejected instead of promoting prose into truth.
const SAFE_GRAMMAR_TOKENS = new Set([
  // English
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on',
  'or', 'the', 'to', 'with', 'while', 'through', 'across', 'within', 'using',
  // Spanish
  'a', 'al', 'con', 'de', 'del', 'desde', 'durante', 'el', 'en', 'entre', 'la',
  'las', 'los', 'para', 'por', 'que', 'y', 'o', 'mediante', 'utilizando', 'usando',
  // French
  'avec', 'dans', 'de', 'des', 'du', 'et', 'en', 'pour', 'par', 'sur', 'via',
  'utilisant',
  // Portuguese
  'a', 'ao', 'com', 'da', 'das', 'de', 'do', 'dos', 'em', 'entre', 'e', 'ou',
  'para', 'por', 'usando', 'utilizando',
].map(normalize));

function tokens(value: string): string[] {
  return normalize(value)
    // Sentence punctuation must never change factual-token identity. Removing
    // dots here also makes `REST.` and `REST` equivalent; dotted technology
    // names such as Next.js remain represented by the same `next` + `js`
    // tokens on both the source and candidate sides.
    .replace(/[.,;:!?()[\]{}]/g, ' ')
    .replace(/[^a-z0-9+#/\-\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizedMatches(value: string, pattern: RegExp): Set<string> {
  return new Set((value.match(pattern) ?? []).map((item) => normalize(item)));
}

function assertNoNovelStructuredFacts(sourceText: string, candidateText: string): void {
  const sourceNumbers = normalizedMatches(sourceText, NUMBER_PATTERN);
  for (const number of normalizedMatches(candidateText, NUMBER_PATTERN)) {
    if (!sourceNumbers.has(number)) {
      throw new Error(`Inline optimizer introduced an unsupported numeric fact: ${number}`);
    }
  }

  const sourceUrls = normalizedMatches(sourceText, URL_PATTERN);
  for (const url of normalizedMatches(candidateText, URL_PATTERN)) {
    if (!sourceUrls.has(url)) {
      throw new Error('Inline optimizer introduced an unsupported URL.');
    }
  }

  const sourceEmails = normalizedMatches(sourceText, EMAIL_PATTERN);
  for (const email of normalizedMatches(candidateText, EMAIL_PATTERN)) {
    if (!sourceEmails.has(email)) {
      throw new Error('Inline optimizer introduced an unsupported email address.');
    }
  }
}

function assertNoNovelDomainVocabulary(sourceText: string, candidateText: string): void {
  const sourceTokens = new Set(tokens(sourceText));
  const candidateTokens = tokens(candidateText);
  const novel = candidateTokens.filter(
    (token) =>
      token.length >= 3 &&
      !sourceTokens.has(token) &&
      !SAFE_GRAMMAR_TOKENS.has(token),
  );

  if (novel.length > 0) {
    const examples = [...new Set(novel)].slice(0, 5).join(', ');
    throw new Error(`Inline optimizer introduced unsupported factual vocabulary: ${examples}`);
  }
}

export function validateFactPreservingInlineRewrite(
  sourceText: string,
  candidateText: string,
): string {
  const source = normalizeCandidatePresentationText(sourceText);
  const candidate = normalizeCandidatePresentationText(candidateText);

  if (!candidate) throw new Error('Inline optimizer returned empty text.');
  if (candidate.length > Math.max(source.length * 1.6, source.length + 320)) {
    throw new Error('Inline optimizer expanded the candidate text beyond the safe presentation budget.');
  }

  assertNoNovelStructuredFacts(source, candidate);
  assertNoNovelDomainVocabulary(source, candidate);
  return candidate;
}

export async function optimizeCandidateText(
  sourceText: string,
  provider: CandidateTextOptimizationProvider,
): Promise<CandidateTextOptimizationResult> {
  const safeSource = normalizeCandidatePresentationText(sourceText);

  try {
    const proposal = await provider.optimize(safeSource);
    const output = validateFactPreservingInlineRewrite(safeSource, proposal);
    return {
      output,
      mode: 'FACT_PRESERVING_AI',
      policyVersion: CANDIDATE_TEXT_OPTIMIZER_POLICY_VERSION,
      changed: output !== safeSource,
    };
  } catch (error) {
    const output = normalizeCandidatePresentationText(safeSource);
    return {
      output,
      mode: 'PRESENTATION_ONLY_FALLBACK',
      policyVersion: CANDIDATE_TEXT_OPTIMIZER_POLICY_VERSION,
      changed: output !== sourceText,
      fallbackReason: error instanceof Error ? error.message : 'Unsafe or unavailable inline rewrite.',
    };
  }
}
