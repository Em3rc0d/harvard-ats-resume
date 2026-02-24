/**
 * ATS Scoring Algorithm (Server-Side)
 * 
 * This implements the keyword extraction and matching algorithm
 * as specified in the product requirements.
 */

// Common stopwords to filter out
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with', 'you', 'your', 'our', 'this', 'can',
  'have', 'or', 'we', 'their', 'they', 'all', 'also', 'any', 'been',
  'but', 'could', 'do', 'does', 'each', 'had', 'how', 'i', 'if',
  'into', 'may', 'more', 'must', 'no', 'not', 'only', 'other', 'out',
  'over', 'so', 'some', 'such', 'than', 'them', 'then', 'there',
  'these', 'through', 'up', 'very', 'what', 'when', 'where', 'which',
  'who', 'why', 'would', 'about', 'after', 'before', 'between',
]);

/**
 * Extract keywords from job description
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];

  // Convert to lowercase and split into words
  const words = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ') // Remove special chars except hyphens
    .split(/\s+/)
    .filter(word => word.length > 2); // Filter short words

  // Remove stopwords and count frequency
  const wordFreq: Map<string, number> = new Map();

  for (const word of words) {
    if (!STOPWORDS.has(word)) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  }

  // Extract technical terms and important nouns (appearing 2+ times or capitalized in original)
  const keywords: string[] = [];
  const technicalPatterns = [
    /^[a-z]+\.(js|ts|py|java|cpp|cs|rb|go|rs)$/i, // File extensions
    /^(react|angular|vue|node|python|java|typescript|javascript|sql|nosql|aws|azure|gcp|docker|kubernetes|git)$/i,
  ];

  // Add multi-word technical terms
  const multiWordTerms = extractMultiWordTerms(text);
  keywords.push(...multiWordTerms);

  // Add single word keywords based on frequency and patterns
  for (const [word, freq] of Array.from(wordFreq.entries())) {
    // Include if: appears 2+ times, or matches technical pattern, or is capitalized
    const matchesTechnical = technicalPatterns.some(pattern => pattern.test(word));
    const isRepeated = freq >= 2;

    if (matchesTechnical || isRepeated) {
      if (!keywords.includes(word)) {
        keywords.push(word);
      }
    }
  }

  // Sort by frequency and return top keywords
  return keywords
    .sort((a, b) => (wordFreq.get(b) || 0) - (wordFreq.get(a) || 0))
    .slice(0, 50); // Limit to top 50 keywords
}

/**
 * Extract multi-word technical terms
 */
function extractMultiWordTerms(text: string): string[] {
  const multiWordTerms: string[] = [];

  // Common multi-word technical terms
  const patterns = [
    /\b(machine learning|deep learning|artificial intelligence|natural language processing|computer vision|data science|software engineering|full stack|front end|back end|dev ?ops|ci\/cd|test driven development|agile development|scrum master|product manager|project manager|business analyst|data analyst|quality assurance|user experience|user interface|cloud computing|web development|mobile development|api development|rest api|graphql api)\b/gi,
  ];

  patterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const normalized = match.toLowerCase().replace(/\s+/g, ' ');
        if (!multiWordTerms.includes(normalized)) {
          multiWordTerms.push(normalized);
        }
      });
    }
  });

  return multiWordTerms;
}

/**
 * Calculate ATS score based on keyword matching
 */
export interface ATSScoreResult {
  atsScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
}

/**
 * Calculate basic quality score based on structure and content
 * Max Score: 50
 */
function calculateQualityScore(resumeText: string): number {
  let score = 0;
  const lowerText = resumeText.toLowerCase();

  // 1. Structure Checks (20 points)
  if (lowerText.includes('professional summary') || lowerText.includes('summary')) score += 5;
  if (lowerText.includes('experience') || lowerText.includes('work history')) score += 5;
  if (lowerText.includes('education') || lowerText.includes('academic')) score += 5;
  if (lowerText.includes('skills') || lowerText.includes('technologies')) score += 5;

  // 2. Metrics & Impact (15 points)
  // Look for numbers causing impact (%, $, +, x)
  const metricMatches = resumeText.match(/\d+%|\$\d+|\d+x|\d+\+/g);
  if (metricMatches) {
    if (metricMatches.length > 5) score += 15;
    else if (metricMatches.length > 2) score += 10;
    else score += 5;
  }

  // 3. Length/Depth Check (15 points)
  const wordCount = resumeText.trim().split(/\s+/).length;
  if (wordCount > 400) score += 15;
  else if (wordCount > 250) score += 10;
  else if (wordCount > 150) score += 5;

  return score;
}

export function calculateATSScore(
  jobKeywords: string[],
  resumeText: string,
  skills: string[]
): ATSScoreResult {
  // Calculate Base Quality Score (0-50)
  const qualityScore = calculateQualityScore(resumeText);
  let finalScore = qualityScore;

  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];

  if (jobKeywords.length === 0) {
    // No job description: Score is purely based on quality (Max 50) + slight boost for having skills
    // We cap it at 60 to indicate "Average" at best without targeting.
    // To get "Good" (70+), you MUST provide a Job Description.
    finalScore = Math.min(60, qualityScore + (skills.length > 5 ? 10 : 0));

    return {
      atsScore: finalScore,
      matchedKeywords: [],
      missingKeywords: [],
    };
  }

  // JD Provided: Calculate Keyword Match Score (0-50 points)
  const resumeLower = resumeText.toLowerCase();
  const skillsLower = skills.map(s => s.toLowerCase());

  for (const keyword of jobKeywords) {
    const keywordLower = keyword.toLowerCase();

    // Check if keyword appears in resume or skills
    const inResume = resumeLower.includes(keywordLower);
    const inSkills = skillsLower.some(skill =>
      skill.includes(keywordLower) || keywordLower.includes(skill)
    );

    if (inResume || inSkills) {
      matchedKeywords.push(keyword);
    } else {
      missingKeywords.push(keyword);
    }
  }

  // Keyword Score = (Maatched / Total) * 50
  const keywordMatchRatio = jobKeywords.length > 0 ? (matchedKeywords.length / jobKeywords.length) : 0;
  const keywordScore = Math.round(keywordMatchRatio * 50);

  // Final Score = Quality (Max 50) + Semantic/Keyword (Max 50)
  // However, we heavily weight the keywords.
  // Let's adjust: Quality (40%) + Keywords (60%)?
  // User wants strictness.
  // If we just add them: Max is 100.
  // Example: 
  // Quality=40 (Good resume), Keywords=10/20 (50% -> 25pts). Total = 65.
  // This seems fair and strict.
  finalScore = qualityScore + keywordScore;

  return {
    atsScore: Math.min(100, finalScore),
    matchedKeywords,
    missingKeywords,
  };
}

/**
 * Generate improvement suggestions based on ATS analysis
 */
export function generateSuggestions(
  atsScore: number,
  missingKeywords: string[],
  experience: any[]
): string[] {
  const suggestions: string[] = [];

  // Score-based suggestions
  if (atsScore < 50) {
    suggestions.push('Your resume has low keyword alignment with the job description. Consider incorporating more relevant technical terms.');
  } else if (atsScore < 70) {
    suggestions.push('Good keyword coverage, but there\'s room for improvement. Review missing keywords below.');
  } else if (atsScore >= 85) {
    suggestions.push('Excellent keyword alignment! Your resume is well-optimized for this position.');
  }

  // Missing keyword suggestions (top 5)
  if (missingKeywords.length > 0) {
    const topMissing = missingKeywords.slice(0, 5);
    suggestions.push(
      `Consider adding these keywords if relevant to your experience: ${topMissing.join(', ')}`
    );
  }

  // Experience-based suggestions
  const hasMetrics = experience.some(exp =>
    /\d+%|\d+x|increased|reduced|improved|grew/i.test(exp.description)
  );

  if (!hasMetrics) {
    suggestions.push('Add quantifiable achievements (e.g., "Increased performance by 40%") to strengthen your impact.');
  }

  // Action verb check
  const weakVerbs = experience.filter(exp =>
    /^(responsible for|worked on|helped with|did)/i.test(exp.description)
  );

  if (weakVerbs.length > 0) {
    suggestions.push('Use strong action verbs (Led, Developed, Implemented, Achieved) instead of passive language.');
  }

  return suggestions;
}
