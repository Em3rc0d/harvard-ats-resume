'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, FileText, PencilLine, ShieldCheck, Target } from 'lucide-react';
import type { ResumeRequest } from '@/lib/schemas';
import { evaluateGenerationReadiness } from '@/lib/application/product/GenerationReadiness';
import { useLanguage } from '@/components/LanguageProvider';

interface TargetJobStepProps {
  readonly data: ResumeRequest;
  readonly isLoading: boolean;
  readonly onBack: () => void;
  readonly onEditDetails: () => void;
  readonly onGenerate: (data: ResumeRequest) => Promise<void>;
}

type TargetMode = 'TARGETED' | 'GENERAL' | null;

const COPY = {
  en: {
    eyebrow: 'Target',
    title: 'What are you applying for?',
    description: 'Your career evidence is already established. A job description is used only to compare and prioritize supported experience; it never becomes candidate evidence.',
    targeted: 'Specific job',
    targetedDesc: 'Paste the role and compare its explicit requirements against your evidence.',
    general: 'General resume',
    generalDesc: 'Create a strong general version without a Job Match score.',
    label: 'Job description',
    placeholder: 'Paste the full job description here…',
    trust: 'Missing requirements stay missing. ATS v2 will not add a skill, responsibility, seniority level, metric, or credential just because the job asks for it.',
    readinessTitle: 'Your imported career needs review before generation.',
    readinessBody: 'The importer preserves missing or partial source data instead of inventing values. Complete these fields before generating:',
    back: 'Back to career review',
    edit: 'Edit career details',
    generate: 'Generate trusted resume',
    generating: 'Checking and generating…',
  },
  es: {
    eyebrow: 'Objetivo',
    title: '¿A qué estás postulando?',
    description: 'Tu evidencia profesional ya está establecida. La descripción de la vacante se usa sólo para comparar y priorizar experiencia respaldada; nunca se convierte en evidencia del candidato.',
    targeted: 'Vacante específica',
    targetedDesc: 'Pega la vacante y compara sus requisitos explícitos contra tu evidencia.',
    general: 'CV general',
    generalDesc: 'Crea una versión general sólida sin puntaje de Job Match.',
    label: 'Descripción de la vacante',
    placeholder: 'Pega aquí la descripción completa de la vacante…',
    trust: 'Los requisitos faltantes permanecen faltantes. ATS v2 no añadirá una habilidad, responsabilidad, seniority, métrica o credencial sólo porque la vacante la solicite.',
    readinessTitle: 'Tu carrera importada necesita revisión antes de generar.',
    readinessBody: 'El importador conserva datos faltantes o parciales en lugar de inventarlos. Completa estos campos antes de generar:',
    back: 'Volver a revisión de carrera',
    edit: 'Editar datos de carrera',
    generate: 'Generar CV confiable',
    generating: 'Verificando y generando…',
  },
  fr: {
    eyebrow: 'Cible',
    title: 'À quel poste postulez-vous ?',
    description: "Vos preuves professionnelles sont déjà établies. La description du poste sert uniquement à comparer et prioriser l'expérience étayée ; elle ne devient jamais une preuve du candidat.",
    targeted: 'Poste spécifique',
    targetedDesc: 'Collez le poste et comparez ses exigences explicites à vos preuves.',
    general: 'CV général',
    generalDesc: 'Créez une version générale sans score de Job Match.',
    label: 'Description du poste',
    placeholder: 'Collez ici la description complète du poste…',
    trust: "Les exigences manquantes restent manquantes. ATS v2 n'ajoute pas une compétence, une responsabilité, un niveau, une métrique ou un diplôme uniquement parce que le poste le demande.",
    readinessTitle: 'Votre carrière importée doit être revue avant la génération.',
    readinessBody: "L'importateur conserve les données absentes ou partielles au lieu de les inventer. Complétez ces champs avant de générer :",
    back: 'Retour à la revue',
    edit: 'Modifier la carrière',
    generate: 'Générer le CV fiable',
    generating: 'Vérification et génération…',
  },
  pt: {
    eyebrow: 'Alvo',
    title: 'Para qual vaga você está se candidatando?',
    description: 'Sua evidência profissional já está estabelecida. A descrição da vaga serve apenas para comparar e priorizar experiência respaldada; ela nunca vira evidência do candidato.',
    targeted: 'Vaga específica',
    targetedDesc: 'Cole a vaga e compare os requisitos explícitos com sua evidência.',
    general: 'Currículo geral',
    generalDesc: 'Crie uma versão geral forte sem pontuação de Job Match.',
    label: 'Descrição da vaga',
    placeholder: 'Cole aqui a descrição completa da vaga…',
    trust: 'Requisitos ausentes continuam ausentes. ATS v2 não adicionará habilidade, responsabilidade, senioridade, métrica ou credencial só porque a vaga pede.',
    readinessTitle: 'Sua carreira importada precisa de revisão antes da geração.',
    readinessBody: 'O importador preserva dados ausentes ou parciais em vez de inventá-los. Complete estes campos antes de gerar:',
    back: 'Voltar à revisão da carreira',
    edit: 'Editar dados da carreira',
    generate: 'Gerar currículo confiável',
    generating: 'Verificando e gerando…',
  },
} as const;

export default function TargetJobStep({
  data,
  isLoading,
  onBack,
  onEditDetails,
  onGenerate,
}: Readonly<TargetJobStepProps>) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const initialTarget = data.jobDescription?.trim() ?? '';
  const [mode, setMode] = useState<TargetMode>(initialTarget ? 'TARGETED' : null);
  const [jobDescription, setJobDescription] = useState(initialTarget);
  const readiness = useMemo(() => evaluateGenerationReadiness(data), [data]);

  const canGenerate = useMemo(() => {
    if (isLoading || mode === null || !readiness.ready) return false;
    if (mode === 'GENERAL') return true;
    return jobDescription.trim().length >= 20;
  }, [isLoading, jobDescription, mode, readiness.ready]);

  const generate = async () => {
    if (!canGenerate || mode === null) return;
    await onGenerate({
      ...data,
      jobDescription: mode === 'TARGETED' ? jobDescription.trim() : '',
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">{copy.eyebrow}</p>
        <h2 className="mt-2 text-3xl font-serif font-bold tracking-tight text-gray-950">{copy.title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-500">{copy.description}</p>

        {!readiness.ready && (
          <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="text-sm font-bold text-amber-950">{copy.readinessTitle}</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-900">{copy.readinessBody}</p>
                <div className="mt-3 space-y-1.5">
                  {readiness.issues.slice(0, 8).map((issue) => (
                    <p key={`${issue.fieldPath}-${issue.message}`} className="rounded-md border border-amber-200 bg-white/70 px-3 py-2 text-xs text-amber-950">
                      <span className="font-mono font-bold">{issue.fieldPath}</span> — {issue.message}
                    </p>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={onEditDetails}
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-amber-900 px-4 py-2 text-sm font-bold text-white hover:bg-amber-800"
                >
                  <PencilLine className="h-4 w-4" /> {copy.edit}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-7 grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode('TARGETED')}
            className={`rounded-xl border-2 p-5 text-left transition ${mode === 'TARGETED' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-400'}`}
          >
            <Target className="h-5 w-5 text-blue-700" />
            <p className="mt-3 font-bold text-gray-950">{copy.targeted}</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-500">{copy.targetedDesc}</p>
          </button>

          <button
            type="button"
            onClick={() => setMode('GENERAL')}
            className={`rounded-xl border-2 p-5 text-left transition ${mode === 'GENERAL' ? 'border-gray-950 bg-gray-50' : 'border-gray-200 bg-white hover:border-gray-400'}`}
          >
            <FileText className="h-5 w-5 text-gray-700" />
            <p className="mt-3 font-bold text-gray-950">{copy.general}</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-500">{copy.generalDesc}</p>
          </button>
        </div>

        {mode === 'TARGETED' && (
          <div className="mt-6">
            <label htmlFor="target-job-description" className="text-sm font-semibold text-gray-800">{copy.label}</label>
            <textarea
              id="target-job-description"
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              rows={14}
              className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm leading-relaxed outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder={copy.placeholder}
            />
          </div>
        )}

        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
            <p className="text-sm leading-relaxed text-blue-900">{copy.trust}</p>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="button" onClick={onBack} disabled={isLoading} className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50">
          <ArrowLeft className="h-4 w-4" /> {copy.back}
        </button>
        <button type="button" onClick={onEditDetails} disabled={isLoading} className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50 sm:ml-3">
          <PencilLine className="h-4 w-4" /> {copy.edit}
        </button>
        <button
          type="button"
          onClick={generate}
          disabled={!canGenerate}
          className="rounded-md bg-gray-950 px-6 py-3 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 sm:ml-auto"
        >
          {isLoading ? copy.generating : copy.generate}
        </button>
      </div>
    </div>
  );
}
