import { createHash } from "node:crypto";
import { inflateRawSync, inflateSync } from "node:zlib";
import { B5_EXTRACTOR_VERSION, type ImportMediaType, type ImportReceiptStatus } from "../../domain/import/Import";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENT_XML_BYTES = 2 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 100_000;

export type MechanicalExtraction = {
  mediaType: ImportMediaType;
  status: ImportReceiptStatus;
  text: string;
  warningCode: string | null;
  extractorVersion: typeof B5_EXTRACTOR_VERSION;
};

export type ImportLineProposal = {
  ordinal: number;
  sourceLine: number;
  canonicalText: string;
  sourceTextSha256: string;
};

export function sha256Text(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeExtractedText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS);
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function extractDocxXml(buffer: Buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) throw new Error("DOCX_ZIP_DIRECTORY_MISSING");
  const entries = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (entries === 0xffff || centralOffset === 0xffffffff) throw new Error("DOCX_ZIP64_UNSUPPORTED");

  let offset = centralOffset;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("DOCX_ZIP_DIRECTORY_INVALID");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > buffer.length) throw new Error("DOCX_ZIP_FILENAME_INVALID");
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");

    if (name === "word/document.xml") {
      if ((flags & 0x1) !== 0) throw new Error("DOCX_ENCRYPTED_UNSUPPORTED");
      if (uncompressedSize > MAX_DOCUMENT_XML_BYTES) throw new Error("DOCX_DOCUMENT_XML_TOO_LARGE");
      if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("DOCX_LOCAL_HEADER_INVALID");
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > buffer.length) throw new Error("DOCX_COMPRESSED_DATA_INVALID");
      const compressed = buffer.subarray(dataStart, dataEnd);
      let xml: Buffer;
      if (method === 0) xml = compressed;
      else if (method === 8) xml = inflateRawSync(compressed, { maxOutputLength: MAX_DOCUMENT_XML_BYTES });
      else throw new Error("DOCX_COMPRESSION_UNSUPPORTED");
      if (xml.length > MAX_DOCUMENT_XML_BYTES) throw new Error("DOCX_DOCUMENT_XML_TOO_LARGE");
      return xml.toString("utf8");
    }
    offset = nameEnd + extraLength + commentLength;
  }
  throw new Error("DOCX_DOCUMENT_XML_MISSING");
}

function extractDocxText(buffer: Buffer) {
  const xml = extractDocxXml(buffer);
  const structural = xml
    .replace(/<w:tab\b[^>]*\/>/gi, "\t")
    .replace(/<w:br\b[^>]*\/>/gi, "\n")
    .replace(/<\/w:p>/gi, "\n")
    .replace(/<\/w:tr>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return normalizeExtractedText(decodeXmlEntities(structural));
}

function decodePdfBytes(bytes: number[]) {
  const buffer = Buffer.from(bytes);
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = buffer.subarray(2);
    const swapped = Buffer.alloc(body.length);
    for (let i = 0; i + 1 < body.length; i += 2) {
      swapped[i] = body[i + 1];
      swapped[i + 1] = body[i];
    }
    return swapped.toString("utf16le");
  }
  return buffer.toString("latin1");
}

function readPdfLiteral(source: string, start: number) {
  let depth = 1;
  let index = start + 1;
  const bytes: number[] = [];
  while (index < source.length && depth > 0) {
    const code = source.charCodeAt(index) & 0xff;
    if (code === 0x5c) {
      index += 1;
      if (index >= source.length) break;
      const escaped = source[index];
      const map: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
      if (escaped in map) {
        bytes.push(map[escaped]);
        index += 1;
        continue;
      }
      if (escaped === "\r" || escaped === "\n") {
        if (escaped === "\r" && source[index + 1] === "\n") index += 1;
        index += 1;
        continue;
      }
      if (/[0-7]/.test(escaped)) {
        let octal = escaped;
        let consumed = 1;
        while (consumed < 3 && /[0-7]/.test(source[index + consumed] ?? "")) {
          octal += source[index + consumed];
          consumed += 1;
        }
        bytes.push(Number.parseInt(octal, 8) & 0xff);
        index += consumed;
        continue;
      }
      bytes.push(source.charCodeAt(index) & 0xff);
      index += 1;
      continue;
    }
    if (code === 0x28) {
      depth += 1;
      bytes.push(code);
      index += 1;
      continue;
    }
    if (code === 0x29) {
      depth -= 1;
      if (depth === 0) {
        index += 1;
        break;
      }
      bytes.push(code);
      index += 1;
      continue;
    }
    bytes.push(code);
    index += 1;
  }
  if (depth !== 0) return null;
  return { value: decodePdfBytes(bytes), end: index };
}

function readPdfHex(source: string, start: number) {
  const end = source.indexOf(">", start + 1);
  if (end < 0) return null;
  let hex = source.slice(start + 1, end).replace(/\s+/g, "");
  if (!/^[0-9a-f]*$/i.test(hex)) return null;
  if (hex.length % 2 === 1) hex += "0";
  return { value: decodePdfBytes([...Buffer.from(hex, "hex")]), end: end + 1 };
}

function skipWhitespace(source: string, start: number) {
  let index = start;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
}

function extractPdfTextFromBlock(block: string) {
  const chunks: string[] = [];
  let index = 0;
  while (index < block.length) {
    if (block[index] === "(") {
      const literal = readPdfLiteral(block, index);
      if (!literal) { index += 1; continue; }
      const operatorAt = skipWhitespace(block, literal.end);
      if (block.startsWith("Tj", operatorAt) || block[operatorAt] === "'" || block[operatorAt] === '"') chunks.push(literal.value);
      index = literal.end;
      continue;
    }
    if (block[index] === "<" && block[index + 1] !== "<") {
      const hex = readPdfHex(block, index);
      if (!hex) { index += 1; continue; }
      const operatorAt = skipWhitespace(block, hex.end);
      if (block.startsWith("Tj", operatorAt)) chunks.push(hex.value);
      index = hex.end;
      continue;
    }
    if (block[index] === "[") {
      let cursor = index + 1;
      const values: string[] = [];
      let closed = false;
      while (cursor < block.length) {
        if (block[cursor] === "]") { closed = true; cursor += 1; break; }
        if (block[cursor] === "(") {
          const literal = readPdfLiteral(block, cursor);
          if (!literal) break;
          values.push(literal.value);
          cursor = literal.end;
          continue;
        }
        if (block[cursor] === "<" && block[cursor + 1] !== "<") {
          const hex = readPdfHex(block, cursor);
          if (!hex) break;
          values.push(hex.value);
          cursor = hex.end;
          continue;
        }
        cursor += 1;
      }
      if (closed && block.startsWith("TJ", skipWhitespace(block, cursor))) chunks.push(values.join(""));
      index = cursor;
      continue;
    }
    index += 1;
  }
  return chunks;
}

function extractPdfText(buffer: Buffer) {
  const latin = buffer.toString("latin1");
  if (!latin.startsWith("%PDF-")) throw new Error("PDF_SIGNATURE_INVALID");
  if (/\/Encrypt\b/.test(latin)) throw new Error("PDF_ENCRYPTED_UNSUPPORTED");

  const decodedStreams: string[] = [];
  const streamRegex = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(latin)) !== null) {
    const dictionaryEnd = latin.lastIndexOf(">>", match.index);
    const dictionaryStart = dictionaryEnd >= 0 ? latin.lastIndexOf("<<", dictionaryEnd) : -1;
    const endStream = latin.indexOf("endstream", match.index + match[0].length);
    if (dictionaryStart < 0 || dictionaryEnd < dictionaryStart || endStream < 0) continue;
    const dictionary = latin.slice(dictionaryStart, dictionaryEnd + 2);
    const unsupportedFilter = /\/Filter\s+(?!\/FlateDecode\b)/.test(dictionary) || (/\/Filter\s*\[/.test(dictionary) && !/\/FlateDecode/.test(dictionary));
    if (unsupportedFilter) continue;
    let dataStart = match.index + match[0].length;
    let dataEnd = endStream;
    while (dataEnd > dataStart && (buffer[dataEnd - 1] === 0x0a || buffer[dataEnd - 1] === 0x0d)) dataEnd -= 1;
    const streamBytes = buffer.subarray(dataStart, dataEnd);
    try {
      const decoded = /\/FlateDecode\b/.test(dictionary) ? inflateSync(streamBytes, { maxOutputLength: 2 * 1024 * 1024 }) : streamBytes;
      decodedStreams.push(decoded.toString("latin1"));
    } catch {
      continue;
    }
    streamRegex.lastIndex = endStream + "endstream".length;
  }

  const chunks: string[] = [];
  for (const stream of decodedStreams) {
    const blocks = stream.matchAll(/BT([\s\S]*?)ET/g);
    for (const block of blocks) chunks.push(...extractPdfTextFromBlock(block[1]));
  }
  return normalizeExtractedText(chunks.join("\n"));
}

export function createImportLineProposals(text: string): ImportLineProposal[] {
  const proposals: ImportLineProposal[] = [];
  const seen = new Set<string>();
  for (const [index, source] of text.split("\n").entries()) {
    const canonicalText = source.replace(/[\t ]+/g, " ").trim();
    if (canonicalText.length < 2 || canonicalText.length > 1_000) continue;
    const identity = canonicalText.toLocaleLowerCase("en-US");
    if (seen.has(identity)) continue;
    seen.add(identity);
    proposals.push({
      ordinal: proposals.length + 1,
      sourceLine: index + 1,
      canonicalText,
      sourceTextSha256: sha256Text(canonicalText),
    });
    if (proposals.length >= 100) break;
  }
  return proposals;
}

export function extractResumeMechanically(buffer: Buffer, fileName: string, declaredMimeType: string): MechanicalExtraction {
  if (buffer.length === 0) return { mediaType: fileName.toLowerCase().endsWith(".docx") ? "DOCX" : "PDF", status: "EMPTY", text: "", warningCode: "EMPTY_FILE", extractorVersion: B5_EXTRACTOR_VERSION };
  if (buffer.length > MAX_SOURCE_BYTES) return { mediaType: fileName.toLowerCase().endsWith(".docx") ? "DOCX" : "PDF", status: "REJECTED", text: "", warningCode: "SOURCE_TOO_LARGE", extractorVersion: B5_EXTRACTOR_VERSION };

  const lowerName = fileName.toLowerCase();
  const pdf = declaredMimeType === "application/pdf" || lowerName.endsWith(".pdf");
  const docx = declaredMimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || lowerName.endsWith(".docx");
  const mediaType: ImportMediaType = docx ? "DOCX" : "PDF";
  if ((pdf ? 1 : 0) + (docx ? 1 : 0) !== 1) return { mediaType, status: "REJECTED", text: "", warningCode: "UNSUPPORTED_MEDIA_TYPE", extractorVersion: B5_EXTRACTOR_VERSION };

  try {
    const text = pdf ? extractPdfText(buffer) : extractDocxText(buffer);
    if (!text) return { mediaType, status: "UNSUPPORTED", text: "", warningCode: pdf ? "PDF_TEXT_NOT_EXTRACTABLE" : "DOCX_TEXT_EMPTY", extractorVersion: B5_EXTRACTOR_VERSION };
    const proposals = createImportLineProposals(text);
    if (proposals.length === 0) return { mediaType, status: "EMPTY", text, warningCode: "NO_REVIEWABLE_LINES", extractorVersion: B5_EXTRACTOR_VERSION };
    return { mediaType, status: "EXTRACTED", text, warningCode: null, extractorVersion: B5_EXTRACTOR_VERSION };
  } catch (error) {
    const warningCode = error instanceof Error ? error.message : "MECHANICAL_EXTRACTION_FAILED";
    return { mediaType, status: "UNSUPPORTED", text: "", warningCode: warningCode.slice(0, 100), extractorVersion: B5_EXTRACTOR_VERSION };
  }
}
