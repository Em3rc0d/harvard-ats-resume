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

export function calculateATSScore(
  jobKeywords: string[],
  resumeText: string,
  skills: string[]
): ATSScoreResult {
  if (jobKeywords.length === 0) {
    // No job description provided - return neutral score
    return {
      atsScore: 75,
      matchedKeywords: [],
      missingKeywords: [],
    };
  }

  const resumeLower = resumeText.toLowerCase();
  const skillsLower = skills.map(s => s.toLowerCase());

  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];

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

  // Calculate score
  const score = Math.round((matchedKeywords.length / jobKeywords.length) * 100);

  return {
    atsScore: score,
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
