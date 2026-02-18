'use client';

import { useState } from 'react';
import ResumeForm from '@/components/ResumeForm';
import ResumeResults from '@/components/ResumeResults';
import CVUpload from '@/components/CVUpload';
import { ResumeRequest } from '@/lib/schemas';
import { useLanguage } from '@/components/LanguageProvider';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { Upload, FileSignature, AlertCircle } from 'lucide-react';

export default function Home() {
  const { t } = useLanguage();
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
            <div className="w-8 h-8 bg-gray-900 text-white flex items-center justify-center font-serif font-bold rounded-sm">C</div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              {t.hero.title}
            </h1>
          </div>
          <div className="flex items-center gap-6">
            <nav className="text-sm font-medium text-gray-600 gap-6 hidden md:flex">
              <span>{t.nav.ats}</span>
              <span>{t.nav.ai}</span>
              <span>{t.nav.opensource}</span>
            </nav>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {(() => {
          if (!hasStarted) {
            if (isUploading) {
              return (
                <CVUpload
                  onDataExtracted={handleCVData}
                  onCancel={() => setIsUploading(false)}
                />
              );
            }
            return (
              <div className="max-w-2xl mx-auto text-center space-y-8">
                <div className="mb-10">
                  <h2 className="text-3xl font-serif font-bold text-gray-900 mb-3 tracking-tight">
                    {t.hero.subtitle}
                  </h2>
                  <p className="text-gray-500 max-w-lg mx-auto text-sm leading-relaxed">
                    {t.hero.description}
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Option 1: Upload CV */}
                  <button
                    onClick={() => setIsUploading(true)}
                    className="group relative p-8 bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all duration-300 text-left"
                  >
                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{t.hero.uploadCV}</h3>
                    <p className="text-sm text-gray-500">
                      {t.hero.uploadDesc}
                    </p>
                  </button>

                  {/* Option 2: Start Manually */}
                  <button
                    onClick={() => setHasStarted(true)}
                    className="group relative p-8 bg-white border-2 border-gray-100 rounded-xl hover:border-gray-900 hover:bg-gray-50 transition-all duration-300 text-left shadow-sm hover:shadow-md"
                  >
                    <div className="w-12 h-12 bg-gray-100 text-gray-900 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <FileSignature className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{t.hero.startManual}</h3>
                    <p className="text-sm text-gray-500">
                      {t.hero.manualDesc}
                    </p>
                  </button>
                </div>
              </div>
            );
          }

          if (!results) {
            return (
              <div>
                <div className="text-center mb-10">
                  <h2 className="text-3xl font-serif font-bold text-gray-900 mb-3 tracking-tight">
                    {initialResumeData ? t.hero.reviewTitle : t.hero.buildTitle}
                  </h2>
                  <p className="text-gray-500 max-w-2xl mx-auto text-sm leading-relaxed">
                    {initialResumeData
                      ? t.hero.reviewDesc
                      : t.hero.buildDesc
                    }
                  </p>
                </div>

                <ResumeForm
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                  initialData={initialResumeData}
                />
              </div>
            );
          }

          return (
            <div>
              <div className="text-center mb-10">
                <h2 className="text-3xl font-serif font-bold text-gray-900 mb-3 tracking-tight">
                  {t.hero.generatedTitle}
                </h2>
                <p className="text-gray-500 max-w-2xl mx-auto text-sm">
                  {t.hero.generatedDesc}
                </p>
              </div>

              <ResumeResults {...results} userName={userName} onStartOver={handleStartOver} />
            </div>
          );
        })()}
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
