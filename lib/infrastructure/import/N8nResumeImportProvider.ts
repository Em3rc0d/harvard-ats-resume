import { z } from 'zod';
import type {
  ImportedCandidateDraft,
  ImportedEvidence,
  ProviderResumeExtraction,
  ResumeImportFile,
  ResumeImportProvider,
} from '../../application/import/ResumeImportProvider';

const REQUEST_TIMEOUT_MS = 30_000;
const IMPORTER_VERSION = 'n8n-webhook-v1';

const rawEvidenceSchema = z.object({
  fieldPath: z.string().min(1),
  excerpt: z.string().min(1),
  page: z.number().int().positive().optional(),
  section: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const rawExtractionSchema = z.object({
  personalInfo: z.object({
    fullName: z.string().optional(),
    email: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string().optional(),
    github: z.string().optional(),
  }).optional(),
  summary: z.string().optional(),
  experience: z.array(z.object({
    company: z.string().optional(),
    role: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    description: z.string().optional(),
    technologies: z.array(z.string()).optional(),
  }).passthrough()).optional(),
  education: z.array(z.object({
    institution: z.string().optional(),
    degree: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }).passthrough()).optional(),
  skills: z.object({
    hardSkills: z.array(z.string()).optional(),
    softSkills: z.array(z.string()).optional(),
  }).optional(),
  projects: z.array(z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    technologies: z.array(z.string()).optional(),
    link: z.string().optional(),
  }).passthrough()).optional(),
  certifications: z.array(z.object({
    name: z.string().optional(),
    issuer: z.string().optional(),
    date: z.string().optional(),
  }).passthrough()).optional(),
  languages: z.array(z.object({
    language: z.string().optional(),
    proficiency: z.string().optional(),
  }).passthrough()).optional(),
  evidenceMap: z.array(rawEvidenceSchema).optional(),
  _evidence: z.array(rawEvidenceSchema).optional(),
}).passthrough();

type RawEvidence = z.infer<typeof rawEvidenceSchema>;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function mapCandidate(raw: z.infer<typeof rawExtractionSchema>): ImportedCandidateDraft {
  return {
    personalInfo: {
      fullName: clean(raw.personalInfo?.fullName),
      email: clean(raw.personalInfo?.email),
      location: clean(raw.personalInfo?.location),
      linkedin: clean(raw.personalInfo?.linkedin),
      github: clean(raw.personalInfo?.github),
    },
    summary: clean(raw.summary),
    experience: (raw.experience ?? []).map((experience) => ({
      company: clean(experience.company),
      role: clean(experience.role),
      startDate: clean(experience.startDate),
      endDate: clean(experience.endDate),
      description: clean(experience.description),
      technologies: (experience.technologies ?? []).map(clean).filter(Boolean),
    })),
    education: (raw.education ?? []).map((education) => ({
      institution: clean(education.institution),
      degree: clean(education.degree),
      startDate: clean(education.startDate),
      endDate: clean(education.endDate),
    })),
    skills: {
      hardSkills: (raw.skills?.hardSkills ?? []).map(clean).filter(Boolean),
      softSkills: (raw.skills?.softSkills ?? []).map(clean).filter(Boolean),
    },
    projects: (raw.projects ?? []).map((project) => ({
      name: clean(project.name),
      description: clean(project.description),
      technologies: (project.technologies ?? []).map(clean).filter(Boolean),
      link: clean(project.link),
    })),
    certifications: (raw.certifications ?? []).map((certification) => ({
      name: clean(certification.name),
      issuer: clean(certification.issuer),
      date: clean(certification.date),
    })),
    languages: (raw.languages ?? []).map((language) => ({
      language: clean(language.language),
      proficiency: clean(language.proficiency),
    })),
  };
}

function sourceEvidence(item: RawEvidence): ImportedEvidence {
  const locator = item.page !== undefined
    ? {
        scope: 'SOURCE_DOCUMENT' as const,
        granularity: 'PAGE' as const,
        page: item.page,
        section: item.section,
        fieldPath: item.fieldPath,
      }
    : item.section
      ? {
          scope: 'SOURCE_DOCUMENT' as const,
          granularity: 'SECTION' as const,
          section: item.section,
          fieldPath: item.fieldPath,
        }
      : {
          scope: 'EXTRACTION_OUTPUT' as const,
          granularity: 'FIELD' as const,
          fieldPath: item.fieldPath,
        };

  return {
    fieldPath: item.fieldPath,
    excerpt: item.excerpt.trim(),
    locator,
    confidence: item.confidence,
  };
}

function collectFallbackEvidence(candidate: ImportedCandidateDraft): ImportedEvidence[] {
  const evidence: ImportedEvidence[] = [];

  const add = (fieldPath: string, excerpt: string) => {
    const value = excerpt.trim();
    if (!value) return;
    evidence.push({
      fieldPath,
      excerpt: value,
      locator: {
        scope: 'EXTRACTION_OUTPUT',
        granularity: 'FIELD',
        fieldPath,
      },
    });
  };

  add('personalInfo.fullName', candidate.personalInfo.fullName);
  add('personalInfo.email', candidate.personalInfo.email);
  add('personalInfo.location', candidate.personalInfo.location);
  add('personalInfo.linkedin', candidate.personalInfo.linkedin ?? '');
  add('personalInfo.github', candidate.personalInfo.github ?? '');
  add('summary', candidate.summary);

  candidate.experience.forEach((experience, index) => {
    add(`experience[${index}].company`, experience.company);
    add(`experience[${index}].role`, experience.role);
    add(`experience[${index}].startDate`, experience.startDate);
    add(`experience[${index}].endDate`, experience.endDate);
    add(`experience[${index}].description`, experience.description);
    experience.technologies.forEach((technology, techIndex) => {
      add(`experience[${index}].technologies[${techIndex}]`, technology);
    });
  });

  candidate.education.forEach((education, index) => {
    add(`education[${index}].institution`, education.institution);
    add(`education[${index}].degree`, education.degree);
    add(`education[${index}].startDate`, education.startDate);
    add(`education[${index}].endDate`, education.endDate);
  });

  candidate.skills.hardSkills.forEach((skill, index) => add(`skills.hardSkills[${index}]`, skill));
  candidate.skills.softSkills.forEach((skill, index) => add(`skills.softSkills[${index}]`, skill));

  (candidate.projects ?? []).forEach((project, index) => {
    add(`projects[${index}].name`, project.name);
    add(`projects[${index}].description`, project.description);
    project.technologies.forEach((technology, techIndex) => {
      add(`projects[${index}].technologies[${techIndex}]`, technology);
    });
    add(`projects[${index}].link`, project.link ?? '');
  });

  (candidate.certifications ?? []).forEach((certification, index) => {
    add(`certifications[${index}].name`, certification.name);
    add(`certifications[${index}].issuer`, certification.issuer);
    add(`certifications[${index}].date`, certification.date);
  });

  (candidate.languages ?? []).forEach((language, index) => {
    add(`languages[${index}].language`, language.language);
    add(`languages[${index}].proficiency`, language.proficiency);
  });

  return evidence;
}

function mergeEvidence(
  candidate: ImportedCandidateDraft,
  rawEvidence: readonly RawEvidence[],
): ImportedEvidence[] {
  const byFieldPath = new Map<string, ImportedEvidence>();

  rawEvidence.forEach((item) => {
    if (item.excerpt.trim()) byFieldPath.set(item.fieldPath, sourceEvidence(item));
  });

  collectFallbackEvidence(candidate).forEach((item) => {
    if (!byFieldPath.has(item.fieldPath)) byFieldPath.set(item.fieldPath, item);
  });

  return Array.from(byFieldPath.values());
}

function hasCandidateContent(candidate: ImportedCandidateDraft): boolean {
  return Boolean(
    candidate.personalInfo.fullName ||
    candidate.summary ||
    candidate.experience.length > 0 ||
    candidate.education.length > 0 ||
    candidate.skills.hardSkills.length > 0,
  );
}

export class N8nResumeImportProvider implements ResumeImportProvider {
  async extract(file: ResumeImportFile): Promise<ProviderResumeExtraction> {
    // Prefer the new private variable. The legacy NEXT_PUBLIC name is accepted
    // only inside this server-side module so existing deployments keep working
    // while configuration is rotated; browser code no longer references it.
    const endpoint = process.env.N8N_RESUME_URL ?? process.env.NEXT_PUBLIC_N8N_RESUME_URL;
    if (!endpoint) {
      throw new Error('N8N_RESUME_URL is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const formData = new FormData();
      const blobBytes = file.bytes.buffer.slice(
        file.bytes.byteOffset,
        file.bytes.byteOffset + file.bytes.byteLength,
      ) as ArrayBuffer;
      formData.append(
        'file',
        new Blob([blobBytes], { type: file.mimeType }),
        file.originalFileName,
      );

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Resume importer returned HTTP ${response.status}`);
      }

      const payload: unknown = await response.json();
      const firstItem = Array.isArray(payload) ? payload[0] : payload;

      if (
        typeof firstItem === 'object' &&
        firstItem !== null &&
        'message' in firstItem &&
        firstItem.message === 'Workflow was started'
      ) {
        throw new Error('Resume importer did not return extraction data');
      }

      const parsed = rawExtractionSchema.parse(firstItem);
      const candidate = mapCandidate(parsed);

      if (!hasCandidateContent(candidate)) {
        throw new Error('Resume importer returned no usable candidate content');
      }

      return {
        candidate,
        evidenceMap: mergeEvidence(candidate, parsed.evidenceMap ?? parsed._evidence ?? []),
        importer: 'n8n',
        importerVersion: IMPORTER_VERSION,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
