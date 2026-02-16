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

  const [userName, setUserName] = useState<string>('Candidate');

  const handleSubmit = async (data: ResumeRequest) => {
    setIsLoading(true);
    setError(null);
    setUserName(data.personalInfo.fullName);

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
      {/* Minimal Header */}
      <header className="bg-white border-b border-gray-200 py-6 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-900 text-white flex items-center justify-center font-serif font-bold rounded-sm">H</div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Harvard ATS Builder
            </h1>
          </div>
          <nav className="text-sm font-medium text-gray-600 gap-6 hidden md:flex">
            <span>ATS Optimized</span>
            <span>AI Powered</span>
            <span>Free & Open Source</span>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-sm flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            {error}
          </div>
        )}

        {!results ? (
          <div>
            <div className="text-center mb-10">
              <h2 className="text-3xl font-serif font-bold text-gray-900 mb-3 tracking-tight">
                Build Your Professional Resume
              </h2>
              <p className="text-gray-500 max-w-2xl mx-auto text-sm leading-relaxed">
                Enter your details below. Our system will generate a Harvard-standard, ATS-optimized resume using advanced keyword matching.
              </p>
            </div>

            <ResumeForm onSubmit={handleSubmit} isLoading={isLoading} />
          </div>
        ) : (
          <div>
            <div className="text-center mb-10">
              <h2 className="text-3xl font-serif font-bold text-gray-900 mb-3 tracking-tight">
                Resume Generated
              </h2>
              <p className="text-gray-500 max-w-2xl mx-auto text-sm">
                Review your analysis and download your document.
              </p>
            </div>

            <ResumeResults {...results} userName={userName} onStartOver={handleStartOver} />
          </div>
        )}
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-gray-200 py-12 mt-12 bg-white">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
            © 2026 Em3rc0d
          </p>
        </div>
      </footer>
    </div>
  );
}
