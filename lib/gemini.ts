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
  const keywordsMatch = responseText.match(/===\s*MATCHED KEYWORDS\s*===\s*([\s\S]*?)(?:===|$)/i);
  const matchedKeywordsText = keywordsMatch ? keywordsMatch[1].trim() : '';
  const matchedKeywords = matchedKeywordsText
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);

  // Extract suggestions - handle boundary with IMPROVED RESUME
  const suggestionsMatch = responseText.match(/===\s*IMPROVEMENT SUGGESTIONS\s*===\s*([\s\S]*?)(?:===\s*IMPROVED RESUME\s*===|$)/i);
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
    improvedResumeRaw = improvedResumeRaw.replace(/^```[\w]*\n/, '').replace(/\n```$/, '').trim();
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

  // Experience
  if (data.experience && data.experience.length > 0) {
    text += `EXPERIENCE\n`;
    data.experience.forEach(exp => {
      text += `${exp.company.toUpperCase()} — ${exp.role.toUpperCase()}\n`;
      text += `${exp.startDate} - ${exp.endDate}\n`;
      // Handle description points. If it's a block text, split by newlines or bullets.
      // If it's already bulleted, keep it. If not, try to split.
      const points = exp.description.split('\n').map(p => p.trim()).filter(p => p.length > 0);
      points.forEach(point => {
        const cleanPoint = point.replace(/^[•\-\*]\s*/, '');
        text += `• ${cleanPoint}\n`;
      });
      text += '\n'; // Add spacing between jobs
    });
  }

  // Projects (Optional)
  if (data.projects && data.projects.length > 0) {
    text += `PROJECTS\n`;
    data.projects.forEach(proj => {
      text += `${proj.name.toUpperCase()}\n`;
      text += `${proj.description}\n`;
      if (proj.technologies && proj.technologies.length > 0) {
        text += `Technologies: ${proj.technologies.join(', ')}\n`;
      }
      text += '\n';
    });
  }

  // Education
  if (data.education && data.education.length > 0) {
    text += `EDUCATION\n`;
    data.education.forEach(edu => {
      text += `${edu.institution}\n`;
      text += `${edu.degree}, ${edu.startDate} - ${edu.endDate}\n\n`;
    });
  }

  // Skills
  text += `SKILLS\n`;
  if (data.skills.hardSkills && data.skills.hardSkills.length > 0) {
    text += `Technical Skills: ${data.skills.hardSkills.join(', ')}\n`;
  }
  if (data.skills.softSkills && data.skills.softSkills.length > 0) {
    text += `Soft Skills: ${data.skills.softSkills.join(', ')}\n`;
  }
  text += '\n';

  // Certifications
  if (data.certifications && data.certifications.length > 0) {
    text += `CERTIFICATIONS\n`;
    data.certifications.forEach(cert => {
      text += `${cert.name} — ${cert.issuer}, ${cert.date}\n`;
    });
    text += '\n';
  }

  // Languages
  if (data.languages && data.languages.length > 0) {
    text += `LANGUAGES\n`;
    const langs = data.languages.map(l => `${l.language}: ${l.proficiency}`);
    text += `${langs.join(' | ')}\n`;
  }

  return text.trim();
}
