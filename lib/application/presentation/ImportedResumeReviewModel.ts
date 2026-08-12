import type { ResumeRequest } from '../../schemas';
import type { ResumeImportContext } from '../import/ResumeImportProvider';

export interface ImportedReviewSection {
  readonly id:
    | 'personal'
    | 'summary'
    | 'experience'
    | 'education'
    | 'skills'
    | 'projects'
    | 'certifications'
    | 'languages';
  readonly itemCount: number;
  readonly evidenceCount: number;
}

export interface ImportedResumeReviewModel {
  readonly sourceFileName: string;
  readonly sourceMimeType: string;
  readonly sourceSha256: string;
  readonly importer: string;
  readonly importerVersion: string;
  readonly totalEvidenceFields: number;
  readonly sections: readonly ImportedReviewSection[];
}

function countMaterial(values: readonly (string | undefined | null)[]): number {
  return values.filter((value) => Boolean(value?.trim())).length;
}

function evidenceCount(context: ResumeImportContext, prefixes: readonly string[]): number {
  return context.evidenceMap.filter((evidence) =>
    prefixes.some((prefix) => evidence.fieldPath === prefix || evidence.fieldPath.startsWith(`${prefix}.`) || evidence.fieldPath.startsWith(`${prefix}[`)),
  ).length;
}

/**
 * Builds a presentation-only review summary from the already validated native
 * import result. This never promotes extraction to VERIFIED_FACT: the review UI
 * only explains what the source-bound importer found before candidate review.
 */
export function buildImportedResumeReviewModel(
  data: ResumeRequest,
  context: ResumeImportContext,
): ImportedResumeReviewModel {
  const personalCount = countMaterial([
    data.personalInfo.fullName,
    data.personalInfo.location,
    data.personalInfo.email,
    data.personalInfo.linkedin,
    data.personalInfo.github,
  ]);

  return {
    sourceFileName: context.receipt.originalFileName,
    sourceMimeType: context.receipt.mimeType,
    sourceSha256: context.receipt.sha256,
    importer: context.receipt.importer,
    importerVersion: context.receipt.importerVersion,
    totalEvidenceFields: context.evidenceMap.length,
    sections: [
      { id: 'personal', itemCount: personalCount, evidenceCount: evidenceCount(context, ['personalInfo']) },
      { id: 'summary', itemCount: data.summary.trim() ? 1 : 0, evidenceCount: evidenceCount(context, ['summary']) },
      { id: 'experience', itemCount: data.experience.length, evidenceCount: evidenceCount(context, ['experience']) },
      { id: 'education', itemCount: data.education.length, evidenceCount: evidenceCount(context, ['education']) },
      {
        id: 'skills',
        itemCount: data.skills.hardSkills.length + data.skills.softSkills.length,
        evidenceCount: evidenceCount(context, ['skills']),
      },
      { id: 'projects', itemCount: data.projects?.length ?? 0, evidenceCount: evidenceCount(context, ['projects']) },
      {
        id: 'certifications',
        itemCount: data.certifications?.length ?? 0,
        evidenceCount: evidenceCount(context, ['certifications']),
      },
      { id: 'languages', itemCount: data.languages?.length ?? 0, evidenceCount: evidenceCount(context, ['languages']) },
    ],
  };
}
