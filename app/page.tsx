'use client';

import { useState } from 'react';
import ResumeForm from '@/components/ResumeForm';
import ResumeResults from '@/components/ResumeResults';
import CVUpload from '@/components/CVUpload';
import ImportedResumeReview from '@/components/ImportedResumeReview';
import TargetJobStep from '@/components/TargetJobStep';
import GenerationGuardrailPanel, {
  type GenerationFailurePayload,
} from '@/components/GenerationGuardrailPanel';
import type { ResumeRequest } from '@/lib/schemas';
import type { ResumeImportContext } from '@/lib/application/import/ResumeImportProvider';
import type { GeneratedResumeResult } from '@/lib/application/product/ProductResultContract';
import { useLanguage } from '@/components/LanguageProvider';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { AlertCircle, FileSignature, ShieldCheck, Upload } from 'lucide-react';

const CAREER_VAULT_STORAGE_KEY = 'ats2:career-vault-id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let volatileCareerVaultId: string | undefined;

type FlowStage = 'START' | 'UPLOAD' | 'IMPORTED_REVIEW' | 'EDIT' | 'TARGET' | 'RESULTS';

type GenerationApiResponse = {
  readonly success?: boolean;
  readonly data?: GeneratedResumeResult;
  readonly error?: string;
} & Partial<GenerationFailurePayload>;

function getOrCreateCareerVaultId(): string {
  try {
    const existing = window.localStorage.getItem(CAREER_VAULT_STORAGE_KEY);
    if (existing && UUID_PATTERN.test(existing)) return existing;

    const created = window.crypto.randomUUID();
    window.localStorage.setItem(CAREER_VAULT_STORAGE_KEY, created);
    return created;
  } catch {
    volatileCareerVaultId ??= window.crypto.randomUUID();
    return volatileCareerVaultId;
  }
}

export default function Home() {
  const { t } = useLanguage();
  const [stage, setStage] = useState<FlowStage>('START');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationFailure, setGenerationFailure] = useState<GenerationFailurePayload | null>(null);
  const [results, setResults] = useState<GeneratedResumeResult | null>(null);
  const [userName, setUserName] = useState<string>('Candidate');
  const [initialResumeData, setInitialResumeData] = useState<ResumeRequest | undefined>(undefined);
  const [importContext, setImportContext] = useState<ResumeImportContext | undefined>(undefined);

  const handleCVData = (data: ResumeRequest, sourceContext: ResumeImportContext) => {
    setInitialResumeData(data);
    setImportContext(sourceContext);
    setError(null);
    setGenerationFailure(null);
    setStage('IMPORTED_REVIEW');
  };

  const handleManualStart = () => {
    setInitialResumeData(undefined);
    setImportContext(undefined);
    setError(null);
    setGenerationFailure(null);
    setStage('EDIT');
  };

  const handleSubmit = async (data: ResumeRequest) => {
    setIsLoading(true);
    setError(null);
    setGenerationFailure(null);
    setUserName(data.personalInfo.fullName);

    try {
      const response = await fetch('/api/generate-resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          sourceContext: importContext,
          careerVaultId: getOrCreateCareerVaultId(),
        }),
      });

      const result = await response.json() as GenerationApiResponse;

      if (!response.ok) {
        setGenerationFailure({
          error: result.error || 'Trusted resume generation stopped before completion.',
          grounding: result.grounding,
          semanticGrounding: result.semanticGrounding,
          persistence: result.persistence,
          composition: result.composition,
        });
        return;
      }

      if (result.success && result.data) {
        setResults(result.data);
        setStage('RESULTS');
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
    setGenerationFailure(null);
    setInitialResumeData(undefined);
    setImportContext(undefined);
    setStage('START');
  };

  const editImportedDetails = () => {
    setGenerationFailure(null);
    setStage('EDIT');
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-gray-900 font-serif font-bold text-white">C</div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              {t.hero.title}
            </h1>
          </div>
          <div className="flex items-center gap-6">
            <nav className="hidden gap-6 text-sm font-medium text-gray-600 md:flex">
              <span>{t.nav.ats}</span>
              <span>{t.nav.ai}</span>
              <span>{t.nav.opensource}</span>
            </nav>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {error && (
          <div className="mb-8 flex items-center gap-2 rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {generationFailure && stage !== 'RESULTS' && (
          <GenerationGuardrailPanel
            failure={generationFailure}
            onEditDetails={editImportedDetails}
          />
        )}

        {isLoading && stage !== 'RESULTS' && (
          <div className="mb-8 rounded-xl border border-blue-200 bg-blue-50 p-5" aria-live="polite">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
              <div>
                <p className="text-sm font-bold text-blue-950">Building a trusted resume</p>
                <p className="mt-1 text-xs leading-relaxed text-blue-800">
                  Drafting → checking candidate facts → checking overstatement → building traceability → saving the version.
                </p>
              </div>
            </div>
          </div>
        )}

        {stage === 'START' && (
          <div className="mx-auto max-w-2xl space-y-8 text-center">
            <div className="mb-10">
              <h2 className="mb-3 text-3xl font-serif font-bold tracking-tight text-gray-900">
                {t.hero.subtitle}
              </h2>
              <p className="mx-auto max-w-lg text-sm leading-relaxed text-gray-500">
                {t.hero.description}
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <button
                onClick={() => setStage('UPLOAD')}
                className="group relative rounded-xl border-2 border-dashed border-gray-200 bg-white p-8 text-left transition-all duration-300 hover:border-blue-500 hover:bg-blue-50"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600 transition-transform group-hover:scale-110">
                  <Upload className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">{t.hero.uploadCV}</h3>
                <p className="text-sm text-gray-500">{t.hero.uploadDesc}</p>
              </button>

              <button
                onClick={handleManualStart}
                className="group relative rounded-xl border-2 border-gray-100 bg-white p-8 text-left shadow-sm transition-all duration-300 hover:border-gray-900 hover:bg-gray-50 hover:shadow-md"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-900 transition-transform group-hover:scale-110">
                  <FileSignature className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">{t.hero.startManual}</h3>
                <p className="text-sm text-gray-500">{t.hero.manualDesc}</p>
              </button>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-left">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gray-700" />
                <p className="text-xs leading-relaxed text-gray-600">
                  ATS v2 can reorganize, clarify and prioritize your career evidence. It does not silently create facts you did not provide.
                </p>
              </div>
            </div>
          </div>
        )}

        {stage === 'UPLOAD' && (
          <CVUpload
            onDataExtracted={handleCVData}
            onCancel={() => setStage('START')}
          />
        )}

        {stage === 'IMPORTED_REVIEW' && initialResumeData && importContext && (
          <ImportedResumeReview
            data={initialResumeData}
            context={importContext}
            onEdit={editImportedDetails}
            onContinue={() => {
              setGenerationFailure(null);
              setStage('TARGET');
            }}
            onStartOver={handleStartOver}
          />
        )}

        {stage === 'TARGET' && initialResumeData && (
          <TargetJobStep
            data={initialResumeData}
            isLoading={isLoading}
            onBack={() => {
              setGenerationFailure(null);
              setStage('IMPORTED_REVIEW');
            }}
            onEditDetails={editImportedDetails}
            onGenerate={handleSubmit}
          />
        )}

        {stage === 'EDIT' && (
          <div>
            <div className="mb-10 text-center">
              <h2 className="mb-3 text-3xl font-serif font-bold tracking-tight text-gray-900">
                {initialResumeData ? t.hero.reviewTitle : t.hero.buildTitle}
              </h2>
              <p className="mx-auto max-w-2xl text-sm leading-relaxed text-gray-500">
                {initialResumeData ? t.hero.reviewDesc : t.hero.buildDesc}
              </p>
            </div>

            <ResumeForm
              onSubmit={handleSubmit}
              isLoading={isLoading}
              initialData={initialResumeData}
            />
          </div>
        )}

        {stage === 'RESULTS' && results && (
          <div>
            <div className="mb-10 text-center">
              <h2 className="mb-3 text-3xl font-serif font-bold tracking-tight text-gray-900">
                {t.hero.generatedTitle}
              </h2>
              <p className="mx-auto max-w-2xl text-sm text-gray-500">
                {t.hero.generatedDesc}
              </p>
            </div>

            <ResumeResults {...results} userName={userName} onStartOver={handleStartOver} />
          </div>
        )}
      </main>

      <footer className="mt-12 border-t border-gray-200 bg-white py-12">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            © 2026 Em3rc0d
          </p>
        </div>
      </footer>
    </div>
  );
}
