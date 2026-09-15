const URL_PATTERN_SOURCE = "https?:\\/\\/[^\\s|<>\\\"']+";

export type V12ResumeSemanticLine = Readonly<{
  kind: "NAME" | "HEADLINE" | "CONTACT" | "HEADING" | "ENTRY" | "ENTRY_META" | "BODY" | "LABELED_BODY" | "BULLET";
  text: string;
}>;

export function renderV12ResumeText(lines: readonly V12ResumeSemanticLine[]): string {
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

function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}
function u16(value: number) { return new Uint8Array([value & 255, (value >>> 8) & 255]); }
function u32(value: number) { return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]); }
function concatBytes(parts: readonly Uint8Array[]) {
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

type TextSegment = { text: string; url: string | null; bold?: boolean };
function extractUrls(value: string): string[] {
  return Array.from(value.matchAll(new RegExp(URL_PATTERN_SOURCE, "g")), (match) => match[0]);
}
function splitTextByUrls(value: string): TextSegment[] {
  const segments: TextSegment[] = [];
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
function collectHyperlinks(lines: readonly V12ResumeSemanticLine[]) {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    for (const url of extractUrls(line.text)) {
      if (!seen.has(url)) { seen.add(url); urls.push(url); }
    }
  }
  return urls;
}

function wordRun(input: {
  text: string;
  bold?: boolean;
  italic?: boolean;
  caps?: boolean;
  sizeHalfPoints: number;
  color: string;
  hyperlinkId?: string | null;
}) {
  const linkStyle = input.hyperlinkId ? '<w:u w:val="single"/>' : "";
  const properties = [
    '<w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>',
    input.bold ? "<w:b/>" : "",
    input.italic ? "<w:i/>" : "",
    input.caps ? "<w:caps/>" : "",
    `<w:color w:val="${input.color}"/>`,
    linkStyle,
    `<w:sz w:val="${input.sizeHalfPoints}"/><w:szCs w:val="${input.sizeHalfPoints}"/>`,
  ].join("");
  const run = `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${xmlEscape(input.text)}</w:t></w:r>`;
  return input.hyperlinkId ? `<w:hyperlink r:id="${input.hyperlinkId}" w:history="1">${run}</w:hyperlink>` : run;
}

function paragraphSegments(line: V12ResumeSemanticLine): TextSegment[] {
  if (line.kind === "LABELED_BODY") {
    const separator = line.text.indexOf(":");
    if (separator > 0) {
      return [
        { text: line.text.slice(0, separator + 1), url: null, bold: true },
        ...splitTextByUrls(line.text.slice(separator + 1)),
      ];
    }
  }
  const text = line.kind === "BULLET" ? `• ${line.text}` : line.text;
  return splitTextByUrls(text);
}

function professionalParagraph(line: V12ResumeSemanticLine, hyperlinkIds: ReadonlyMap<string, string>, isLastContact: boolean) {
  const isCentered = line.kind === "NAME" || line.kind === "HEADLINE" || line.kind === "CONTACT";
  const propertiesByKind: Record<V12ResumeSemanticLine["kind"], { size: number; color: string; bold?: boolean; italic?: boolean; caps?: boolean; spacing: string; extraPPr?: string }> = {
    NAME: { size: 38, color: "181D26", bold: true, spacing: '<w:spacing w:after="30"/>' },
    HEADLINE: { size: 20, color: "2D3748", bold: true, spacing: '<w:spacing w:after="40"/>' },
    CONTACT: { size: 17, color: "2D3748", spacing: '<w:spacing w:after="14"/>' },
    HEADING: { size: 21, color: "123456", bold: true, caps: true, spacing: '<w:spacing w:before="100" w:after="56"/>', extraPPr: '<w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="B9C4CF"/></w:pBdr>' },
    ENTRY: { size: 19, color: "181D26", bold: true, spacing: '<w:spacing w:before="50" w:after="16"/>', extraPPr: '<w:keepNext/>' },
    ENTRY_META: { size: 18, color: "374151", italic: true, spacing: '<w:spacing w:after="24"/>', extraPPr: '<w:keepNext/>' },
    BODY: { size: 18, color: "1F2937", spacing: '<w:spacing w:after="30" w:line="240" w:lineRule="auto"/>' },
    LABELED_BODY: { size: 18, color: "1F2937", spacing: '<w:spacing w:after="30" w:line="240" w:lineRule="auto"/>' },
    BULLET: { size: 18, color: "1F2937", spacing: '<w:spacing w:after="32" w:line="240" w:lineRule="auto"/>', extraPPr: '<w:ind w:left="230" w:hanging="173"/>' },
  };
  const style = propertiesByKind[line.kind];
  const contactBorder = line.kind === "CONTACT" && isLastContact
    ? '<w:pBdr><w:bottom w:val="single" w:sz="10" w:space="1" w:color="8EA3B8"/></w:pBdr>'
    : "";
  const pPr = `${style.extraPPr ?? ""}${style.spacing}${isCentered ? '<w:jc w:val="center"/>' : ""}${contactBorder}`;
  const runs = paragraphSegments(line).map((segment) => wordRun({
    text: segment.text,
    bold: segment.bold ?? style.bold,
    italic: style.italic,
    caps: style.caps,
    sizeHalfPoints: style.size,
    color: style.color,
    hyperlinkId: segment.url ? (hyperlinkIds.get(segment.url) ?? null) : null,
  })).join("");
  return `<w:p><w:pPr>${pPr}</w:pPr>${runs}</w:p>`;
}

export function renderV12ResumeDocx(linesInput: readonly V12ResumeSemanticLine[]): Uint8Array {
  const lines = [...linesInput];
  const encoder = new TextEncoder();
  const urls = collectHyperlinks(lines);
  const hyperlinkIds = new Map(urls.map((url, index) => [url, `rIdLink${index + 1}`]));
  const lastContactIndex = lines.reduce((last, line, index) => line.kind === "CONTACT" ? index : last, -1);
  const paragraphs = lines.map((line, index) => professionalParagraph(line, hyperlinkIds, index === lastContactIndex)).join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="691" w:right="835" w:bottom="691" w:left="835"/></w:sectPr></w:body></w:document>`;
  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:color w:val="1F2937"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="36" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>';
  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: "[Content_Types].xml", data: encoder.encode('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>') },
    { name: "_rels/.rels", data: encoder.encode('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: "word/document.xml", data: encoder.encode(documentXml) },
    { name: "word/styles.xml", data: encoder.encode(stylesXml) },
  ];
  const documentRelationships = [
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    ...urls.map((url) => `<Relationship Id="${hyperlinkIds.get(url)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(url)}" TargetMode="External"/>`),
  ];
  files.push({
    name: "word/_rels/document.xml.rels",
    data: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${documentRelationships.join("")}</Relationships>`),
  });
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
    else throw new Error(`V12_PDF_UNSUPPORTED_CHARACTER:U+${code.toString(16).toUpperCase()}`);
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
      if (current) { lines.push(current); current = ""; }
      let offset = 0;
      while (word.length - offset > width) { lines.push(word.slice(offset, offset + width)); offset += width; }
      current = word.slice(offset);
    } else if (!current) current = word;
    else if (`${current} ${word}`.length <= width) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}
function widthFor(line: V12ResumeSemanticLine) {
  if (line.kind === "NAME") return 58;
  if (line.kind === "HEADLINE") return 82;
  if (line.kind === "CONTACT") return 102;
  if (line.kind === "HEADING") return 92;
  if (line.kind === "ENTRY") return 100;
  if (line.kind === "ENTRY_META") return 105;
  if (line.kind === "BULLET") return 103;
  return 108;
}
function pdfFont(line: V12ResumeSemanticLine): "F1" | "F2" | "F3" {
  if (["NAME", "HEADLINE", "HEADING", "ENTRY"].includes(line.kind)) return "F2";
  if (line.kind === "ENTRY_META") return "F3";
  return "F1";
}
function pdfSize(line: V12ResumeSemanticLine) {
  if (line.kind === "NAME") return 19;
  if (line.kind === "HEADLINE") return 10;
  if (line.kind === "CONTACT") return 8.5;
  if (line.kind === "HEADING") return 10.5;
  if (line.kind === "ENTRY") return 9.5;
  return 9;
}
function lineHeight(line: V12ResumeSemanticLine) {
  if (line.kind === "NAME") return 22;
  if (line.kind === "HEADLINE") return 13;
  if (line.kind === "CONTACT") return 11;
  if (line.kind === "HEADING") return 14;
  if (line.kind === "ENTRY") return 12;
  return 11;
}
function beforeSpacing(line: V12ResumeSemanticLine) {
  if (line.kind === "HEADING") return 5;
  if (line.kind === "ENTRY") return 2.5;
  return 0;
}
function afterSpacing(line: V12ResumeSemanticLine) {
  if (line.kind === "NAME") return 1.5;
  if (line.kind === "HEADLINE") return 2;
  if (line.kind === "CONTACT") return 0.7;
  if (line.kind === "HEADING") return 2.8;
  if (line.kind === "ENTRY") return 0.8;
  if (line.kind === "ENTRY_META") return 1.2;
  if (line.kind === "BULLET") return 1.6;
  return 1.5;
}
function estimatedTextWidth(text: string, size: number, bold: boolean) {
  return text.length * size * (bold ? 0.54 : 0.50);
}

type PdfTextItem = Readonly<{ line: V12ResumeSemanticLine; text: string; firstWrappedLine: boolean; lastWrappedLine: boolean }>;
type PdfPage = { commands: string[]; usedHeight: number; visualLineCount: number };

function layoutPdf(lines: readonly V12ResumeSemanticLine[]) {
  const PAGE_TOP = 752;
  const PAGE_BOTTOM = 38;
  const LEFT = 42;
  const RIGHT = 42;
  const CONTENT_WIDTH = 612 - LEFT - RIGHT;
  const pages: PdfPage[] = [];
  let page: PdfPage = { commands: [], usedHeight: 0, visualLineCount: 0 };
  let y = PAGE_TOP;
  const newPage = () => {
    if (page.commands.length > 0 || pages.length === 0) pages.push(page);
    page = { commands: [], usedHeight: 0, visualLineCount: 0 };
    y = PAGE_TOP;
  };
  const addText = (item: PdfTextItem) => {
    const line = item.line;
    const font = pdfFont(line);
    const size = pdfSize(line);
    const height = lineHeight(line);
    const before = item.firstWrappedLine ? beforeSpacing(line) : 0;
    const after = item.lastWrappedLine ? afterSpacing(line) : 0;
    const needed = before + height + after + (line.kind === "HEADING" && item.lastWrappedLine ? 2 : 0);
    if (y - needed < PAGE_BOTTOM) newPage();
    y -= before;
    const bold = font === "F2";
    const isCentered = line.kind === "NAME" || line.kind === "HEADLINE" || line.kind === "CONTACT";
    const xBase = line.kind === "BULLET" ? LEFT + 11 : LEFT;
    const drawText = line.kind === "HEADING" ? item.text.toUpperCase() : item.text;
    const x = isCentered
      ? Math.max(LEFT, LEFT + (CONTENT_WIDTH - estimatedTextWidth(drawText, size, bold)) / 2)
      : xBase;
    page.commands.push(`BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfLiteral(drawText)}) Tj ET`);
    if (line.kind === "BULLET" && item.firstWrappedLine) {
      page.commands.push(`BT /F1 ${size} Tf 1 0 0 1 ${(LEFT + 1).toFixed(2)} ${y.toFixed(2)} Tm (${pdfLiteral("•")}) Tj ET`);
    }
    y -= height;
    page.usedHeight = Math.max(page.usedHeight, PAGE_TOP - y);
    page.visualLineCount += 1;
    if (line.kind === "HEADING" && item.lastWrappedLine) {
      page.commands.push(`0.72 0.77 0.81 RG 0.6 w ${LEFT} ${(y + 2).toFixed(2)} m ${612 - RIGHT} ${(y + 2).toFixed(2)} l S`);
    }
    y -= after;
  };

  const lastContactIndex = lines.reduce((last, line, index) => line.kind === "CONTACT" ? index : last, -1);
  lines.forEach((line, index) => {
    const wrapped = wrapLine(line.text, widthFor(line));
    wrapped.forEach((text, wrappedIndex) => addText({
      line,
      text,
      firstWrappedLine: wrappedIndex === 0,
      lastWrappedLine: wrappedIndex === wrapped.length - 1,
    }));
    if (line.kind === "CONTACT" && index === lastContactIndex) {
      if (y - 4 < PAGE_BOTTOM) newPage();
      page.commands.push(`0.56 0.64 0.72 RG 0.8 w ${LEFT} ${(y + 1).toFixed(2)} m ${612 - RIGHT} ${(y + 1).toFixed(2)} l S`);
      y -= 3;
    }
  });
  if (page.commands.length > 0 || pages.length === 0) pages.push(page);
  return pages;
}

export type V12ResumeLayoutDiagnostics = Readonly<{
  visualLineCount: number;
  pageCount: number;
  trailingPageFillRatio: number;
  sparseTrailingPage: boolean;
}>;

export function diagnoseV12ResumeLayout(lines: readonly V12ResumeSemanticLine[]): V12ResumeLayoutDiagnostics {
  const pages = layoutPdf(lines);
  const totalVisualLines = pages.reduce((sum, item) => sum + item.visualLineCount, 0);
  const usableHeight = 752 - 38;
  const trailingPageFillRatio = pages.length === 1 ? 1 : Math.min(1, pages.at(-1)!.usedHeight / usableHeight);
  return {
    visualLineCount: totalVisualLines,
    pageCount: pages.length,
    trailingPageFillRatio,
    sparseTrailingPage: pages.length > 1 && trailingPageFillRatio < 0.32,
  };
}

export function renderV12ResumePdf(lines: readonly V12ResumeSemanticLine[]): Uint8Array {
  const pages = layoutPdf(lines);
  const objects: string[] = [];
  const add = (value: string) => { objects.push(value); return objects.length; };
  const catalogId = add("");
  const pagesId = add("");
  const normalFontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const boldFontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const italicFontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>");
  const pageIds: number[] = [];
  for (const page of pages) {
    const stream = page.commands.join("\n");
    const streamLength = new TextEncoder().encode(stream).length;
    const contentId = add(`<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${normalFontId} 0 R /F2 ${boldFontId} 0 R /F3 ${italicFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [encoder.encode("%PDF-1.4\n%CVEngine-v12-professional\n")];
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
