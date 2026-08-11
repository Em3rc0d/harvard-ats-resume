import { z } from 'zod';
import type { ResumeRequest } from '../../schemas';

export const evidenceLocatorSchema = z.object({
  scope: z.enum(['SOURCE_DOCUMENT', 'EXTRACTION_OUTPUT']),
  granularity: z.enum(['DOCUMENT', 'PAGE', 'SECTION', 'FIELD']),
  page: z.number().int().positive().optional(),
  section: z.string().min(1).optional(),
  fieldPath: z.string().min(1).optional(),
}).superRefine((locator, context) => {
  if (locator.granularity === 'PAGE' && locator.page === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'PAGE locator requires a page number.',
      path: ['page'],
    });
  }

  if (locator.granularity === 'SECTION' && !locator.section) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'SECTION locator requires a section label.',
      path: ['section'],
    });
  }

  if (locator.granularity === 'FIELD' && !locator.fieldPath) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'FIELD locator requires a fieldPath.',
      path: ['fieldPath'],
    });
  }
});

export type EvidenceLocator = z.infer<typeof evidenceLocatorSchema>;

export const importedEvidenceSchema = z.object({
  fieldPath: z.string().min(1),
  excerpt: z.string().min(1),
  locator: evidenceLocatorSchema,
  confidence: z.number().min(0).max(1).optional(),
});

export type ImportedEvidence = z.infer<typeof importedEvidenceSchema>;

export const sourceReceiptSchema = z.object({
  receiptId: z.string().min(1),
  originalFileName: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  capturedAt: z.string().datetime(),
  importer: z.string().min(1),
  importerVersion: z.string().min(1),
});

export type SourceReceipt = z.infer<typeof sourceReceiptSchema>;

export const resumeImportContextSchema = z.object({
  receipt: sourceReceiptSchema,
  evidenceMap: z.array(importedEvidenceSchema),
});

export type ResumeImportContext = z.infer<typeof resumeImportContextSchema>;

export type ImportedCandidateDraft = Omit<ResumeRequest, 'jobDescription'>;

export interface ResumeImportFile {
  readonly originalFileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly bytes: Uint8Array;
}

export interface ProviderResumeExtraction {
  readonly candidate: ImportedCandidateDraft;
  readonly evidenceMap: readonly ImportedEvidence[];
  readonly importer: string;
  readonly importerVersion: string;
}

export interface ResumeImportProvider {
  extract(file: ResumeImportFile): Promise<ProviderResumeExtraction>;
}
