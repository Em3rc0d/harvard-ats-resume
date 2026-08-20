import { AIProviderFailure, classifyAIProviderError } from '../../application/ai/AIProviderFailure';

export const OLLAMA_PROVIDER = 'ollama-local' as const;
export const DEFAULT_OLLAMA_MODEL = 'qwen3:8b' as const;
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_CONTEXT_WINDOW = 16_384;
const MIN_OLLAMA_CONTEXT_WINDOW = 4_096;
const MAX_OLLAMA_CONTEXT_WINDOW = 65_536;

export interface OllamaStructuredRequest {
  readonly system: string;
  readonly prompt: string;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly timeoutMs: number;
  readonly model?: string;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
}

interface OllamaChatResponse {
  readonly model?: string;
  readonly message?: {
    readonly role?: string;
    readonly content?: string;
  };
  readonly done?: boolean;
  readonly done_reason?: string;
  readonly total_duration?: number;
  readonly load_duration?: number;
  readonly prompt_eval_count?: number;
  readonly prompt_eval_duration?: number;
  readonly eval_count?: number;
  readonly eval_duration?: number;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function resolveOllamaBaseUrl(rawValue: string | undefined = process.env.OLLAMA_BASE_URL): string {
  const value = rawValue?.trim() || DEFAULT_OLLAMA_BASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new AIProviderFailure({
      provider: OLLAMA_PROVIDER,
      kind: 'PROVIDER_UNAVAILABLE',
      retryable: false,
      message: 'OLLAMA_BASE_URL is not a valid URL.',
    });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AIProviderFailure({
      provider: OLLAMA_PROVIDER,
      kind: 'PROVIDER_UNAVAILABLE',
      retryable: false,
      message: 'OLLAMA_BASE_URL must use http or https.',
    });
  }

  return trimTrailingSlash(parsed.toString());
}

export function resolveOllamaModel(rawValue: string | undefined = process.env.OLLAMA_MODEL): string {
  const model = rawValue?.trim() || DEFAULT_OLLAMA_MODEL;
  if (!/^[a-z0-9._:/-]+$/i.test(model)) {
    throw new AIProviderFailure({
      provider: OLLAMA_PROVIDER,
      kind: 'PROVIDER_UNAVAILABLE',
      retryable: false,
      message: 'OLLAMA_MODEL contains unsupported characters.',
    });
  }
  return model;
}

export function resolveOllamaContextWindow(
  rawValue: string | undefined = process.env.OLLAMA_NUM_CTX,
): number {
  if (!rawValue?.trim()) return DEFAULT_OLLAMA_CONTEXT_WINDOW;
  const parsed = Number(rawValue);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_OLLAMA_CONTEXT_WINDOW ||
    parsed > MAX_OLLAMA_CONTEXT_WINDOW
  ) {
    throw new AIProviderFailure({
      provider: OLLAMA_PROVIDER,
      kind: 'PROVIDER_UNAVAILABLE',
      retryable: false,
      message: `OLLAMA_NUM_CTX must be an integer between ${MIN_OLLAMA_CONTEXT_WINDOW} and ${MAX_OLLAMA_CONTEXT_WINDOW}.`,
    });
  }
  return parsed;
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 4_000);
  } catch {
    return '';
  }
}

function providerFailureForHttpStatus(status: number, body: string): AIProviderFailure {
  const normalized = body.toLowerCase();
  if (status === 404 && (normalized.includes('model') || normalized.includes('not found'))) {
    return new AIProviderFailure({
      provider: OLLAMA_PROVIDER,
      kind: 'PROVIDER_UNAVAILABLE',
      retryable: false,
      statusCode: status,
      message: 'The configured local Ollama model is not installed. Pull the model before starting CV Engine.',
    });
  }

  return classifyAIProviderError(
    Object.assign(new Error(body || `Ollama returned HTTP ${status}.`), { status }),
    OLLAMA_PROVIDER,
  );
}

function installedModelMatches(configured: string, installed: string): boolean {
  if (configured.includes(':')) return installed === configured;
  return installed === configured || installed === `${configured}:latest`;
}

function nanosToMilliseconds(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value / 1_000_000)
    : undefined;
}

function tokensPerSecond(count: number | undefined, durationNs: number | undefined): number | undefined {
  if (!count || !durationNs || durationNs <= 0) return undefined;
  return Number((count / (durationNs / 1_000_000_000)).toFixed(2));
}

export class OllamaStructuredClient {
  readonly baseUrl: string;
  readonly model: string;
  readonly contextWindow: number;

  constructor(options?: {
    readonly baseUrl?: string;
    readonly model?: string;
    readonly contextWindow?: number;
  }) {
    this.baseUrl = options?.baseUrl
      ? resolveOllamaBaseUrl(options.baseUrl)
      : resolveOllamaBaseUrl();
    this.model = options?.model
      ? resolveOllamaModel(options.model)
      : resolveOllamaModel();
    this.contextWindow = options?.contextWindow ?? resolveOllamaContextWindow();
  }

  async assertReady(timeoutMs = 5_000): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw providerFailureForHttpStatus(response.status, await safeResponseText(response));
      }

      const payload = await response.json() as { models?: readonly { name?: string; model?: string }[] };
      const available = payload.models?.some((item) => {
        const names = [item.name, item.model].filter(Boolean) as string[];
        return names.some((name) => installedModelMatches(this.model, name));
      });
      if (!available) {
        throw new AIProviderFailure({
          provider: OLLAMA_PROVIDER,
          kind: 'PROVIDER_UNAVAILABLE',
          retryable: false,
          message: `Local Ollama is reachable, but model ${this.model} is not installed.`,
        });
      }
    } catch (error) {
      if (error instanceof AIProviderFailure) throw error;
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new AIProviderFailure({
          provider: OLLAMA_PROVIDER,
          kind: 'REQUEST_TIMEOUT',
          message: 'Local Ollama readiness check timed out.',
          underlying: error,
        });
      }
      throw classifyAIProviderError(error, OLLAMA_PROVIDER);
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateStructured(request: OllamaStructuredRequest): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
    const model = request.model ? resolveOllamaModel(request.model) : this.model;
    const maxOutputTokens = request.maxOutputTokens ?? 4_096;

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          keep_alive: '15m',
          format: request.schema,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: `${request.prompt}\n\nJSON SCHEMA — obey exactly:\n${JSON.stringify(request.schema)}` },
          ],
          options: {
            temperature: request.temperature ?? 0,
            seed: 42,
            num_ctx: this.contextWindow,
            num_predict: maxOutputTokens,
          },
        }),
      });

      if (!response.ok) {
        throw providerFailureForHttpStatus(response.status, await safeResponseText(response));
      }

      const payload = await response.json() as OllamaChatResponse;
      console.info('Local Ollama inference completed:', {
        model: payload.model || model,
        promptTokens: payload.prompt_eval_count,
        outputTokens: payload.eval_count,
        totalMs: nanosToMilliseconds(payload.total_duration),
        loadMs: nanosToMilliseconds(payload.load_duration),
        promptEvalMs: nanosToMilliseconds(payload.prompt_eval_duration),
        outputEvalMs: nanosToMilliseconds(payload.eval_duration),
        outputTokensPerSecond: tokensPerSecond(payload.eval_count, payload.eval_duration),
        doneReason: payload.done_reason,
        contextWindow: this.contextWindow,
        maxOutputTokens,
      });

      const content = payload.message?.content?.trim();
      if (!content) {
        throw new AIProviderFailure({
          provider: OLLAMA_PROVIDER,
          kind: 'INVALID_PROVIDER_RESPONSE',
          message: 'Ollama returned an empty structured response.',
        });
      }

      try {
        return JSON.parse(content);
      } catch (error) {
        throw new AIProviderFailure({
          provider: OLLAMA_PROVIDER,
          kind: 'INVALID_PROVIDER_RESPONSE',
          message: 'Ollama returned invalid JSON despite the structured-output contract.',
          underlying: error,
        });
      }
    } catch (error) {
      if (error instanceof AIProviderFailure) throw error;
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        console.warn('Local Ollama inference budget exhausted:', {
          model,
          timeoutMs: request.timeoutMs,
          contextWindow: this.contextWindow,
          maxOutputTokens,
        });
        throw new AIProviderFailure({
          provider: OLLAMA_PROVIDER,
          kind: 'REQUEST_TIMEOUT',
          message: `Local Ollama request timed out after ${Math.round(request.timeoutMs / 1000)} seconds.`,
          underlying: error,
        });
      }
      throw classifyAIProviderError(error, OLLAMA_PROVIDER);
    } finally {
      clearTimeout(timeout);
    }
  }
}