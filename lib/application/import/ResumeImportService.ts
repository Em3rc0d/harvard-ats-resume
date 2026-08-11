import { createHash } from 'node:crypto';
import {
  resumeImportContextSchema,
  type ImportedCandidateDraft,
  type ResumeImportContext,
  type ResumeImportFile,
  type ResumeImportProvider,
} from './ResumeImportProvider';

export const MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024;

const SUPPORTED_FILE_TYPES = new Map<string, string>([
  ['.pdf', 'application/pdf'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]);

export interface TrustedResumeImport {
  readonly resume: ImportedCandidateDraft;
  readonly context: ResumeImportContext;
}

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
}

export function resolveResumeMimeType(fileName: string, suppliedMimeType: string): string {
  const expected = SUPPORTED_FILE_TYPES.get(fileExtension(fileName));
  if (!expected) {
    throw new Error('Unsupported resume file type. Use PDF, DOC, or DOCX.');
  }

  const supplied = suppliedMimeType.trim().toLowerCase();
  if (supplied && supplied !== 'application/octet-stream' && supplied !== expected) {
    throw new Error('Resume file extension and MIME type do not match.');
  }

  return expected;
}

export function validateResumeFileSize(byteSize: number): void {
  if (!Number.isInteger(byteSize) || byteSize <= 0) {
    throw new Error('Resume file is empty.');
  }

  if (byteSize > MAX_RESUME_FILE_BYTES) {
    throw new Error('Resume file exceeds the 10 MB limit.');
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function importResumeWithProvenance(
  provider: ResumeImportProvider,
  input: {
    readonly originalFileName: string;
    readonly suppliedMimeType: string;
    readonly bytes: Uint8Array;
    readonly capturedAt?: string;
  },
): Promise<TrustedResumeImport> {
  validateResumeFileSize(input.bytes.byteLength);
  const mimeType = resolveResumeMimeType(input.originalFileName, input.suppliedMimeType);
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const sha256 = sha256Hex(input.bytes);
  const file: ResumeImportFile = {
    originalFileName: input.originalFileName,
    mimeType,
    byteSize: input.bytes.byteLength,
    bytes: input.bytes,
  };

  const extraction = await provider.extract(file);
  const receiptId = `resume-import-${createHash('sha256')
    .update(`${sha256}:${capturedAt}:${input.originalFileName}`)
    .digest('hex')
    .slice(0, 24)}`;

  const context = resumeImportContextSchema.parse({
    receipt: {
      receiptId,
      originalFileName: input.originalFileName,
      mimeType,
      byteSize: input.bytes.byteLength,
      sha256,
      capturedAt,
      importer: extraction.importer,
      importerVersion: extraction.importerVersion,
    },
    evidenceMap: extraction.evidenceMap,
  });

  return {
    resume: extraction.candidate,
    context,
  };
}
