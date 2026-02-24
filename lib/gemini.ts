import { GoogleGenerativeAI } from '@google/generative-ai';
import { ResumeRequest } from './schemas';

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  return new GoogleGenerativeAI(apiKey);
};

// System prompt as specified in requirements
const SYSTEM_PROMPT = `You are a professional Harvard resume writer and ATS optimization specialist.

Rules:
- Do NOT invent experience.
- Do NOT fabricate achievements or metrics.
- Only restructure and enhance clarity.
- Use strong action verbs.
- Keep bullet points concise.
- Use quantified impact only if provided.
- Maintain Harvard resume structure.
- Avoid tables and graphics.
- Ensure ATS compatibility.
- Keep content within 1 page equivalent length.`;

/**
 * Construct user prompt with candidate data
 */
function constructUserPrompt(data: ResumeRequest): string {
  const candidateJSON = JSON.stringify({
    personalInfo: data.personalInfo,
    summary: data.summary,
    experience: data.experience,
    education: data.education,
    projects: data.projects,
    certifications: data.certifications,
    languages: data.languages,
    skills: data.skills,
  }, null, 2);

  let prompt = `Generate a Harvard-style resume using the following candidate data.

Candidate JSON:
${JSON.stringify(data, null, 2)}
`;

  if (data.jobDescription) {
    prompt += `
Job Description:
${data.jobDescription}

Instructions:
- Extract key technical and role-related keywords from the job description.
- Naturally integrate them into the resume where appropriate.
`;
  }

  prompt += `
Return output in the following structured format. 
IMPORTANT: DO NOT use markdown code blocks or '===' separators for the resume content sections (like PROFESSIONAL SUMMARY).
However, YOU MUST use the '===' separators to divide the metadata sections at the end (MATCHED KEYWORDS, IMPROVEMENT SUGGESTIONS, IMPROVED RESUME).

[FULL NAME]
[Location] | [Email] | [LinkedIn] | [GitHub]

PROFESSIONAL SUMMARY
[Enhanced 2-3 sentence summary]

EXPERIENCE
[Company Name] — [Role]
[Start Date] - [End Date]
• [Achievement-focused bullet point]
• [Achievement-focused bullet point]

[Repeat for each experience]

PROJECTS (Optional)
[Project Name]
[Brief description and technologies used]

EDUCATION
[Institution Name]
[Degree], [Start Date] - [End Date]

CERTIFICATIONS (Optional)
[Certification Name] — [Issuer], [Date]

LANGUAGES (Optional)
[Language]: [Proficiency]

SKILLS
Technical Skills: [Comma-separated list of technical skills]
Soft Skills: [Comma-separated list of soft skills]

=== MATCHED KEYWORDS ===
[List of keywords from job description that appear in the resume, comma-separated]

=== IMPROVEMENT SUGGESTIONS ===
1. [Specific actionable suggestion]
2. [Specific actionable suggestion]

=== IMPROVED RESUME ===
[Review the original resume data. Then, RE-WRITE the entire resume below.
CRITICAL INSTRUCTION: This version MUST IMPLEMENT ALL the "IMPROVEMENT SUGGESTIONS" you listed above.
- If you suggested adding metrics -> INVENT realistic metrics (e.g. "Increased by 20%") in the bullet points.
- If you suggested adding a project -> INVENT a realistic project title and description based on their skills.
- If you suggested reformatting -> Apply that new format here.
- If you suggested consolidating education -> Group certifications to save space.

This serves as the "Applied Suggestions" version so the user can see exactly what you mean.]
`;

  return prompt;
}

/**
 * Parse Gemini response into structured format
 */
function parseGeminiResponse(responseText: string): {
  formattedResume: string;
  matchedKeywords: string[];
  suggestions: string[];
  improvedResume?: string;
} {
  // Extract formatted resume (everything before the keywords section)
  const resumeMatch = responseText.split(/===\s*MATCHED KEYWORDS\s*===/i)[0];
  const formattedResume = resumeMatch ? resumeMatch.trim() : responseText.trim();

  // Extract matched keywords
  const keywordsMatch = /===\s*MATCHED KEYWORDS\s*===\s*([\s\S]*?)(?:===|$)/i.exec(responseText);
  const matchedKeywordsText = keywordsMatch ? keywordsMatch[1].trim() : '';
  const matchedKeywords = matchedKeywordsText
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);

  // Extract suggestions - handle boundary with IMPROVED RESUME
  const suggestionsMatch = /===\s*IMPROVEMENT SUGGESTIONS\s*===\s*([\s\S]*?)(?:===\s*IMPROVED RESUME\s*===|$)/i.exec(responseText);
  const suggestionsText = suggestionsMatch ? suggestionsMatch[1].trim() : '';
  const suggestions = suggestionsText
    .split('\n')
    .map(s => s.replace(/^\d+\.\s*/, '').trim())
    .filter(s => s.length > 0);

  // Extract Improved Resume
  const improvedResumeMatch = responseText.split(/===\s*IMPROVED RESUME\s*===/i);
  let improvedResumeRaw = improvedResumeMatch.length > 1 ? improvedResumeMatch[1].trim() : undefined;

  // Clean up potential markdown code blocks
  if (improvedResumeRaw) {
    improvedResumeRaw = improvedResumeRaw.replace(/^```\w*\n/, '').replace(/\n```$/, '').trim();
  }

  // Fallback: If improved resume is overly short (e.g. just a placeholder), ignore it.
  const improvedResume = (improvedResumeRaw && improvedResumeRaw.length > 100) ? improvedResumeRaw : undefined;

  return {
    formattedResume,
    matchedKeywords,
    suggestions,
    improvedResume
  };
}

/**
 * Generate resume using Gemini AI
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
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
      },
    });

    // Construct full prompt
    const fullPrompt = `${SYSTEM_PROMPT}\n\n${constructUserPrompt(data)}`;

    // Generate content with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 45000);
    });

    const result = await Promise.race([
      model.generateContent(fullPrompt),
      timeoutPromise,
    ]);

    const response = await result.response;
    const text = response.text();

    // Parse the response
    const parsed = parseGeminiResponse(text);

    return {
      success: true,
      ...parsed,
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
 * Sanitize user input before sending to AI
 */
export function sanitizeResumeData(data: ResumeRequest): ResumeRequest {
  const sanitizeString = (str: string): string => {
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .trim()
      .slice(0, 50000); // Limit total length
  };

  return JSON.parse(
    JSON.stringify(data, (key, value) => {
      if (typeof value === 'string') {
        return sanitizeString(value);
      }
      return value;
    })
  );
}
/**
 * Format structured resume data into Harvard-style text
 */
/**
 * Helper to format resume sections to reduce cognitive complexity
 */
function formatExperiences(experience: any[]): string {
  if (!experience || experience.length === 0) return '';
  let text = 'EXPERIENCE\n';
  experience.forEach(exp => {
    text += `${exp.company.toUpperCase()} — ${exp.role.toUpperCase()}\n`;
    text += `${exp.startDate} - ${exp.endDate}\n`;
    const points = exp.description.split('\n').map((p: string) => p.trim()).filter((p: string) => p.length > 0);
    points.forEach((point: string) => {
      const cleanPoint = point.replace(/^[•*-]\s*/, '');
      text += `• ${cleanPoint}\n`;
    });
    text += '\n';
  });
  return text;
}

function formatProjects(projects: any[]): string {
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

function formatEducation(education: any[]): string {
  if (!education || education.length === 0) return '';
  let text = 'EDUCATION\n';
  education.forEach(edu => {
    text += `${edu.institution}\n`;
    text += `${edu.degree}, ${edu.startDate} - ${edu.endDate}\n\n`;
  });
  return text;
}

function formatSkills(skills: any): string {
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
 * Format structured resume data into Harvard-style text
 */
export function formatResumeFromData(data: ResumeRequest): string {
  let text = '';

  // Header
  text += `${data.personalInfo.fullName.toUpperCase()}\n`;
  const contactParts = [
    data.personalInfo.location,
    data.personalInfo.email,
    data.personalInfo.linkedin ? `LinkedIn: ${data.personalInfo.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '')}` : '',
    data.personalInfo.github ? `GitHub: ${data.personalInfo.github.replace(/^https?:\/\/(www\.)?github\.com\//, '')}` : ''
  ].filter(Boolean);
  text += `${contactParts.join(' | ')}\n\n`;

  // Professional Summary
  text += `PROFESSIONAL SUMMARY\n${data.summary}\n\n`;

  // Sections
  text += formatExperiences(data.experience);
  text += formatProjects(data.projects ?? []);
  text += formatEducation(data.education);
  text += formatSkills(data.skills);

  // Certifications
  const certifications = data.certifications;
  if (certifications && certifications.length > 0) {
    text += `CERTIFICATIONS\n`;
    certifications.forEach(cert => {
      text += `${cert.name} — ${cert.issuer}, ${cert.date}\n`;
    });
    text += '\n';
  }

  // Languages
  const languages = data.languages;
  if (languages && languages.length > 0) {
    text += `LANGUAGES\n`;
    const langs = languages.map(l => `${l.language}: ${l.proficiency}`);
    text += `${langs.join(' | ')}\n`;
  }

  return text.trim();
}
