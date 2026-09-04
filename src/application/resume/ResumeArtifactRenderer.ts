import { ResumeArtifactSchema, type ResumeArtifact } from "../../domain/resume/ResumeArtifact";

const SECTION_HEADINGS: Record<string, string> = {
  EXPERIENCE: "Experience",
  PROJECTS: "Projects",
  EDUCATION: "Education",
  CERTIFICATIONS: "Certifications",
  SKILLS: "Skills",
  LANGUAGES: "Languages",
};

const URL_PATTERN_SOURCE = "https?:\\/\\/[^\\s|<>\\\"']+";

export type ResumeSemanticLine = {
  kind: "NAME" | "META" | "HEADING" | "BODY" | "BULLET";
  text: string;
};

export function buildResumeSemanticLines(input: ResumeArtifact): ResumeSemanticLine[] {
  const artifact = ResumeArtifactSchema.parse(input);
  const lines: ResumeSemanticLine[] = [];

  if (artifact.content.header.status === "AVAILABLE") {
    lines.push({ kind: "NAME", text: artifact.content.header.displayName });
    if (artifact.content.header.headline) lines.push({ kind: "META", text: artifact.content.header.headline });
    for (const contactLine of artifact.content.header.contactLines) lines.push({ kind: "META", text: contactLine });
  }

  if (artifact.content.professionalSummary) {
    lines.push({ kind: "HEADING", text: "Professional Summary" });
    lines.push({ kind: "BODY", text: artifact.content.professionalSummary.text });
  }
  for (const section of artifact.content.sections) {
    lines.push({ kind: "HEADING", text: SECTION_HEADINGS[section.section] ?? section.section });
    if (section.layout === "INLINE_LIST") {
      lines.push({ kind: "BODY", text: section.entries.map((entry) => entry.renderedText).join(" | ") });
    } else {
      for (const entry of section.entries) lines.push({ kind: "BULLET", text: entry.renderedText });
    }
  }
  return lines;
}

export function renderResumeArtifactText(input: ResumeArtifact): string {
  const lines = buildResumeSemanticLines(input);
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.kind === "HEADING" && current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
    current.push(line.kind === "BULLET" ? `- ${line.text}` : line.text);
  }
  if (current.length > 0) blocks.push(current.join("\n"));
  return `${blocks.join("\n\n")}\n`;
}

export function renderResumeArtifactProvenanceJson(input: ResumeArtifact): string {
  const artifact = ResumeArtifactSchema.parse(input);
  return `${JSON.stringify({
    schemaVersion: "b9-resume-artifact-provenance-v2",
    artifactId: artifact.id,
    artifactSemanticSha256: artifact.artifactSemanticSha256,
    mode: artifact.mode,
    manifest: artifact.manifest,
  }, null, 2)}\n`;
}

function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

function u16(value: number) { return new Uint8Array([value & 255, (value >>> 8) & 255]); }
function u32(value: number) { return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]); }
function concatBytes(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStored(files: Array<{ name: string; data: Uint8Array }>) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = concatBytes([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc),
      u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), name, file.data,
    ]);
    localParts.push(local);
    centralParts.push(concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc),
      u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += local.length;
  }
  const central = concatBytes(centralParts);
  return concatBytes([
    ...localParts,
    central,
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(offset), u16(0),
  ]);
}

type DocxTextSegment = { text: string; url: string | null };

function extractUrls(value: string): string[] {
  return Array.from(value.matchAll(new RegExp(URL_PATTERN_SOURCE, "g")), (match) => match[0]);
}

function splitTextByUrls(value: string): DocxTextSegment[] {
  const segments: DocxTextSegment[] = [];
  const pattern = new RegExp(URL_PATTERN_SOURCE, "g");
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ text: value.slice(cursor, index), url: null });
    segments.push({ text: match[0], url: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), url: null });
  return segments.length > 0 ? segments : [{ text: value, url: null }];
}

function collectDocxHyperlinks(lines: ResumeSemanticLine[]) {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    for (const url of extractUrls(line.text)) {
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
  }
  return urls;
}

function wordRun(text: string, bold: boolean, size: string, hyperlinkId: string | null) {
  const linkStyle = hyperlinkId ? '<w:color w:val="0563C1"/><w:u w:val="single"/>' : "";
  const properties = `${bold ? "<w:b/>" : ""}${linkStyle}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`;
  const run = `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
  return hyperlinkId ? `<w:hyperlink r:id="${hyperlinkId}" w:history="1">${run}</w:hyperlink>` : run;
}

function wordParagraph(line: ResumeSemanticLine, hyperlinkIds: ReadonlyMap<string, string>) {
  const sourceText = line.kind === "BULLET" ? `• ${line.text}` : line.text;
  const bold = line.kind === "NAME" || line.kind === "HEADING";
  const size = line.kind === "NAME" ? "28" : line.kind === "HEADING" ? "22" : line.kind === "META" ? "19" : "20";
  const spacing = line.kind === "NAME"
    ? '<w:spacing w:after="40"/>'
    : line.kind === "META"
      ? '<w:spacing w:after="20"/>'
      : line.kind === "HEADING"
        ? '<w:spacing w:before="160" w:after="60"/>'
        : '<w:spacing w:after="40"/>';
  const runs = splitTextByUrls(sourceText).map((segment) => wordRun(
    segment.text,
    bold,
    size,
    segment.url ? (hyperlinkIds.get(segment.url) ?? null) : null,
  )).join("");
  return `<w:p><w:pPr>${spacing}</w:pPr>${runs}</w:p>`;
}

export function renderResumeArtifactDocx(input: ResumeArtifact): Uint8Array {
  const artifact = ResumeArtifactSchema.parse(input);
  const lines = buildResumeSemanticLines(artifact);
  const encoder = new TextEncoder();
  const urls = collectDocxHyperlinks(lines);
  const hyperlinkIds = new Map(urls.map((url, index) => [url, `rIdLink${index + 1}`]));
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${lines.map((line) => wordParagraph(line, hyperlinkIds)).join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`;
  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: "[Content_Types].xml", data: encoder.encode('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: "_rels/.rels", data: encoder.encode('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: "word/document.xml", data: encoder.encode(documentXml) },
  ];
  if (urls.length > 0) {
    const relationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${urls.map((url) => `<Relationship Id="${hyperlinkIds.get(url)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(url)}" TargetMode="External"/>`).join("")}</Relationships>`;
    files.push({ name: "word/_rels/document.xml.rels", data: encoder.encode(relationships) });
  }
  return zipStored(files);
}

function cp1252(value: string): Uint8Array {
  const specials: ReadonlyArray<readonly [number, number]> = [[0x20ac,0x80],[0x201a,0x82],[0x0192,0x83],[0x201e,0x84],[0x2026,0x85],[0x2020,0x86],[0x2021,0x87],[0x02c6,0x88],[0x2030,0x89],[0x0160,0x8a],[0x2039,0x8b],[0x0152,0x8c],[0x017d,0x8e],[0x2018,0x91],[0x2019,0x92],[0x201c,0x93],[0x201d,0x94],[0x2022,0x95],[0x2013,0x96],[0x2014,0x97],[0x02dc,0x98],[0x2122,0x99],[0x0161,0x9a],[0x203a,0x9b],[0x0153,0x9c],[0x017e,0x9e],[0x0178,0x9f]];
  const map = new Map<number, number>(specials);
  const bytes: number[] = [];
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code <= 0xff) bytes.push(code);
    else if (map.has(code)) bytes.push(map.get(code)!);
    else throw new Error(`B9_PDF_UNSUPPORTED_CHARACTER:U+${code.toString(16).toUpperCase()}`);
  }
  return new Uint8Array(bytes);
}
function pdfLiteral(value: string) {
  const bytes = cp1252(value);
  let output = "";
  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) output += `\\${String.fromCharCode(byte)}`;
    else if (byte < 32 || byte > 126) output += `\\${byte.toString(8).padStart(3, "0")}`;
    else output += String.fromCharCode(byte);
  }
  return output;
}
function wrapLine(text: string, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      let offset = 0;
      while (word.length - offset > width) {
        lines.push(word.slice(offset, offset + width));
        offset += width;
      }
      current = word.slice(offset);
    } else if (current.length === 0) {
      current = word;
    } else if (`${current} ${word}`.length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export function renderResumeArtifactPdf(input: ResumeArtifact): Uint8Array {
  const artifact = ResumeArtifactSchema.parse(input);
  const semantic = buildResumeSemanticLines(artifact);
  const visualLines: Array<{ bold: boolean; text: string }> = [];
  for (const line of semantic) {
    const prefix = line.kind === "BULLET" ? "- " : "";
    const width = line.kind === "NAME" ? 64 : line.kind === "HEADING" ? 70 : 92;
    for (const wrapped of wrapLine(`${prefix}${line.text}`, width)) {
      visualLines.push({ bold: line.kind === "NAME" || line.kind === "HEADING", text: wrapped });
    }
  }
  const pages: Array<Array<{ bold: boolean; text: string }>> = [];
  for (let index = 0; index < visualLines.length; index += 48) pages.push(visualLines.slice(index, index + 48));
  if (pages.length === 0) pages.push([]);

  const objects: string[] = [];
  const add = (value: string) => { objects.push(value); return objects.length; };
  const catalogId = add("");
  const pagesId = add("");
  const normalFontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const boldFontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pageIds: number[] = [];

  for (const page of pages) {
    let y = 756;
    const commands: string[] = ["BT"];
    for (const line of page) {
      commands.push(`/${line.bold ? "F2" : "F1"} ${line.bold ? 11 : 10} Tf`);
      commands.push(`1 0 0 1 54 ${y} Tm (${pdfLiteral(line.text)}) Tj`);
      y -= line.bold ? 17 : 14;
    }
    commands.push("ET");
    const stream = commands.join("\n");
    const streamLength = new TextEncoder().encode(stream).length;
    const contentId = add(`<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${normalFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [encoder.encode("%PDF-1.4\n%CVEngine\n")];
  const offsets = [0];
  let cursor = chunks[0]!.length;
  objects.forEach((object, index) => {
    offsets.push(cursor);
    const chunk = encoder.encode(`${index + 1} 0 obj\n${object}\nendobj\n`);
    chunks.push(chunk); cursor += chunk.length;
  });
  const xrefOffset = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(encoder.encode(xref));
  return concatBytes(chunks);
}
