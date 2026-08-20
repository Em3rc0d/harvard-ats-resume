'use client';

import { useState } from 'react';
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
import CVUpload from '@/components/CVUpload';
import CareerEvidenceForm from '@/components/CareerEvidenceForm';
import ImportedResumeReview from '@/components/ImportedResumeReview';
import TargetJobStep from '@/components/TargetJobStep';
import OpportunitySpaceStep from '@/components/OpportunitySpaceStep';
import GenerationGuardrailPanel, { type GenerationFailurePayload } from '@/components/GenerationGuardrailPanel';
import ResumeResults from '@/components/ResumeResults';
import TrustDisclaimer from '@/components/TrustDisclaimer';
import CareerSignalScene from '@/components/CareerSignalScene';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLanguage } from '@/components/LanguageProvider';
import { getOrCreateCareerVaultId } from '@/lib/client/CareerVaultCapability';
import type { ResumeRequest } from '@/lib/schemas';
import type { ResumeImportContext } from '@/lib/application/import/ResumeImportProvider';
import type { GeneratedResumeResult } from '@/lib/application/product/ProductResultContract';

type FlowStage = 'START' | 'UPLOAD' | 'IMPORTED_REVIEW' | 'EDIT' | 'TARGET' | 'SPACE' | 'RESULTS';

type GenerationApiResponse = {
  readonly success?: boolean;
  readonly data?: GeneratedResumeResult;
  readonly error?: string;
} & Partial<GenerationFailurePayload>;

const COPY = {
  en: {
    nav: ['Evidence-bound', 'AI with guardrails', 'Open source'],
    eyebrow: 'Career Opportunity Intelligence',
    title: 'Build from career truth, not keyword theater.',
    body: 'Turn career evidence into clearer resumes and better opportunity decisions. CV Engine separates candidate truth, market truth and derived recommendations.',
    trust: 'No invented facts. Missing evidence stays missing until you confirm it.',
    uploadTitle: 'Start from my CV', uploadBody: 'Import PDF or DOCX and review source-backed extraction before targeting a job.',
    manualTitle: 'Build my evidence', manualBody: 'Enter your career facts manually before any job targeting or generation.',
    evidenceTitle: 'Career truth first', evidenceBody: 'Candidate evidence stays separate from job requirements.',
    marketTitle: 'Opportunity context', marketBody: 'Assess what a job asks without turning requirements into your facts.',
    decisionTitle: 'Explainable decisions', decisionBody: 'See fit, gaps and traceability without pretending to know hiring probability.',
    loadingTitle: 'Building a trusted resume', loadingBody: 'Drafting → grounding → semantic guardrail → claim provenance → durable version.',
    compare: 'Compare multiple opportunities', backTarget: 'Back to target', retry: 'Retry trusted generation',
    trusted: 'Trusted version', footer: 'Evidence before persuasion.', home: 'CV Engine home',
  },
  es: {
    nav: ['Basado en evidencia', 'IA con guardrails', 'Código abierto'],
    eyebrow: 'Career Opportunity Intelligence',
    title: 'Construye desde la verdad de tu carrera, no desde palabras clave vacías.',
    body: 'Convierte evidencia profesional en CVs más claros y mejores decisiones. CV Engine separa la verdad del candidato, la verdad del mercado y las recomendaciones derivadas.',
    trust: 'No inventamos hechos. La evidencia faltante sigue faltando hasta que tú la confirmes.',
    uploadTitle: 'Empezar desde mi CV', uploadBody: 'Importa PDF o DOCX y revisa la extracción respaldada por la fuente antes de elegir una vacante.',
    manualTitle: 'Construir mi evidencia', manualBody: 'Ingresa tus hechos profesionales antes de cualquier target o generación.',
    evidenceTitle: 'Primero la verdad profesional', evidenceBody: 'La evidencia del candidato permanece separada de los requisitos.',
    marketTitle: 'Contexto de oportunidad', marketBody: 'Evalúa lo que pide una vacante sin convertir requisitos en tus hechos.',
    decisionTitle: 'Decisiones explicables', decisionBody: 'Ve fit, brechas y trazabilidad sin fingir probabilidades de contratación.',
    loadingTitle: 'Construyendo un CV confiable', loadingBody: 'Redacción → grounding → control semántico → provenance → versión durable.',
    compare: 'Comparar varias oportunidades', backTarget: 'Volver al target', retry: 'Reintentar generación confiable',
    trusted: 'Versión confiable', footer: 'Evidence before persuasion.', home: 'Inicio de CV Engine',
  },
  fr: {
    nav: ['Fondé sur les preuves', 'IA avec garde-fous', 'Open source'],
    eyebrow: 'Career Opportunity Intelligence', title: 'Construisez à partir de la vérité de votre carrière.',
    body: 'Transformez vos preuves de carrière en CV plus clairs et en meilleures décisions tout en séparant preuves, marché et recommandations.',
    trust: "Aucun fait inventé. Une preuve manquante reste manquante jusqu'à votre confirmation.",
    uploadTitle: 'Commencer avec mon CV', uploadBody: "Importez PDF ou DOCX et vérifiez l'extraction avant de cibler un poste.",
    manualTitle: 'Construire mes preuves', manualBody: 'Saisissez vos faits professionnels avant tout ciblage ou génération.',
    evidenceTitle: 'La vérité professionnelle d’abord', evidenceBody: 'Les preuves restent séparées des exigences de poste.',
    marketTitle: "Contexte d'opportunité", marketBody: 'Évaluez les exigences sans les transformer en faits du candidat.',
    decisionTitle: 'Décisions explicables', decisionBody: "Voyez l'adéquation, les écarts et la traçabilité sans promettre l'embauche.",
    loadingTitle: 'Construction d’un CV fiable', loadingBody: 'Rédaction → grounding → contrôle sémantique → provenance → version durable.',
    compare: 'Comparer plusieurs opportunités', backTarget: 'Retour à la cible', retry: 'Réessayer la génération fiable',
    trusted: 'Version fiable', footer: 'Evidence before persuasion.', home: 'Accueil CV Engine',
  },
  pt: {
    nav: ['Baseado em evidências', 'IA com guardrails', 'Código aberto'],
    eyebrow: 'Career Opportunity Intelligence', title: 'Construa a partir da verdade da sua carreira.',
    body: 'Transforme evidência profissional em currículos mais claros e melhores decisões mantendo candidato, mercado e recomendações separados.',
    trust: 'Sem fatos inventados. Evidência ausente continua ausente até você confirmar.',
    uploadTitle: 'Começar pelo meu CV', uploadBody: 'Importe PDF ou DOCX e revise a extração antes de escolher uma vaga.',
    manualTitle: 'Construir minhas evidências', manualBody: 'Insira seus fatos profissionais antes de qualquer alvo ou geração.',
    evidenceTitle: 'Verdade profissional primeiro', evidenceBody: 'Evidência do candidato permanece separada dos requisitos.',
    marketTitle: 'Contexto de oportunidade', marketBody: 'Avalie o que a vaga pede sem transformar requisitos em seus fatos.',
    decisionTitle: 'Decisões explicáveis', decisionBody: 'Veja aderência, lacunas e rastreabilidade sem prometer contratação.',
    loadingTitle: 'Construindo um currículo confiável', loadingBody: 'Redação → grounding → controle semântico → provenance → versão durável.',
    compare: 'Comparar várias oportunidades', backTarget: 'Voltar ao alvo', retry: 'Tentar geração confiável novamente',
    trusted: 'Versão confiável', footer: 'Evidence before persuasion.', home: 'Início do CV Engine',
  },
} as const;

export default function CVEngineFlow() {
  const { t, language } = useLanguage();
  const copy = COPY[language];
  const [stage, setStage] = useState<FlowStage>('START');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationFailure, setGenerationFailure] = useState<GenerationFailurePayload | null>(null);
  const [results, setResults] = useState<GeneratedResumeResult | null>(null);
  const [userName, setUserName] = useState('Candidate');
  const [resumeData, setResumeData] = useState<ResumeRequest | undefined>();
  const [importContext, setImportContext] = useState<ResumeImportContext | undefined>();

  const reset = () => {
    setStage('START');
    setIsLoading(false);
    setError(null);
    setGenerationFailure(null);
    setResults(null);
    setUserName('Candidate');
    setResumeData(undefined);
    setImportContext(undefined);
  };

  const startManual = () => {
    setError(null);
    setGenerationFailure(null);
    setResumeData(undefined);
    setImportContext(undefined);
    setStage('EDIT');
  };

  const imported = (data: ResumeRequest, context: ResumeImportContext) => {
    setError(null);
    setGenerationFailure(null);
    setResumeData(data);
    setImportContext(context);
    setStage('IMPORTED_REVIEW');
  };

  const evidenceComplete = (data: ResumeRequest) => {
    // Career Evidence never generates directly. Every edit must re-enter the
    // TARGET boundary so job truth and candidate truth cannot silently collapse.
    setResumeData(data);
    setGenerationFailure(null);
    setError(null);
    setStage('TARGET');
  };

  const generate = async (data: ResumeRequest) => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    setGenerationFailure(null);
    setUserName(data.personalInfo.fullName || 'Candidate');
    // Preserve the exact attempted target so editing evidence and returning to
    // TARGET does not silently discard the user's job description.
    setResumeData(data);

    try {
      const response = await fetch('/api/generate-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          sourceContext: importContext,
          careerVaultId: getOrCreateCareerVaultId(),
        }),
      });

      let result: GenerationApiResponse;
      try {
        result = await response.json() as GenerationApiResponse;
      } catch {
        setError('CV Engine received an invalid generation response. No trusted version was emitted.');
        return;
      }

      if (!response.ok) {
        setGenerationFailure({
          error: result.error || 'Trusted resume generation stopped before completion.',
          grounding: result.grounding,
          semanticGrounding: result.semanticGrounding,
          persistence: result.persistence,
          provider: result.provider,
          composition: result.composition,
        });
        return;
      }

      if (!result.success || !result.data) {
        setError('CV Engine did not receive a complete trusted resume result. No version was presented.');
        return;
      }

      setResults(result.data);
      setStage('RESULTS');
    } catch {
      setError('CV Engine could not reach the trusted generation service. Your career evidence was not changed.');
    } finally {
      setIsLoading(false);
    }
  };

  const editEvidence = () => {
    setGenerationFailure(null);
    setError(null);
    setStage('EDIT');
  };

  const targetBackStage: FlowStage = importContext ? 'IMPORTED_REVIEW' : 'EDIT';
  const canRetryFailure = Boolean(
    generationFailure &&
    !generationFailure.grounding &&
    !generationFailure.semanticGrounding &&
    generationFailure.provider?.retryable !== false &&
    generationFailure.persistence?.retryable !== false &&
    resumeData,
  );

  return (
    <div className="app-shell min-h-screen overflow-x-hidden">
      <TrustDisclaimer />
      <div className="ambient-grid" aria-hidden="true" />

      <header className="sticky top-0 z-50 border-b border-white/50 bg-white/78 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 sm:px-6">
          <button type="button" onClick={reset} className="group flex items-center gap-3 text-left" aria-label={copy.home}>
            <div className="brand-cube flex h-9 w-9 items-center justify-center rounded-xl font-serif font-bold text-white">C</div>
            <div><h1 className="text-[17px] font-semibold tracking-tight text-slate-950">{t.hero.title}</h1><p className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:block">Career intelligence</p></div>
          </button>
          <div className="flex items-center gap-4">
            <nav className="hidden items-center gap-2 lg:flex" aria-label="Product principles">
              {copy.nav.map((item) => <span key={item} className="rounded-full border border-slate-200/80 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm">{item}</span>)}
            </nav>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-5 py-9 sm:px-6 sm:py-12">
        {error && (
          <div className="motion-rise mb-8 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-800 shadow-sm" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}

        {isLoading && stage !== 'RESULTS' && (
          <div className="motion-rise mb-8 rounded-3xl border border-blue-200/70 bg-blue-50/80 p-5 shadow-lg shadow-blue-900/5" aria-live="polite">
            <div className="flex items-start gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-700 text-white"><Sparkles className="h-4 w-4 animate-pulse" /></div><div><p className="text-sm font-bold text-blue-950">{copy.loadingTitle}</p><p className="mt-1 text-xs text-blue-800">{copy.loadingBody}</p></div></div>
          </div>
        )}

        {generationFailure && stage !== 'RESULTS' ? (
          <div className="motion-rise mx-auto max-w-4xl space-y-4">
            <GenerationGuardrailPanel failure={generationFailure} onEditDetails={editEvidence} />
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => { setGenerationFailure(null); setStage('TARGET'); }} className="btn-secondary">{copy.backTarget}</button>
              {canRetryFailure && resumeData ? <button type="button" onClick={() => void generate(resumeData)} className="btn-primary">{copy.retry}</button> : null}
            </div>
          </div>
        ) : (
          <>
            {stage === 'START' && (
              <div className="space-y-6">
                <section className="hero-panel motion-rise overflow-hidden rounded-[34px] border border-white/70 bg-white/80 shadow-[0_30px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl">
                  <div className="grid items-center gap-8 p-6 sm:p-8 lg:grid-cols-[1.08fr_0.92fr] lg:p-10">
                    <div className="relative z-10">
                      <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-blue-50/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-800"><Sparkles className="h-3.5 w-3.5" />{copy.eyebrow}</div>
                      <h2 className="mt-5 max-w-3xl font-serif text-4xl font-bold leading-[1.02] tracking-[-0.035em] text-slate-950 sm:text-5xl lg:text-[58px]">{copy.title}</h2>
                      <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-600 sm:text-[15px]">{copy.body}</p>
                      <div className="mt-7 grid gap-3 sm:grid-cols-2">
                        <button type="button" onClick={() => setStage('UPLOAD')} className="group rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left transition hover:-translate-y-0.5 hover:bg-blue-100">
                          <div className="flex items-start gap-3"><Upload className="mt-0.5 h-5 w-5 text-blue-700" /><div><p className="font-bold text-slate-950">{copy.uploadTitle}</p><p className="mt-1 text-xs leading-5 text-slate-600">{copy.uploadBody}</p></div><ArrowRight className="ml-auto h-4 w-4 text-blue-700" /></div>
                        </button>
                        <button type="button" onClick={startManual} className="group rounded-2xl border border-violet-200 bg-violet-50 p-4 text-left transition hover:-translate-y-0.5 hover:bg-violet-100">
                          <div className="flex items-start gap-3"><FileSignature className="mt-0.5 h-5 w-5 text-violet-700" /><div><p className="font-bold text-slate-950">{copy.manualTitle}</p><p className="mt-1 text-xs leading-5 text-slate-600">{copy.manualBody}</p></div><ArrowRight className="ml-auto h-4 w-4 text-violet-700" /></div>
                        </button>
                      </div>
                      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/75 p-4"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><p className="text-xs leading-5 text-emerald-950">{copy.trust}</p></div>
                    </div>
                    <div className="relative flex min-h-[390px] items-center justify-center lg:min-h-[520px]"><CareerSignalScene /></div>
                  </div>
                </section>
                <section className="motion-rise grid gap-4 md:grid-cols-3" aria-label="CV Engine principles">
                  <div className="glass-card rounded-3xl p-5"><Database className="h-5 w-5 text-emerald-700" /><h3 className="mt-4 text-sm font-bold text-slate-950">{copy.evidenceTitle}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{copy.evidenceBody}</p></div>
                  <div className="glass-card rounded-3xl p-5"><Target className="h-5 w-5 text-cyan-700" /><h3 className="mt-4 text-sm font-bold text-slate-950">{copy.marketTitle}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{copy.marketBody}</p></div>
                  <div className="glass-card rounded-3xl p-5"><BriefcaseBusiness className="h-5 w-5 text-violet-700" /><h3 className="mt-4 text-sm font-bold text-slate-950">{copy.decisionTitle}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{copy.decisionBody}</p></div>
                </section>
              </div>
            )}

            {stage === 'UPLOAD' && <div className="motion-rise mx-auto max-w-4xl"><CVUpload onDataExtracted={imported} onCancel={() => setStage('START')} /></div>}

            {stage === 'IMPORTED_REVIEW' && resumeData && importContext && (
              <div className="motion-rise"><ImportedResumeReview data={resumeData} context={importContext} onEdit={editEvidence} onContinue={() => setStage('TARGET')} onStartOver={reset} /></div>
            )}

            {stage === 'EDIT' && (
              <div className="motion-rise"><CareerEvidenceForm initialData={resumeData} onComplete={evidenceComplete} onCancel={() => setStage(importContext ? 'IMPORTED_REVIEW' : 'START')} /></div>
            )}

            {stage === 'TARGET' && resumeData && (
              <div className="motion-rise space-y-5">
                <div className="flex justify-end"><button type="button" onClick={() => setStage('SPACE')} disabled={isLoading} className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-800 disabled:opacity-40"><BriefcaseBusiness className="h-4 w-4" />{copy.compare}</button></div>
                <TargetJobStep data={resumeData} isLoading={isLoading} onBack={() => setStage(targetBackStage)} onEditDetails={editEvidence} onGenerate={generate} />
              </div>
            )}

            {stage === 'SPACE' && resumeData && <div className="motion-rise"><OpportunitySpaceStep data={resumeData} onBack={() => setStage('TARGET')} /></div>}

            {stage === 'RESULTS' && results && (
              <div className="motion-rise"><div className="mb-8 text-center"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">{copy.trusted}</p><h2 className="mt-2 font-serif text-3xl font-bold text-slate-950 sm:text-4xl">{t.hero.generatedTitle}</h2><p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500">{t.hero.generatedDesc}</p></div><ResumeResults {...results} userName={userName} onStartOver={reset} /></div>
            )}
          </>
        )}
      </main>

      <footer className="relative mt-12 border-t border-white/60 bg-white/55 py-10 backdrop-blur-lg"><div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-center sm:flex-row sm:text-left"><div><p className="text-xs font-bold tracking-wide text-slate-700">CV Engine</p><p className="mt-1 text-[11px] text-slate-400">{copy.footer}</p></div><p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">© 2026 Em3rc0d</p></div></footer>
    </div>
  );
}
