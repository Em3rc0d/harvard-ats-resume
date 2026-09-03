import { createHash } from "node:crypto";
import {
  P1_DETERMINISTIC_GUARD_VERSION,
  P1_PRESENTATION_CONTRACT_VERSION,
  PresentationEvidenceReceiptSchema,
  PresentationValidationReceiptSchema,
  type PresentationEvidenceReceipt,
  type PresentationValidationReceipt,
} from "../../domain/presentation/PresentationRevision";

export type PresentationGuardInput = Readonly<{
  sourceEvidence: readonly PresentationEvidenceReceipt[];
  proposedText: string;
  supportedTerms?: readonly string[];
  detectedCandidateTerms?: readonly string[];
  marketOnlyTerms?: readonly string[];
  checkedAt?: string;
}>;

const STRENGTHENING_TERMS = [
  "led",
  "owned",
  "spearheaded",
  "architected",
  "managed",
  "mentored",
  "expert",
  "senior",
  "principal",
  "director",
  "head of",
  "drove",
  "increased",
  "reduced",
  "grew",
] as const;

const SUPERLATIVE_TERMS = [
  "best",
  "top",
  "leading",
  "world-class",
  "exceptional",
  "industry-leading",
] as const;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalToken(value: string) {
  return normalize(value).replace(/[,\s]+/g, "");
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

function quantitativeTokens(value: string) {
  const matches = value.match(/(?:[$€£]\s*)?\b\d+(?:[.,]\d+)*(?:\s*%)?/g) ?? [];
  return unique(matches.map(canonicalToken).filter(Boolean));
}

function percentageTokens(value: string) {
  const matches = value.match(/\b\d+(?:[.,]\d+)?\s*%/g) ?? [];
  return unique(matches.map(canonicalToken));
}

function currencyTokens(value: string) {
  const matches = value.match(/[$€£]\s*\d+(?:[.,]\d+)*/g) ?? [];
  return unique(matches.map(canonicalToken));
}

function containsPhrase(text: string, phrase: string) {
  const normalizedText = ` ${normalize(text)} `;
  const normalizedPhrase = ` ${normalize(phrase)} `;
  return normalizedText.includes(normalizedPhrase);
}

function textHasTerm(text: string, term: string) {
  const normalizedText = normalize(text);
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}(?=$|\\W)`, "iu").test(normalizedText);
}

function finding(
  code: PresentationValidationReceipt["findings"][number]["code"],
  token: string | null,
  message: string,
) {
  return { code, token, message } as const;
}

export function validatePresentationProposal(input: PresentationGuardInput): PresentationValidationReceipt {
  const sourceEvidence = input.sourceEvidence.map((source) => PresentationEvidenceReceiptSchema.parse(source));
  const proposedText = input.proposedText.trim();
  const sourceText = sourceEvidence.map((source) => source.evidenceCanonicalText).join("\n");
  const findings: PresentationValidationReceipt["findings"] = [];

  for (const source of sourceEvidence) {
    if (sha256(source.evidenceCanonicalText) !== source.evidenceTextSha256) {
      findings.push(finding(
        "SOURCE_HASH_MISMATCH",
        source.evidenceId,
        `Career Evidence ${source.evidenceId} does not match its recorded text hash.`,
      ));
    }
  }

  const sourceNumbers = new Set(quantitativeTokens(sourceText));
  for (const token of quantitativeTokens(proposedText)) {
    if (!sourceNumbers.has(token)) {
      findings.push(finding(
        "UNSUPPORTED_NUMBER",
        token,
        `Presentation introduces quantitative token '${token}' that is absent from verified source evidence.`,
      ));
    }
  }

  const sourcePercentages = new Set(percentageTokens(sourceText));
  for (const token of percentageTokens(proposedText)) {
    if (!sourcePercentages.has(token)) {
      findings.push(finding(
        "UNSUPPORTED_PERCENTAGE",
        token,
        `Presentation introduces percentage '${token}' that is absent from verified source evidence.`,
      ));
    }
  }

  const sourceCurrencies = new Set(currencyTokens(sourceText));
  for (const token of currencyTokens(proposedText)) {
    if (!sourceCurrencies.has(token)) {
      findings.push(finding(
        "UNSUPPORTED_CURRENCY",
        token,
        `Presentation introduces currency value '${token}' that is absent from verified source evidence.`,
      ));
    }
  }

  for (const term of STRENGTHENING_TERMS) {
    if (textHasTerm(proposedText, term) && !textHasTerm(sourceText, term)) {
      findings.push(finding(
        "UNSUPPORTED_STRENGTHENING",
        term,
        `Presentation strengthens the claim with '${term}' without matching source support.`,
      ));
    }
  }

  for (const term of SUPERLATIVE_TERMS) {
    if (containsPhrase(proposedText, term) && !containsPhrase(sourceText, term)) {
      findings.push(finding(
        "UNSUPPORTED_SUPERLATIVE",
        term,
        `Presentation introduces unsupported superlative '${term}'.`,
      ));
    }
  }

  const supportedTerms = new Set((input.supportedTerms ?? []).map(normalize));
  for (const rawTerm of unique(input.detectedCandidateTerms ?? [])) {
    const term = normalize(rawTerm);
    if (term && !supportedTerms.has(term)) {
      findings.push(finding(
        "UNSUPPORTED_TERM",
        rawTerm,
        `Presentation contains candidate term '${rawTerm}' that is not in the supported evidence term set.`,
      ));
    }
  }

  for (const rawTerm of unique(input.marketOnlyTerms ?? [])) {
    const term = normalize(rawTerm);
    if (term && textHasTerm(proposedText, term) && !supportedTerms.has(term)) {
      findings.push(finding(
        "MARKET_TERM_PROMOTED_TO_CANDIDATE",
        rawTerm,
        `Market-only term '${rawTerm}' cannot be promoted into candidate presentation without supporting evidence.`,
      ));
    }
  }

  const exactSource = sourceEvidence.length === 1 && normalize(proposedText) === normalize(sourceText);
  const deterministicStatus = findings.length === 0 ? "PASS" : "FAIL";

  const receipt: PresentationValidationReceipt = {
    contractVersion: P1_PRESENTATION_CONTRACT_VERSION,
    deterministicGuardVersion: P1_DETERMINISTIC_GUARD_VERSION,
    deterministicStatus,
    semanticStatus: deterministicStatus === "FAIL"
      ? "NOT_RUN"
      : exactSource
        ? "SOURCE_EXACT"
        : "REVIEW_REQUIRED",
    overallStatus: deterministicStatus === "FAIL"
      ? "REJECTED"
      : exactSource
        ? "ACCEPTED"
        : "REVIEW_REQUIRED",
    findings,
    checkedAt: input.checkedAt ?? new Date().toISOString(),
  };

  return PresentationValidationReceiptSchema.parse(receipt);
}

function completeSemanticReview(
  receiptInput: PresentationValidationReceipt,
  method: "MODEL_ASSISTED_PASS" | "MANUAL_EVIDENCE_REVIEW_PASS",
  checkedAt?: string,
): PresentationValidationReceipt {
  const receipt = PresentationValidationReceiptSchema.parse(receiptInput);

  if (receipt.deterministicStatus !== "PASS" || receipt.findings.length > 0) {
    throw new Error("P1_SEMANTIC_REVIEW_CANNOT_OVERRIDE_DETERMINISTIC_FAILURE");
  }

  return PresentationValidationReceiptSchema.parse({
    ...receipt,
    semanticStatus: method,
    overallStatus: "ACCEPTED",
    checkedAt: checkedAt ?? new Date().toISOString(),
  });
}

export function completeManualEvidenceReview(
  receipt: PresentationValidationReceipt,
  checkedAt?: string,
) {
  return completeSemanticReview(receipt, "MANUAL_EVIDENCE_REVIEW_PASS", checkedAt);
}

export function completeModelAssistedSemanticReview(
  receipt: PresentationValidationReceipt,
  checkedAt?: string,
) {
  return completeSemanticReview(receipt, "MODEL_ASSISTED_PASS", checkedAt);
}

export function presentationTextSha256(value: string) {
  return sha256(value);
}
