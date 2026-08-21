import type { ResumeRequest } from './schemas';

export { sanitizeResumeData } from './application/resume/ResumeInputSanitizer';

export const DETERMINISTIC_RESUME_PROVIDER = 'cv-engine-deterministic' as const;
export const DETERMINISTIC_RESUME_MODEL = 'source-preserving-resume-composer-v2' as const;
export const DETERMINISTIC_RESUME_CONTRACT_VERSION = 'ats2-evidence-bound-resume-v2' as const;

export interface ResumeDraftResult {
  readonly success: boolean;
  readonly formattedResume?: string;
  readonly matchedKeywords?: string[];
  readonly improvedResume?: string;
  readonly generation?: {
    readonly provider: string;
    readonly model: string;
    readonly contractVersion: string;
  };
  readonly error?: string;
}

/**
 * Final resume assembly is application-owned and deterministic.
 *
 * Local models remain useful for bounded import and inline presentation
 * optimization, but a whole-resume model call is deliberately not part of the
 * trusted generation critical path. Candidate data has already crossed the
 * evidence/review boundary; this composer only renders those facts into an
 * ATS-readable document. Grounding, semantic grounding, claim provenance and
 * durable ResumeVersion composition still run after this step.
 */
export async function generateResumeDraft(data: ResumeRequest): Promise<ResumeDraftResult> {
  const formattedResume = formatResumeFromData(data).trim();
  if (!formattedResume) {
    return {
      success: false,
      error: 'No source-backed candidate content was available for resume assembly.',
    };
  }

  return {
    success: true,
    formattedResume,
    matchedKeywords: [],
    generation: {
      provider: DETERMINISTIC_RESUME_PROVIDER,
      model: DETERMINISTIC_RESUME_MODEL,
      contractVersion: DETERMINISTIC_RESUME_CONTRACT_VERSION,
    },
  };
}

/**
 * Compatibility alias retained while callers migrate from the former
 * whole-resume model path. It performs no network or model request.
 */
export const generateResumeWithAI = generateResumeDraft;

function formatExperiences(experience: ResumeRequest['experience']): string {
  if (experience.length === 0) return '';
  let text = 'EXPERIENCE\n';
  experience.forEach((item) => {
    const identity = [item.company, item.role].filter((value) => value.trim()).join(' — ');
    if (identity) text += `${identity}\n`;

    const period = [item.startDate, item.endDate].filter((value) => value.trim()).join(' - ');
    if (period) text += `${period}\n`;

    item.description
      .split('\n')
      .map((point) => point.trim())
      .filter(Boolean)
      .forEach((point) => {
        text += `• ${point.replace(/^[•*-]\s*/, '')}\n`;
      });

    if (item.technologies.length > 0) {
      text += `Technologies: ${item.technologies.join(', ')}\n`;
    }
    text += '\n';
  });
  return text;
}

function formatProjects(projects: NonNullable<ResumeRequest['projects']>): string {
  if (projects.length === 0) return '';
  let text = 'PROJECTS\n';
  projects.forEach((project) => {
    if (project.name.trim()) text += `${project.name}\n`;
    if (project.description.trim()) text += `${project.description}\n`;
    if (project.technologies.length > 0) text += `Technologies: ${project.technologies.join(', ')}\n`;
    if (project.link?.trim()) text += `${project.link}\n`;
    text += '\n';
  });
  return text;
}

function formatEducation(education: ResumeRequest['education']): string {
  if (education.length === 0) return '';
  let text = 'EDUCATION\n';
  education.forEach((item) => {
    const identity = [item.institution, item.degree, item.honors ?? '']
      .filter((value) => value.trim())
      .join(' — ');
    if (identity) text += `${identity}\n`;
    const period = [item.startDate, item.endDate].filter((value) => value.trim()).join(' - ');
    if (period) text += `${period}\n`;
    text += '\n';
  });
  return text;
}

function formatSkills(skills: ResumeRequest['skills']): string {
  if (skills.hardSkills.length === 0 && skills.softSkills.length === 0) return '';
  let text = 'SKILLS\n';
  if (skills.hardSkills.length > 0) text += `Technical Skills: ${skills.hardSkills.join(', ')}\n`;
  if (skills.softSkills.length > 0) text += `Soft Skills: ${skills.softSkills.join(', ')}\n`;
  return `${text}\n`;
}

export function formatResumeFromData(data: ResumeRequest): string {
  let text = `${data.personalInfo.fullName.toUpperCase()}\n`;
  const contactParts = [
    data.personalInfo.location,
    data.personalInfo.email,
    data.personalInfo.linkedin
      ? `LinkedIn: ${data.personalInfo.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '')}`
      : '',
    data.personalInfo.github
      ? `GitHub: ${data.personalInfo.github.replace(/^https?:\/\/(www\.)?github\.com\//, '')}`
      : '',
  ].filter(Boolean);
  text += `${contactParts.join(' | ')}\n\n`;

  if (data.summary.trim()) text += `PROFESSIONAL SUMMARY\n${data.summary}\n\n`;
  text += formatExperiences(data.experience);
  text += formatProjects(data.projects ?? []);
  text += formatEducation(data.education);
  text += formatSkills(data.skills);

  if ((data.certifications?.length ?? 0) > 0) {
    text += 'CERTIFICATIONS\n';
    data.certifications!.forEach((item) => {
      const line = [item.name, item.issuer, item.date].filter((value) => value.trim()).join(' — ');
      if (line) text += `${line}\n`;
    });
    text += '\n';
  }

  if ((data.languages?.length ?? 0) > 0) {
    text += 'LANGUAGES\n';
    data.languages!.forEach((item) => {
      const line = [item.language, item.proficiency].filter((value) => value.trim()).join(' — ');
      if (line) text += `${line}\n`;
    });
  }

  return text.trim();
}
