import type { ResumeRequest } from './schemas';
import { GeminiResumeProvider } from './infrastructure/ai/GeminiResumeProvider';

/**
 * Generate a resume through the ATS v2 AI provider boundary while preserving
 * the legacy function contract used by the current API route.
 */
export async function generateResumeWithGemini(data: ResumeRequest): Promise<{
  success: boolean;
  formattedResume?: string;
  matchedKeywords?: string[];
  suggestions?: string[];
  improvedResume?: string;
  error?: string;
}> {
  try {
    const provider = new GeminiResumeProvider();
    const proposal = await provider.generate(data);
    const improvedResume = proposal.improvedResume.trim();

    return {
      success: true,
      formattedResume: proposal.formattedResume,
      matchedKeywords: proposal.matchedKeywords,
      suggestions: proposal.suggestions,
      improvedResume: improvedResume.length > 100 ? improvedResume : undefined,
    };
  } catch (error) {
    console.error('Gemini API Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate resume',
    };
  }
}

/**
 * Sanitize user input before sending to AI.
 * This is transport hygiene only; prompt-injection and factual grounding are
 * enforced by separate ATS v2 boundaries.
 */
export function sanitizeResumeData(data: ResumeRequest): ResumeRequest {
  const sanitizeString = (str: string): string => {
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .trim()
      .slice(0, 50000);
  };

  return JSON.parse(
    JSON.stringify(data, (_key, value) => {
      if (typeof value === 'string') {
        return sanitizeString(value);
      }
      return value;
    })
  );
}

/**
 * Helper to format resume sections to reduce cognitive complexity.
 */
function formatExperiences(experience: ResumeRequest['experience']): string {
  if (!experience || experience.length === 0) return '';
  let text = 'EXPERIENCE\n';
  experience.forEach(exp => {
    text += `${exp.company.toUpperCase()} — ${exp.role.toUpperCase()}\n`;
    text += `${exp.startDate} - ${exp.endDate}\n`;
    const points = exp.description
      .split('\n')
      .map((point) => point.trim())
      .filter((point) => point.length > 0);
    points.forEach((point) => {
      const cleanPoint = point.replace(/^[•*-]\s*/, '');
      text += `• ${cleanPoint}\n`;
    });
    text += '\n';
  });
  return text;
}

function formatProjects(projects: NonNullable<ResumeRequest['projects']>): string {
  if (!projects || projects.length === 0) return '';
  let text = 'PROJECTS\n';
  projects.forEach(proj => {
    text += `${proj.name.toUpperCase()}\n`;
    text += `${proj.description}\n`;
    if (proj.technologies && proj.technologies.length > 0) {
      text += `Technologies: ${proj.technologies.join(', ')}\n`;
    }
    text += '\n';
  });
  return text;
}

function formatEducation(education: ResumeRequest['education']): string {
  if (!education || education.length === 0) return '';
  let text = 'EDUCATION\n';
  education.forEach(edu => {
    text += `${edu.institution}\n`;
    text += `${edu.degree}, ${edu.startDate} - ${edu.endDate}\n\n`;
  });
  return text;
}

function formatSkills(skills: ResumeRequest['skills']): string {
  let text = 'SKILLS\n';
  if (skills.hardSkills?.length > 0) {
    text += `Technical Skills: ${skills.hardSkills.join(', ')}\n`;
  }
  if (skills.softSkills?.length > 0) {
    text += `Soft Skills: ${skills.softSkills.join(', ')}\n`;
  }
  return text + '\n';
}

/**
 * Format structured resume data into Harvard-style text.
 */
export function formatResumeFromData(data: ResumeRequest): string {
  let text = '';

  text += `${data.personalInfo.fullName.toUpperCase()}\n`;
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

  text += `PROFESSIONAL SUMMARY\n${data.summary}\n\n`;

  text += formatExperiences(data.experience);
  text += formatProjects(data.projects ?? []);
  text += formatEducation(data.education);
  text += formatSkills(data.skills);

  const certifications = data.certifications;
  if (certifications && certifications.length > 0) {
    text += 'CERTIFICATIONS\n';
    certifications.forEach(cert => {
      text += `${cert.name} — ${cert.issuer}, ${cert.date}\n`;
    });
    text += '\n';
  }

  const languages = data.languages;
  if (languages && languages.length > 0) {
    text += 'LANGUAGES\n';
    const langs = languages.map(language => `${language.language}: ${language.proficiency}`);
    text += `${langs.join(' | ')}\n`;
  }

  return text.trim();
}
