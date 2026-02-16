'use client';

import { useState } from 'react';
import ResumeForm from '@/components/ResumeForm';
import ResumeResults from '@/components/ResumeResults';
import { ResumeRequest } from '@/lib/schemas';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{
    formattedResume: string;
    atsScore: number;
    matchedKeywords: string[];
    missingKeywords: string[];
    suggestions: string[];
  } | null>(null);

  const handleSubmit = async (data: ResumeRequest) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/generate-resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate resume');
      }

      if (result.success && result.data) {
        setResults(result.data);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      console.error('Error generating resume:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartOver = () => {
    setResults(null);
    setError(null);
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-16 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            AI Harvard ATS Resume Builder
          </h1>
          <p className="text-xl md:text-2xl mb-2 text-blue-100">
            Create Job-Winning Resumes Optimized for Applicant Tracking Systems
          </p>
          <p className="text-lg text-blue-200">
            For Tech Professionals • University Students • Bootcamp Graduates
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-4xl mx-auto">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
              <div className="text-3xl mb-2">🎯</div>
              <h3 className="font-bold text-lg mb-2">ATS-Optimized</h3>
              <p className="text-sm text-blue-100">
                Keyword matching and ATS score analysis
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
              <div className="text-3xl mb-2">🤖</div>
              <h3 className="font-bold text-lg mb-2">AI-Enhanced</h3>
              <p className="text-sm text-blue-100">
                Powered by Gemini AI for professional content
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
              <div className="text-3xl mb-2">🎓</div>
              <h3 className="font-bold text-lg mb-2">Harvard Style</h3>
              <p className="text-sm text-blue-100">
                Follows HBS formatting guidelines
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-12">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-300 rounded-lg text-red-800">
            <h3 className="font-bold mb-1">Error</h3>
            <p>{error}</p>
          </div>
        )}

        {!results ? (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-800 mb-4">
                Build Your Professional Resume
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Fill in your information. Our AI will create a Harvard-style resume optimized for ATS
                systems with keyword matching analysis and improvement suggestions.
              </p>
            </div>

            <ResumeForm onSubmit={handleSubmit} isLoading={isLoading} />
          </div>
        ) : (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-800 mb-4">
                Your ATS-Optimized Resume
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Your professional resume has been generated with ATS scoring and keyword analysis.
              </p>
            </div>

            <ResumeResults {...results} onStartOver={handleStartOver} />
          </div>
        )}
      </main>

      {/* Features Section (only show on form page) */}
      {!results && (
        <section className="bg-white py-16 px-4 mt-12 border-t-2 border-gray-200">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center text-gray-800 mb-12">
              Why Use Our ATS Resume Builder?
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="font-bold text-lg mb-2">ATS Score Analysis</h3>
                <p className="text-gray-600 text-sm">
                  Get a real-time score based on keyword matching with job descriptions
                </p>
              </div>

              <div className="text-center">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="font-bold text-lg mb-2">Keyword Matching</h3>
                <p className="text-gray-600 text-sm">
                  See which keywords you matched and which ones you're missing
                </p>
              </div>

              <div className="text-center">
                <div className="text-4xl mb-4">💡</div>
                <h3 className="font-bold text-lg mb-2">Smart Suggestions</h3>
                <p className="text-gray-600 text-sm">
                  Get actionable improvement suggestions based on your content
                </p>
              </div>

              <div className="text-center">
                <div className="text-4xl mb-4">✅</div>
                <h3 className="font-bold text-lg mb-2">No Fabrication</h3>
                <p className="text-gray-600 text-sm">
                  AI only restructures your data - never invents experience or metrics
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8 px-4 mt-16">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm text-gray-300">
            © 2024 AI Harvard ATS Resume Builder. Powered by Google Gemini AI.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Built with Next.js, TypeScript, and React Hook Form
          </p>
        </div>
      </footer>
    </div>
  );
}
