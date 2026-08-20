import type { CandidateTextOptimizationProvider } from '../../application/presentation/CandidateTextOptimizer';
import { AIProviderFailure } from '../../application/ai/AIProviderFailure';
import { OllamaStructuredClient, OLLAMA_PROVIDER } from './OllamaStructuredClient';

const INLINE_OPTIMIZER_TIMEOUT_MS = 30_000;

const SYSTEM_INSTRUCTION = `You rewrite candidate-authored resume text inside CV Engine without changing its factual meaning.

The source text is the ONLY authority.

Hard rules:
- Never add metrics, percentages, money, dates, years, team sizes, employers, roles, projects, certifications, technologies, responsibilities, ownership, scope, achievements, education, languages or locations that are not explicitly present in the source text.
- Never infer a stronger responsibility from a technology or noun.
- Preserve every technical/domain term exactly when possible.
- You may improve grammar, ordering, clarity, concision and professional tone.
- Keep the same language as the source text.
- Prefer concise resume-ready prose or bullets when the source is already list-like.
- Do not add placeholders, advice, explanations, headings or commentary.
- Return only the JSON object requested by the schema.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    optimizedText: {
      type: 'string',
      description: 'Fact-preserving rewrite of only the supplied source text.',
    },
  },
  required: ['optimizedText'],
} as const;

export class OllamaCandidateTextOptimizer implements CandidateTextOptimizationProvider {
  readonly client: OllamaStructuredClient;

  constructor(client: OllamaStructuredClient = new OllamaStructuredClient()) {
    this.client = client;
  }

  async optimize(sourceText: string): Promise<string> {
    const decoded = await this.client.generateStructured({
      system: SYSTEM_INSTRUCTION,
      prompt: `Rewrite only this candidate-authored text:\n\n${sourceText}`,
      schema: RESPONSE_SCHEMA,
      timeoutMs: INLINE_OPTIMIZER_TIMEOUT_MS,
      model: process.env.OLLAMA_OPTIMIZE_MODEL?.trim() || this.client.model,
      temperature: 0,
      maxOutputTokens: 2_048,
    });

    if (
      !decoded ||
      typeof decoded !== 'object' ||
      typeof (decoded as { optimizedText?: unknown }).optimizedText !== 'string'
    ) {
      throw new AIProviderFailure({
        provider: OLLAMA_PROVIDER,
        kind: 'INVALID_PROVIDER_RESPONSE',
        message: 'Local Ollama returned JSON that failed the inline-optimization contract.',
      });
    }

    return (decoded as { optimizedText: string }).optimizedText;
  }
}
