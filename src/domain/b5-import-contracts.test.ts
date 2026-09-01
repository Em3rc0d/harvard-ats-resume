import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AcceptImportProposalInputSchema } from "./import/Import";
import { createImportLineProposals, extractResumeMechanically } from "../application/import/ResumeExtractor";

function storedDocx(documentXml: string) {
  const name = Buffer.from("word/document.xml", "utf8");
  const data = Buffer.from(documentXml, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(0, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  const localRecord = Buffer.concat([local, name, data]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(0, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);
  const centralRecord = Buffer.concat([central, name]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralRecord.length, 12);
  eocd.writeUInt32LE(localRecord.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localRecord, centralRecord, eocd]);
}

describe("B5 trusted import contracts", () => {
  it("mechanically extracts bounded selectable-text PDF content", () => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Length 64 >>\nstream\nBT\n(Kubernetes) Tj\n(Docker) Tj\nET\nendstream\nendobj\n%%EOF", "latin1");
    const result = extractResumeMechanically(pdf, "resume.pdf", "application/pdf");
    expect(result.status).toBe("EXTRACTED");
    expect(result.text).toContain("Kubernetes");
    expect(result.text).toContain("Docker");
  });

  it("mechanically extracts DOCX document.xml without an AI/provider dependency", () => {
    const docx = storedDocx('<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Platform Engineer</w:t></w:r></w:p><w:p><w:r><w:t>Kubernetes operations</w:t></w:r></w:p></w:body></w:document>');
    const result = extractResumeMechanically(docx, "resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(result.status).toBe("EXTRACTED");
    expect(result.text).toBe("Platform Engineer\nKubernetes operations");
  });

  it("fails closed for encrypted/non-text PDF rather than claiming support", () => {
    const encrypted = Buffer.from("%PDF-1.4\n/Encrypt 2 0 R\n%%EOF", "latin1");
    const result = extractResumeMechanically(encrypted, "resume.pdf", "application/pdf");
    expect(result.status).toBe("UNSUPPORTED");
    expect(result.warningCode).toBe("PDF_ENCRYPTED_UNSUPPORTED");
  });

  it("creates deterministic review proposals without assigning Career Evidence kinds", () => {
    const proposals = createImportLineProposals("Kubernetes\nDocker\nKubernetes\n");
    expect(proposals).toHaveLength(2);
    expect(proposals.map((item) => item.canonicalText)).toEqual(["Kubernetes", "Docker"]);
    expect(proposals[0]).not.toHaveProperty("kind");
  });

  it("requires the user to select evidence kind at acceptance and rejects client text injection", () => {
    expect(AcceptImportProposalInputSchema.safeParse({ kind: "SKILL" }).success).toBe(true);
    expect(AcceptImportProposalInputSchema.safeParse({ kind: "SKILL", canonicalText: "Injected" }).success).toBe(false);
    expect(AcceptImportProposalInputSchema.safeParse({ kind: "OTHER" }).success).toBe(false);
  });

  it("does not define durable raw source-byte storage", () => {
    const migration = readFileSync("supabase/migrations/20260901023000_b5_resume_import.sql", "utf8");
    const route = readFileSync("src/app/api/imports/resume/route.ts", "utf8");
    expect(migration).not.toMatch(/\bbytea\b/i);
    expect(migration).not.toContain("raw_source");
    expect(route).not.toContain("writeFile");
    expect(route).not.toContain("storage.from");
    expect(migration).toContain("'IMPORTED_RESUME'");
    expect(migration).toContain("'NEEDS_REVIEW'");
  });
});
