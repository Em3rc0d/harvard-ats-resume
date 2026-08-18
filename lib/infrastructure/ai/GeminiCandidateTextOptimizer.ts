import { GoogleGenAI } from '@google/genai';
import type { CandidateTextOptimizationProvider } from '../../application/presentation/CandidateTextOptimizer';
import { GEMINI_RESUME_MODEL } from './GeminiResumeProvider';

const INLINE_OPTIMIZER_TIMEOUT_MS = 30_000;

const SYSTEM_INSTRUCTION = `You rewrite candidate-authored resume text without changing its factual meaning.

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

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  return new GoogleGenAI({ apiKey });
}

export class GeminiCandidateTextOptimizer implements CandidateTextOptimizationProvider {
  async optimize(sourceText: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), INLINE_OPTIMIZER_TIMEOUT_MS);

    try {
      const response = await getClient().models.generateContent({
        model: GEMINI_RESUME_MODEL,
        contents: `Rewrite only this candidate-authored text:\n\n${sourceText}`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_SCHEMA,
          temperature: 0.1,
          topP: 0.8,
          maxOutputTokens: 2048,
          abortSignal: controller.signal,
        },
      });

      const raw = response.text?.trim();
      if (!raw) throw new Error('Gemini returned an empty inline optimization response.');

      let decoded: unknown;
      try {
        decoded = JSON.parse(raw);
      } catch {
        throw new Error('Gemini returned invalid JSON for inline optimization.');
      }

      if (
        !decoded ||
        typeof decoded !== 'object' ||
        typeof (decoded as { optimizedText?: unknown }).optimizedText !== 'string'
      ) {
        throw new Error('Gemini inline optimization response did not match the expected schema.');
      }

      return (decoded as { optimizedText: string }).optimizedText;
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new Error('Inline optimization timed out.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
