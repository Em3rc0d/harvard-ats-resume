export const V12_RESUME_TEXT_MAX_LINE_LENGTH = 180;

function hardWrapToken(token: string, width: number): string[] {
  if (token.length <= width) return [token];
  const chunks: string[] = [];
  for (let offset = 0; offset < token.length; offset += width) {
    chunks.push(token.slice(offset, offset + width));
  }
  return chunks;
}

function wrapContent(content: string, width: number): string[] {
  const words = content.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const rawWord of words) {
    const pieces = hardWrapToken(rawWord, width);
    for (const piece of pieces) {
      if (!current) {
        current = piece;
      } else if (`${current} ${piece}`.length <= width) {
        current += ` ${piece}`;
      } else {
        lines.push(current);
        current = piece;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function wrapV12ResumeArtifactText(input: string, maxLineLength = V12_RESUME_TEXT_MAX_LINE_LENGTH): string {
  if (!Number.isInteger(maxLineLength) || maxLineLength < 80 || maxLineLength > 220) {
    throw new Error("V12_RESUME_TEXT_WRAP_WIDTH_INVALID");
  }
  const output: string[] = [];
  for (const rawLine of input.replace(/\r\n?/g, "\n").split("\n")) {
    if (!rawLine || rawLine.length <= maxLineLength) {
      output.push(rawLine);
      continue;
    }
    const bullet = rawLine.startsWith("- ");
    const firstPrefix = bullet ? "- " : "";
    const continuationPrefix = bullet ? "  " : "";
    const content = bullet ? rawLine.slice(2) : rawLine;
    const width = maxLineLength - firstPrefix.length;
    const wrapped = wrapContent(content, width);
    wrapped.forEach((line, index) => output.push(`${index === 0 ? firstPrefix : continuationPrefix}${line}`));
  }
  return output.join("\n");
}
