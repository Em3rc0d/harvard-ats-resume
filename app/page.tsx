'use client';

import { useState } from 'react';
import ResumeForm from '@/components/ResumeForm';
import ResumeResults from '@/components/ResumeResults';
import CVUpload from '@/components/CVUpload';
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
  const [hasStarted, setHasStarted] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [initialResumeData, setInitialResumeData] = useState<ResumeRequest | undefined>(undefined);

  const handleCVData = (data: ResumeRequest) => {
    setInitialResumeData(data);
    setHasStarted(true);
    setIsUploading(false);
  };

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
    setHasStarted(false);
    setInitialResumeData(undefined);
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

        {!hasStarted ? (
          isUploading ? (
            <CVUpload
              onDataExtracted={handleCVData}
              onCancel={() => setIsUploading(false)}
            />
          ) : (
            <div className="max-w-2xl mx-auto text-center space-y-8">
              <div className="mb-10">
                <h2 className="text-3xl font-serif font-bold text-gray-900 mb-3 tracking-tight">
                  Build Your Professional Resume
                </h2>
                <p className="text-gray-500 max-w-lg mx-auto text-sm leading-relaxed">
                  Create a Harvard-standard, ATS-optimized resume in minutes. Start from scratch or let AI extract details from your existing CV.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Option 1: Upload CV */}
                <button
                  onClick={() => setIsUploading(true)}
                  className="group relative p-8 bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all duration-300 text-left"
                >
                  <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="17 8 12 3 7 8"></polyline>
                      <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Upload Existing CV</h3>
                  <p className="text-sm text-gray-500">
                    We'll extract your information automatically using AI.
                  </p>
                </button>

                {/* Option 2: Start Manually */}
                <button
                  onClick={() => setHasStarted(true)}
                  className="group relative p-8 bg-white border-2 border-gray-100 rounded-xl hover:border-gray-900 hover:bg-gray-50 transition-all duration-300 text-left shadow-sm hover:shadow-md"
                >
                  <div className="w-12 h-12 bg-gray-100 text-gray-900 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Start from Scratch</h3>
                  <p className="text-sm text-gray-500">
                    Fill in your details manually using our guided wizard.
                  </p>
                </button>
              </div>
            </div>
          )
        ) : !results ? (
          <div>
            <div className="text-center mb-10">
              <h2 className="text-3xl font-serif font-bold text-gray-900 mb-3 tracking-tight">
                {initialResumeData ? 'Review & Edit Your Details' : 'Build Your Professional Resume'}
              </h2>
              <p className="text-gray-500 max-w-2xl mx-auto text-sm leading-relaxed">
                {initialResumeData
                  ? 'We\'ve extracted your information. Please review and add any missing details.'
                  : 'Enter your details below. Our system will generate a Harvard-standard, ATS-optimized resume using advanced keyword matching.'
                }
              </p>
            </div>

            <ResumeForm
              onSubmit={handleSubmit}
              isLoading={isLoading}
              initialData={initialResumeData}
            />
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
