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
    skills: data.skills,
  }, null, 2);

  let prompt = `Generate a Harvard-style resume using the following candidate data.

Candidate JSON:
${candidateJSON}
`;

  if (data.jobDescription) {
    prompt += `
Job Description:
${data.jobDescription}

Instructions:
- Extract key technical and role-related keywords from the job description.
- Naturally integrate them into the resume where appropriate.
- Do not force irrelevant keywords.
- Maintain authenticity.
`;
  }

  prompt += `
Return output in the following structured format:

=== FORMATTED RESUME ===
[Full Harvard-structured resume text here - format with clear sections:]

[FULL NAME]
[Location] | [Email] | [LinkedIn] | [GitHub]

PROFESSIONAL SUMMARY
[Enhanced 2-3 sentence summary]

EXPERIENCE
[Company Name] — [Role]
[Start Date] - [End Date]
• [Achievement-focused bullet point with action verb]
• [Achievement-focused bullet point with action verb]
• [Achievement-focused bullet point with action verb]

[Repeat for each experience]

EDUCATION
[Institution Name]
[Degree], [Start Date] - [End Date]

[Repeat for each education]

SKILLS
Technical Skills: [Comma-separated list]
Soft Skills: [Comma-separated list]

=== END FORMATTED RESUME ===

=== MATCHED KEYWORDS ===
[List of keywords from job description that appear in the resume, comma-separated]

=== IMPROVEMENT SUGGESTIONS ===
1. [Specific actionable suggestion]
2. [Specific actionable suggestion]
3. [Specific actionable suggestion]
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
} {
  // Extract formatted resume
  const resumeMatch = responseText.match(/===\s*FORMATTED RESUME\s*===\s*([\s\S]*?)\s*===\s*END FORMATTED RESUME\s*===/i);
  const formattedResume = resumeMatch ? resumeMatch[1].trim() : responseText;

  // Extract matched keywords
  const keywordsMatch = responseText.match(/===\s*MATCHED KEYWORDS\s*===\s*([\s\S]*?)\s*===/i);
  const matchedKeywordsText = keywordsMatch ? keywordsMatch[1].trim() : '';
  const matchedKeywords = matchedKeywordsText
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);

  // Extract suggestions
  const suggestionsMatch = responseText.match(/===\s*IMPROVEMENT SUGGESTIONS\s*===\s*([\s\S]*?)(?:===|$)/i);
  const suggestionsText = suggestionsMatch ? suggestionsMatch[1].trim() : '';
  const suggestions = suggestionsText
    .split('\n')
    .map(s => s.replace(/^\d+\.\s*/, '').trim())
    .filter(s => s.length > 0);

  return {
    formattedResume,
    matchedKeywords,
    suggestions,
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
