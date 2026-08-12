import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  summary: z.string().min(10).max(50_000),
});

/**
 * Presentation-only cleanup for the legacy inline Optimize buttons.
 *
 * This endpoint intentionally does NOT use generative AI. Inline edited text is
 * later treated as candidate-supplied data, so allowing an unconstrained model
 * to invent wording here would bypass the ATS v2 grounding boundary. The real
 * fact-preserving AI rewrite remains /api/generate-resume, where deterministic
 * and semantic grounding run before a resume version can be emitted.
 */
export function normalizeCandidatePresentationText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line
      .trim()
      .replace(/^[*-]\s+/, '• ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1'))
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1]?.length))
    .join('\n')
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Content must contain at least 10 characters.' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      output: normalizeCandidatePresentationText(parsed.data.summary),
      mode: 'PRESENTATION_ONLY',
    });
  } catch (error) {
    console.error('Presentation cleanup error:', error);
    return NextResponse.json(
      { error: 'Unable to clean up content.' },
      { status: 500 },
    );
  }
}
