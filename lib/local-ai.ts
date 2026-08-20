import type { ResumeRequest } from './schemas';
import { AIProviderFailure, classifyAIProviderError } from './application/ai/AIProviderFailure';
import {
  OLLAMA_RESUME_PROVIDER,
  OllamaResumeProvider,
} from './infrastructure/ai/OllamaResumeProvider';

export { sanitizeResumeData } from './application/resume/ResumeInputSanitizer';

export async function generateResumeWithAI(data: ResumeRequest): Promise<{
  success: boolean;
  formattedResume?: string;
  matchedKeywords?: string[];
  improvedResume?: string;
  providerFailure?: AIProviderFailure;
  error?: string;
}> {
  try {
    const provider = new OllamaResumeProvider();
    const proposal = await provider.generate(data);
    const improvedResume = proposal.improvedResume.trim();

    return {
      success: true,
      formattedResume: proposal.formattedResume,
      matchedKeywords: proposal.matchedKeywords,
      improvedResume: improvedResume.length > 100 ? improvedResume : undefined,
    };
  } catch (error) {
    const failure = error instanceof AIProviderFailure
      ? error
      : classifyAIProviderError(error, OLLAMA_RESUME_PROVIDER);
    console.error('Local AI resume provider failure:', {
      kind: failure.kind,
      provider: failure.provider,
      retryable: failure.retryable,
      statusCode: failure.statusCode,
    });
    return {
      success: false,
      providerFailure: failure,
      error: failure.message,
    };
  }
}

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
    if (item.institution.trim()) text += `${item.institution}\n`;
    if (item.degree.trim()) text += `${item.degree}\n`;
    if (item.honors?.trim()) text += `${item.honors}\n`;
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
    const languages = data.languages!
      .map((item) => [item.language, item.proficiency].filter((value) => value.trim()).join(': '))
      .filter(Boolean);
    if (languages.length > 0) text += `${languages.join(' | ')}\n`;
  }

  return text.trim();
}
