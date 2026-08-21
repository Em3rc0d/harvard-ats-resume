export const AI_PROVIDER_FAILURE_CONTRACT_VERSION = 'ats2-ai-provider-failure-v1' as const;

export type AIProviderFailureKind =
  | 'AUTHENTICATION_FAILED'
  | 'QUOTA_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'REQUEST_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_PROVIDER_RESPONSE'
  | 'UNKNOWN_PROVIDER_FAILURE';

export interface AIProviderFailureView {
  readonly status: 'UNAVAILABLE';
  readonly contractVersion: typeof AI_PROVIDER_FAILURE_CONTRACT_VERSION;
  readonly provider: string;
  readonly kind: AIProviderFailureKind;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
}

interface AIProviderFailureOptions {
  readonly provider: string;
  readonly kind: AIProviderFailureKind;
  readonly retryable?: boolean;
  readonly retryAfterSeconds?: number;
  readonly statusCode?: number;
  readonly message?: string;
  readonly underlying?: unknown;
}

const DEFAULT_RETRYABILITY: Readonly<Record<AIProviderFailureKind, boolean>> = {
  AUTHENTICATION_FAILED: false,
  QUOTA_EXHAUSTED: false,
  RATE_LIMITED: true,
  REQUEST_TIMEOUT: true,
  PROVIDER_UNAVAILABLE: true,
  INVALID_PROVIDER_RESPONSE: true,
  UNKNOWN_PROVIDER_FAILURE: false,
};

const DEFAULT_MESSAGES: Readonly<Record<AIProviderFailureKind, string>> = {
  AUTHENTICATION_FAILED: 'The AI provider rejected CV Engine authentication.',
  QUOTA_EXHAUSTED: 'The AI provider quota is exhausted.',
  RATE_LIMITED: 'The AI provider is rate-limiting requests.',
  REQUEST_TIMEOUT: 'The AI provider request exceeded the trusted execution window.',
  PROVIDER_UNAVAILABLE: 'The AI provider is temporarily unavailable.',
  INVALID_PROVIDER_RESPONSE: 'The AI provider returned a response that failed the trusted contract.',
  UNKNOWN_PROVIDER_FAILURE: 'The AI provider request failed for an unclassified reason.',
};

export class AIProviderFailure extends Error {
  readonly provider: string;
  readonly kind: AIProviderFailureKind;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  readonly statusCode?: number;
  readonly underlying?: unknown;

  constructor(options: AIProviderFailureOptions) {
    super(options.message ?? DEFAULT_MESSAGES[options.kind]);
    this.name = 'AIProviderFailure';
    this.provider = options.provider;
    this.kind = options.kind;
    this.retryable = options.retryable ?? DEFAULT_RETRYABILITY[options.kind];
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.statusCode = options.statusCode;
    this.underlying = options.underlying;
  }

  toView(): AIProviderFailureView {
    return {
      status: 'UNAVAILABLE',
      contractVersion: AI_PROVIDER_FAILURE_CONTRACT_VERSION,
      provider: this.provider,
      kind: this.kind,
      retryable: this.retryable,
      ...(this.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: this.retryAfterSeconds }
        : {}),
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function statusCodeFrom(error: unknown): number | undefined {
  const candidates: unknown[] = [];
  if (isRecord(error)) {
    candidates.push(error.status, error.statusCode, error.code);
    if (isRecord(error.error)) {
      candidates.push(error.error.status, error.error.statusCode, error.error.code);
    }
  }

  for (const candidate of candidates) {
    const numeric = typeof candidate === 'number'
      ? candidate
      : typeof candidate === 'string' && /^\d{3}$/.test(candidate.trim())
        ? Number(candidate)
        : undefined;
    if (numeric !== undefined && numeric >= 100 && numeric <= 599) return numeric;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function retryAfterSecondsFrom(message: string): number | undefined {
  const patterns = [
    /please retry in\s+([\d.]+)s/i,
    /retry in\s+([\d.]+)\s*seconds?/i,
    /"retryDelay"\s*:\s*"([\d.]+)s"/i,
    /retry[- ]after\s*[:=]?\s*([\d.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    const value = match?.[1] ? Number(match[1]) : NaN;
    if (Number.isFinite(value) && value >= 0) return Math.ceil(value);
  }
  return undefined;
}

function classifyKind(message: string, statusCode?: number): AIProviderFailureKind {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('aborterror') ||
    normalized.includes('timed out') ||
    normalized.includes('timeout') ||
    normalized.includes('aborted')
  ) {
    return 'REQUEST_TIMEOUT';
  }

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    normalized.includes('unauthenticated') ||
    normalized.includes('authentication failed') ||
    normalized.includes('invalid api key') ||
    normalized.includes('api key is not configured') ||
    normalized.includes('permission denied')
  ) {
    return 'AUTHENTICATION_FAILED';
  }

  if (
    normalized.includes('quota exceeded') ||
    normalized.includes('quotafailure') ||
    normalized.includes('quota failure') ||
    normalized.includes('resource_exhausted') ||
    normalized.includes('perday') ||
    normalized.includes('per day')
  ) {
    return 'QUOTA_EXHAUSTED';
  }

  if (statusCode === 429 || normalized.includes('rate limit')) {
    return 'RATE_LIMITED';
  }

  if (
    normalized.includes('returned an empty') ||
    normalized.includes('returned invalid json') ||
    normalized.includes('invalid response') ||
    normalized.includes('response contract')
  ) {
    return 'INVALID_PROVIDER_RESPONSE';
  }

  if (
    (statusCode !== undefined && statusCode >= 500) ||
    normalized.includes('service unavailable') ||
    normalized.includes('provider unavailable') ||
    normalized.includes('temporarily unavailable') ||
    normalized.includes('overloaded') ||
    normalized.includes('fetch failed') ||
    normalized.includes('network error') ||
    normalized.includes('econnreset') ||
    normalized.includes('enotfound')
  ) {
    return 'PROVIDER_UNAVAILABLE';
  }

  return 'UNKNOWN_PROVIDER_FAILURE';
}

/**
 * Normalizes provider/SDK exceptions into one CV Engine contract. The raw
 * exception remains server-side only; callers expose toView() instead.
 */
export function classifyAIProviderError(
  error: unknown,
  provider: string,
): AIProviderFailure {
  if (error instanceof AIProviderFailure) return error;

  const message = errorMessage(error);
  const statusCode = statusCodeFrom(error);
  const kind = classifyKind(message, statusCode);

  return new AIProviderFailure({
    provider,
    kind,
    retryAfterSeconds: retryAfterSecondsFrom(message),
    statusCode,
    underlying: error,
  });
}

export function aiProviderFailureHttpStatus(failure: AIProviderFailure): number {
  if (failure.kind === 'REQUEST_TIMEOUT') return 504;
  if (failure.kind === 'INVALID_PROVIDER_RESPONSE') return 502;
  return 503;
}

export function aiProviderFailureMessage(
  failure: AIProviderFailure,
  operation: 'resume import' | 'resume generation',
): string {
  const safeOperation = operation === 'resume import' ? 'resume import' : 'resume generation';

  switch (failure.kind) {
    case 'AUTHENTICATION_FAILED':
      return `CV Engine cannot authenticate with the AI provider. Trusted ${safeOperation} was stopped before a result was emitted.`;
    case 'QUOTA_EXHAUSTED':
      return `The AI provider quota is exhausted right now. Trusted ${safeOperation} was stopped without changing your Career Evidence.`;
    case 'RATE_LIMITED':
      return `The AI provider is rate-limiting requests right now. Trusted ${safeOperation} was stopped safely; retry later.`;
    case 'REQUEST_TIMEOUT':
      return `The AI provider did not respond within the trusted execution window. ${safeOperation === 'resume import' ? 'No extracted facts were accepted.' : 'No ResumeVersion was emitted.'}`;
    case 'PROVIDER_UNAVAILABLE':
      return `The AI provider is temporarily unavailable. Trusted ${safeOperation} was stopped safely.`;
    case 'INVALID_PROVIDER_RESPONSE':
      return `The AI provider returned an invalid response. CV Engine rejected it instead of accepting an untrusted ${safeOperation} result.`;
    default:
      return `The AI provider could not complete trusted ${safeOperation}. No trusted result was emitted.`;
  }
}
