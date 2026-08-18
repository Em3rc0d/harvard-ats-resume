'use client';

import { useState } from 'react';
import ResumeForm from '@/components/ResumeForm';
import ResumeResults from '@/components/ResumeResults';
import CVUpload from '@/components/CVUpload';
import ImportedResumeReview from '@/components/ImportedResumeReview';
import TargetJobStep from '@/components/TargetJobStep';
import OpportunitySpaceStep from '@/components/OpportunitySpaceStep';
import GenerationGuardrailPanel, {
  type GenerationFailurePayload,
} from '@/components/GenerationGuardrailPanel';
import TrustDisclaimer from '@/components/TrustDisclaimer';
import CareerSignalScene from '@/components/CareerSignalScene';
import type { ResumeRequest } from '@/lib/schemas';
import type { ResumeImportContext } from '@/lib/application/import/ResumeImportProvider';
import type { GeneratedResumeResult } from '@/lib/application/product/ProductResultContract';
import { useLanguage } from '@/components/LanguageProvider';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  Database,
  FileSignature,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
} from 'lucide-react';

const CAREER_VAULT_STORAGE_KEY = 'ats2:career-vault-id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let volatileCareerVaultId: string | undefined;

type FlowStage = 'START' | 'UPLOAD' | 'IMPORTED_REVIEW' | 'EDIT' | 'TARGET' | 'SPACE' | 'RESULTS';

type GenerationApiResponse = {
  readonly success?: boolean;
  readonly data?: GeneratedResumeResult;
  readonly error?: string;
} & Partial<GenerationFailurePayload>;

const LANDING_COPY = {
  en: {
    nav: ['Evidence-bound', 'AI with guardrails', 'Open source'],
    eyebrow: 'Career Opportunity Intelligence',
    title: 'Build from career truth, not keyword theater.',
    body: 'Turn verified career evidence into clearer resumes and better opportunity decisions. CV Engine helps with structure, traceability and analysis; it does not guarantee ATS ranking, interviews or hiring.',
    trust: 'No invented facts. Missing evidence stays missing until you confirm it.',
    uploadTitle: 'Start from my CV',
    uploadBody: 'Import PDF or DOCX, review what was extracted, then decide what is truly yours.',
    manualTitle: 'Build my evidence',
    manualBody: 'Enter career facts manually with a guided, traceable workflow.',
    evidenceTitle: 'Career truth first',
    evidenceBody: 'Candidate evidence remains separate from job requirements and recommendations.',
    marketTitle: 'Opportunity context',
    marketBody: 'Compare where you want to go with what the market is actually asking for.',
    decisionTitle: 'Explainable decisions',
    decisionBody: 'See fit, gaps and next actions without pretending we know hiring probability.',
    loadingTitle: 'Building a trusted resume',
    loadingBody: 'Drafting → grounding candidate facts → checking overstatement → tracing claims → saving the version.',
  },
  es: {
    nav: ['Basado en evidencia', 'IA con guardrails', 'Código abierto'],
    eyebrow: 'Career Opportunity Intelligence',
    title: 'Construye desde la verdad de tu carrera, no desde palabras clave vacías.',
    body: 'Convierte evidencia profesional verificada en CVs más claros y mejores decisiones de oportunidad. CV Engine ayuda con estructura, trazabilidad y análisis; no garantiza ranking ATS, entrevistas ni contratación.',
    trust: 'No inventamos hechos. La evidencia faltante sigue faltando hasta que tú la confirmes.',
    uploadTitle: 'Empezar desde mi CV',
    uploadBody: 'Importa PDF o DOCX, revisa lo extraído y decide qué información realmente te pertenece.',
    manualTitle: 'Construir mi evidencia',
    manualBody: 'Ingresa tus hechos profesionales manualmente con un flujo guiado y trazable.',
    evidenceTitle: 'Primero la verdad profesional',
    evidenceBody: 'Tu evidencia permanece separada de requisitos de vacantes y recomendaciones.',
    marketTitle: 'Contexto de oportunidad',
    marketBody: 'Compara hacia dónde quieres ir con lo que el mercado realmente está pidiendo.',
    decisionTitle: 'Decisiones explicables',
    decisionBody: 'Entiende encaje, brechas y próximos pasos sin fingir probabilidades de contratación.',
    loadingTitle: 'Construyendo un CV confiable',
    loadingBody: 'Redacción → verificación de hechos → control de exageración → trazabilidad → guardado de versión.',
  },
  fr: {
    nav: ['Fondé sur les preuves', 'IA avec garde-fous', 'Open source'],
    eyebrow: 'Career Opportunity Intelligence',
    title: 'Construisez à partir de la vérité de votre carrière, pas de mots-clés artificiels.',
    body: "Transformez des preuves professionnelles vérifiées en CV plus clairs et en meilleures décisions d'opportunité. CV Engine aide à structurer, tracer et analyser ; il ne garantit ni classement ATS, ni entretien, ni embauche.",
    trust: "Aucun fait inventé. Une preuve manquante reste manquante jusqu'à votre confirmation.",
    uploadTitle: 'Commencer avec mon CV',
    uploadBody: "Importez un PDF ou DOCX, vérifiez l'extraction puis confirmez ce qui vous appartient réellement.",
    manualTitle: 'Construire mes preuves',
    manualBody: 'Saisissez vos faits professionnels manuellement dans un flux guidé et traçable.',
    evidenceTitle: 'La vérité professionnelle d’abord',
    evidenceBody: 'Les preuves du candidat restent séparées des exigences de poste et des recommandations.',
    marketTitle: "Contexte d'opportunité",
    marketBody: 'Comparez votre direction avec ce que le marché demande réellement.',
    decisionTitle: 'Décisions explicables',
    decisionBody: "Comprenez l'adéquation, les écarts et les prochaines actions sans prétendre connaître la probabilité d'embauche.",
    loadingTitle: 'Construction d’un CV fiable',
    loadingBody: 'Rédaction → vérification des faits → contrôle de surenchère → traçabilité → sauvegarde.',
  },
  pt: {
    nav: ['Baseado em evidências', 'IA com guardrails', 'Código aberto'],
    eyebrow: 'Career Opportunity Intelligence',
    title: 'Construa a partir da verdade da sua carreira, não de palavras-chave vazias.',
    body: 'Transforme evidências profissionais verificadas em currículos mais claros e melhores decisões de oportunidade. O CV Engine ajuda com estrutura, rastreabilidade e análise; não garante ranking ATS, entrevistas ou contratação.',
    trust: 'Sem fatos inventados. Evidência ausente continua ausente até você confirmar.',
    uploadTitle: 'Começar pelo meu CV',
    uploadBody: 'Importe PDF ou DOCX, revise o que foi extraído e confirme o que realmente pertence à sua história.',
    manualTitle: 'Construir minhas evidências',
    manualBody: 'Insira seus fatos profissionais manualmente em um fluxo guiado e rastreável.',
    evidenceTitle: 'Verdade profissional primeiro',
    evidenceBody: 'Evidência do candidato permanece separada de requisitos de vagas e recomendações.',
    marketTitle: 'Contexto de oportunidade',
    marketBody: 'Compare para onde você quer ir com o que o mercado realmente está pedindo.',
    decisionTitle: 'Decisões explicáveis',
    decisionBody: 'Entenda aderência, lacunas e próximos passos sem fingir probabilidade de contratação.',
    loadingTitle: 'Construindo um currículo confiável',
    loadingBody: 'Redação → verificação de fatos → controle de exagero → rastreabilidade → salvamento.',
  },
} as const;

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
  const { t, language } = useLanguage();
  const copy = LANDING_COPY[language];
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
    <div className="app-shell min-h-screen overflow-x-hidden">
      <TrustDisclaimer />
      <div className="ambient-grid" aria-hidden="true" />

      <header className="sticky top-0 z-50 border-b border-white/50 bg-white/78 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 sm:px-6">
          <button
            type="button"
            onClick={handleStartOver}
            className="group flex items-center gap-3 text-left"
            aria-label="CV Engine home"
          >
            <div className="brand-cube flex h-9 w-9 items-center justify-center rounded-xl font-serif font-bold text-white">C</div>
            <div>
              <h1 className="text-[17px] font-semibold tracking-tight text-slate-950">{t.hero.title}</h1>
              <p className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:block">Career intelligence</p>
            </div>
          </button>

          <div className="flex items-center gap-4">
            <nav className="hidden items-center gap-2 lg:flex">
              {copy.nav.map((item) => (
                <span key={item} className="rounded-full border border-slate-200/80 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm">
                  {item}
                </span>
              ))}
            </nav>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-5 py-9 sm:px-6 sm:py-12">
        {error ? (
          <div className="motion-rise mb-8 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-800 shadow-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {generationFailure && stage !== 'RESULTS' ? (
          <div className="motion-rise mx-auto max-w-4xl">
            <GenerationGuardrailPanel
              failure={generationFailure}
              onEditDetails={editImportedDetails}
            />
          </div>
        ) : (
          <>
            {isLoading && stage !== 'RESULTS' ? (
              <div className="motion-rise mb-8 rounded-3xl border border-blue-200/70 bg-blue-50/80 p-5 shadow-lg shadow-blue-900/5 backdrop-blur-sm" aria-live="polite">
                <div className="flex items-start gap-4">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-700/20">
                    <Sparkles className="h-4 w-4 animate-pulse" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-blue-950">{copy.loadingTitle}</p>
                    <p className="mt-1 text-xs leading-relaxed text-blue-800">{copy.loadingBody}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {stage === 'START' ? (
              <div className="space-y-6">
                <section className="hero-panel motion-rise overflow-hidden rounded-[34px] border border-white/70 bg-white/80 shadow-[0_30px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl">
                  <div className="grid items-center gap-8 p-6 sm:p-8 lg:grid-cols-[1.08fr_0.92fr] lg:p-10">
                    <div className="relative z-10">
                      <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-blue-50/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-800">
                        <Sparkles className="h-3.5 w-3.5" />
                        {copy.eyebrow}
                      </div>

                      <h2 className="mt-5 max-w-3xl font-serif text-4xl font-bold leading-[1.02] tracking-[-0.035em] text-slate-950 sm:text-5xl lg:text-[58px]">
                        {copy.title}
                      </h2>
                      <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-600 sm:text-[15px]">
                        {copy.body}
                      </p>

                      <div className="mt-7 grid gap-3 sm:grid-cols-2">
                        <button
                          onClick={() => setStage('UPLOAD')}
                          className="group flex min-h-[132px] flex-col justify-between rounded-3xl bg-slate-950 p-5 text-left text-white shadow-xl shadow-slate-950/15 transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-950/20 focus:outline-none focus:ring-4 focus:ring-blue-200"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                              <Upload className="h-5 w-5" />
                            </div>
                            <ArrowRight className="h-4 w-4 text-white/60 transition-transform duration-300 group-hover:translate-x-1" />
                          </div>
                          <div className="mt-5">
                            <p className="text-sm font-bold">{copy.uploadTitle}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-300">{copy.uploadBody}</p>
                          </div>
                        </button>

                        <button
                          onClick={handleManualStart}
                          className="group flex min-h-[132px] flex-col justify-between rounded-3xl border border-slate-200 bg-white/90 p-5 text-left shadow-lg shadow-slate-950/5 transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-950/10 focus:outline-none focus:ring-4 focus:ring-blue-100"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                              <FileSignature className="h-5 w-5" />
                            </div>
                            <ArrowRight className="h-4 w-4 text-slate-400 transition-transform duration-300 group-hover:translate-x-1" />
                          </div>
                          <div className="mt-5">
                            <p className="text-sm font-bold text-slate-950">{copy.manualTitle}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{copy.manualBody}</p>
                          </div>
                        </button>
                      </div>

                      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/75 p-4">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                        <p className="text-xs leading-5 text-emerald-950">{copy.trust}</p>
                      </div>
                    </div>

                    <div className="relative flex min-h-[390px] items-center justify-center lg:min-h-[520px]">
                      <CareerSignalScene />
                    </div>
                  </div>
                </section>

                <section className="motion-rise grid gap-4 md:grid-cols-3" aria-label="CV Engine principles">
                  <div className="glass-card rounded-3xl p-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                      <Database className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-sm font-bold text-slate-950">{copy.evidenceTitle}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{copy.evidenceBody}</p>
                  </div>
                  <div className="glass-card rounded-3xl p-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                      <Target className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-sm font-bold text-slate-950">{copy.marketTitle}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{copy.marketBody}</p>
                  </div>
                  <div className="glass-card rounded-3xl p-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                      <BriefcaseBusiness className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-sm font-bold text-slate-950">{copy.decisionTitle}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{copy.decisionBody}</p>
                  </div>
                </section>
              </div>
            ) : null}

            {stage === 'UPLOAD' ? (
              <div className="motion-rise mx-auto max-w-4xl">
                <CVUpload
                  onDataExtracted={handleCVData}
                  onCancel={() => setStage('START')}
                />
              </div>
            ) : null}

            {stage === 'IMPORTED_REVIEW' && initialResumeData && importContext ? (
              <div className="motion-rise">
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
              </div>
            ) : null}

            {stage === 'TARGET' && initialResumeData ? (
              <div className="motion-rise space-y-5">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStage('SPACE')}
                    className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50/90 px-4 py-2.5 text-sm font-bold text-blue-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-100"
                  >
                    <BriefcaseBusiness className="h-4 w-4" />
                    Compare multiple opportunities
                  </button>
                </div>
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
              </div>
            ) : null}

            {stage === 'SPACE' && initialResumeData ? (
              <div className="motion-rise">
                <OpportunitySpaceStep
                  data={initialResumeData}
                  onBack={() => setStage('TARGET')}
                />
              </div>
            ) : null}

            {stage === 'EDIT' ? (
              <div className="motion-rise">
                <div className="mb-8 text-center">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Career evidence</p>
                  <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                    {initialResumeData ? t.hero.reviewTitle : t.hero.buildTitle}
                  </h2>
                  <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                    {initialResumeData ? t.hero.reviewDesc : t.hero.buildDesc}
                  </p>
                </div>

                <ResumeForm
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                  initialData={initialResumeData}
                />
              </div>
            ) : null}

            {stage === 'RESULTS' && results ? (
              <div className="motion-rise">
                <div className="mb-8 text-center">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Trusted version</p>
                  <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                    {t.hero.generatedTitle}
                  </h2>
                  <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500">
                    {t.hero.generatedDesc}
                  </p>
                </div>

                <ResumeResults {...results} userName={userName} onStartOver={handleStartOver} />
              </div>
            ) : null}
          </>
        )}
      </main>

      <footer className="relative mt-12 border-t border-white/60 bg-white/55 py-10 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-center sm:flex-row sm:text-left">
          <div>
            <p className="text-xs font-bold tracking-wide text-slate-700">CV Engine</p>
            <p className="mt-1 text-[11px] text-slate-400">Evidence before persuasion.</p>
          </div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">© 2026 Em3rc0d</p>
        </div>
      </footer>
    </div>
  );
}
