/**
 * Presentation-only cleanup for candidate-authored inline text.
 *
 * This is deliberately deterministic: inline form content later crosses the
 * candidate-truth adapter, so generative rewriting here would create a bypass
 * around the final resume grounding boundary.
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
