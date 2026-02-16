import { NextRequest, NextResponse } from 'next/server';
import { resumeRequestSchema } from '@/lib/schemas';
import { generateResumeWithGemini, sanitizeResumeData } from '@/lib/gemini';
import { extractKeywords, calculateATSScore, generateSuggestions } from '@/lib/ats-scoring';
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/generate-resume
 * 
 * Main endpoint for generating ATS-optimized Harvard-style resumes
 */
export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';

    // Apply rate limiting (5 requests per hour)
    const rateLimitResult = rateLimit(ip, 5, 60 * 60 * 1000);
    const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Rate limit exceeded. You can generate 5 resumes per hour. Please try again later.',
          retryAfter: new Date(rateLimitResult.reset).toISOString(),
        },
        { 
          status: 429,
          headers: rateLimitHeaders,
        }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = resumeRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid input data',
          details: validationResult.error.errors,
        },
        { 
          status: 400,
          headers: rateLimitHeaders,
        }
      );
    }

    const data = validationResult.data;

    // Sanitize input to prevent injection attacks
    const sanitizedData = sanitizeResumeData(data);

    // Step 1: Extract keywords from job description (if provided)
    const jobKeywords = data.jobDescription 
      ? extractKeywords(data.jobDescription)
      : [];

    // Step 2: Call Gemini API to generate formatted resume
    const geminiResult = await generateResumeWithGemini(sanitizedData);

    if (!geminiResult.success || !geminiResult.formattedResume) {
      return NextResponse.json(
        { 
          success: false,
          error: geminiResult.error || 'Failed to generate resume',
        },
        { 
          status: 500,
          headers: rateLimitHeaders,
        }
      );
    }

    // Step 3: Calculate ATS score algorithmically (server-side, not AI)
    const allSkills = [
      ...data.skills.hardSkills,
      ...data.skills.softSkills,
    ];

    const atsScoreResult = calculateATSScore(
      jobKeywords,
      geminiResult.formattedResume,
      allSkills
    );

    // Step 4: Generate improvement suggestions
    const suggestions = generateSuggestions(
      atsScoreResult.atsScore,
      atsScoreResult.missingKeywords,
      data.experience
    );

    // Combine AI suggestions with algorithm suggestions
    const allSuggestions = [
      ...suggestions,
      ...(geminiResult.suggestions || []),
    ];

    // Return structured response as per spec
    return NextResponse.json(
      {
        success: true,
        data: {
          formattedResume: geminiResult.formattedResume,
          atsScore: atsScoreResult.atsScore,
          matchedKeywords: atsScoreResult.matchedKeywords,
          missingKeywords: atsScoreResult.missingKeywords,
          suggestions: allSuggestions.slice(0, 10), // Limit to top 10
        },
      },
      {
        status: 200,
        headers: {
          ...rateLimitHeaders,
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );

  } catch (error) {
    console.error('API Error:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'An unexpected error occurred. Please try again.',
      },
      { status: 500 }
    );
  }
}

// Block other HTTP methods
export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed' },
    { status: 405 }
  );
}
