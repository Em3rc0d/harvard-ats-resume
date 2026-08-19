'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, BriefcaseBusiness, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { ResumeRequest } from '@/lib/schemas';
import type { OpportunitySpace } from '@/lib/domain';
import { getOrCreateCareerVaultId } from '@/lib/client/CareerVaultCapability';
import { useLanguage } from '@/components/LanguageProvider';

type TargetSeniority = 'ENTRY' | 'JUNIOR' | 'MID' | 'SENIOR' | 'LEAD' | 'STAFF' | 'PRINCIPAL' | 'MANAGER' | 'DIRECTOR' | 'ANY';
type TargetWorkModel = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'FLEXIBLE';

type AssessmentResponse = {
  readonly success?: boolean;
  readonly data?: { readonly opportunityHistory?: { readonly assessmentId: string; readonly careerSnapshotId: string } };
  readonly error?: string;
};

type SpaceResponse = {
  readonly success?: boolean;
  readonly data?: {
    readonly opportunitySpace?: OpportunitySpace;
    readonly persistence?: { readonly status: 'DURABLE_OPPORTUNITY_SPACE'; readonly revision: number };
  };
  readonly error?: string;
};

type AssessedLabel = { readonly assessmentId: string; readonly label: string };

const SENIORITIES: readonly TargetSeniority[] = ['ANY', 'ENTRY', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'STAFF', 'PRINCIPAL', 'MANAGER', 'DIRECTOR'];
const WORK_MODELS: readonly TargetWorkModel[] = ['FLEXIBLE', 'REMOTE', 'HYBRID', 'ONSITE'];

const COPY = {
  en: {
    eyebrow: 'Opportunity Space', title: 'Compare where your attention is worth spending',
    description: 'Use one career state and one Career Target across several jobs. Evidence readiness and target preference remain separate.',
    role: 'Target role', rolePlaceholder: 'e.g. Senior Backend Engineer', seniority: 'Preferred seniority',
    location: 'Preferred location', locationPlaceholder: 'e.g. Lima, Peru', workModel: 'Work model',
    jobs: 'Opportunities', add: 'Add opportunity', jobPlaceholder: 'Paste a complete job description…',
    analyze: 'Build Opportunity Space', analyzing: 'Assessing opportunities…', back: 'Back to one job',
    boundary: 'Priority is derived decision support. It never changes your Career Evidence or the evidence-backed Job Match.',
    result: 'Your Opportunity Space', revision: 'Durable revision', gaps: 'critical gaps', relevance: 'target relevance',
    locked: 'Inputs are locked while durable assessments are being written.',
  },
  es: {
    eyebrow: 'Opportunity Space', title: 'Compara dónde vale la pena invertir tu atención',
    description: 'Usa un mismo estado de carrera y un mismo Career Target frente a varias vacantes. La evidencia y la preferencia permanecen separadas.',
    role: 'Rol objetivo', rolePlaceholder: 'ej. Senior Backend Engineer', seniority: 'Seniority preferido',
    location: 'Ubicación preferida', locationPlaceholder: 'ej. Lima, Perú', workModel: 'Modalidad',
    jobs: 'Oportunidades', add: 'Agregar oportunidad', jobPlaceholder: 'Pega una descripción completa de la vacante…',
    analyze: 'Construir Opportunity Space', analyzing: 'Evaluando oportunidades…', back: 'Volver a una vacante',
    boundary: 'La prioridad es una recomendación derivada. Nunca modifica Career Evidence ni el Job Match respaldado por evidencia.',
    result: 'Tu Opportunity Space', revision: 'Revisión durable', gaps: 'brechas críticas', relevance: 'relevancia con target',
    locked: 'Los inputs quedan bloqueados mientras se escriben evaluaciones durables.',
  },
  fr: {
    eyebrow: 'Opportunity Space', title: 'Comparez où votre attention mérite d’être investie',
    description: 'Utilisez un même état de carrière et une même Career Target pour plusieurs offres. Preuves et préférences restent séparées.',
    role: 'Rôle cible', rolePlaceholder: 'ex. Senior Backend Engineer', seniority: 'Niveau préféré',
    location: 'Lieu préféré', locationPlaceholder: 'ex. Paris, France', workModel: 'Mode de travail',
    jobs: 'Opportunités', add: 'Ajouter une opportunité', jobPlaceholder: 'Collez une description complète du poste…',
    analyze: 'Construire Opportunity Space', analyzing: 'Évaluation des opportunités…', back: 'Retour à un poste',
    boundary: 'La priorité est une recommandation dérivée. Elle ne modifie jamais Career Evidence ni le Job Match fondé sur les preuves.',
    result: 'Votre Opportunity Space', revision: 'Révision durable', gaps: 'écarts critiques', relevance: 'pertinence cible',
    locked: 'Les champs sont verrouillés pendant l’écriture des évaluations durables.',
  },
  pt: {
    eyebrow: 'Opportunity Space', title: 'Compare onde vale a pena investir sua atenção',
    description: 'Use o mesmo estado de carreira e o mesmo Career Target para várias vagas. Evidência e preferência permanecem separadas.',
    role: 'Cargo alvo', rolePlaceholder: 'ex. Senior Backend Engineer', seniority: 'Senioridade preferida',
    location: 'Local preferido', locationPlaceholder: 'ex. São Paulo, Brasil', workModel: 'Modelo de trabalho',
    jobs: 'Oportunidades', add: 'Adicionar oportunidade', jobPlaceholder: 'Cole uma descrição completa da vaga…',
    analyze: 'Construir Opportunity Space', analyzing: 'Avaliando oportunidades…', back: 'Voltar para uma vaga',
    boundary: 'Prioridade é recomendação derivada. Nunca altera Career Evidence nem o Job Match respaldado por evidência.',
    result: 'Seu Opportunity Space', revision: 'Revisão durável', gaps: 'lacunas críticas', relevance: 'relevância do target',
    locked: 'Os campos ficam bloqueados enquanto as avaliações duráveis são gravadas.',
  },
} as const;

function jobLabel(jobDescription: string, index: number): string {
  const firstMeaningfulLine = jobDescription.split(/\n+/).map((line) => line.trim()).find(Boolean);
  return firstMeaningfulLine?.slice(0, 100) || `Opportunity ${index + 1}`;
}

export default function OpportunitySpaceStep({ data, onBack }: Readonly<{ data: ResumeRequest; onBack: () => void }>) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const [targetRole, setTargetRole] = useState('');
  const [targetSeniority, setTargetSeniority] = useState<TargetSeniority>('ANY');
  const [targetLocation, setTargetLocation] = useState('');
  const [targetWorkModel, setTargetWorkModel] = useState<TargetWorkModel>('FLEXIBLE');
  const [jobs, setJobs] = useState<string[]>(['', '']);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [space, setSpace] = useState<OpportunitySpace | null>(null);
  const [spaceRevision, setSpaceRevision] = useState<number | null>(null);
  const [labels, setLabels] = useState<AssessedLabel[]>([]);

  const validJobs = useMemo(() => jobs.filter((job) => job.trim().length >= 20), [jobs]);
  const canAnalyze = targetRole.trim().length >= 2 && validJobs.length >= 2 && !isAnalyzing;

  const invalidateSpace = () => {
    setSpace(null);
    setSpaceRevision(null);
    setLabels([]);
  };

  const updateJob = (index: number, value: string) => {
    if (isAnalyzing) return;
    setJobs((current) => current.map((job, jobIndex) => jobIndex === index ? value : job));
    invalidateSpace();
  };

  const addJob = () => {
    if (isAnalyzing || jobs.length >= 10) return;
    setJobs((current) => [...current, '']);
    invalidateSpace();
  };

  const removeJob = (index: number) => {
    if (isAnalyzing || jobs.length <= 2) return;
    setJobs((current) => current.filter((_, jobIndex) => jobIndex !== index));
    invalidateSpace();
  };

  const updateTarget = (change: () => void) => {
    if (isAnalyzing) return;
    change();
    invalidateSpace();
  };

  const buildSpace = async () => {
    if (!canAnalyze) return;

    // Capture exactly one immutable UI snapshot before any durable write. The
    // controls remain disabled until the complete sequence finishes.
    const targetSnapshot = {
      roleTitle: targetRole.trim(),
      preferredSeniority: targetSeniority,
      preferredLocations: targetLocation.trim() ? [targetLocation.trim()] : [],
      workModels: [targetWorkModel],
    } as const;
    const selectedJobs = jobs.map((job) => job.trim()).filter((job) => job.length >= 20);

    setIsAnalyzing(true);
    setError(null);
    invalidateSpace();

    try {
      const careerVaultId = getOrCreateCareerVaultId();
      const assessed: AssessedLabel[] = [];
      let boundCareerSnapshotId: string | null = null;

      for (let index = 0; index < selectedJobs.length; index += 1) {
        const jobDescription = selectedJobs[index];
        const response = await fetch('/api/assess-opportunity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...data,
            jobDescription,
            careerVaultId,
            careerTarget: {
              ...targetSnapshot,
              employmentTypes: ['ANY'], industries: [], relocation: 'UNSPECIFIED', priority: 3,
            },
          }),
        });
        const result = await response.json() as AssessmentResponse;
        const durable = result.data?.opportunityHistory;
        if (!response.ok || !result.success || !durable) {
          throw new Error(result.error || `Opportunity ${index + 1} could not be durably assessed.`);
        }
        if (boundCareerSnapshotId && durable.careerSnapshotId !== boundCareerSnapshotId) {
          throw new Error('The candidate CareerSnapshot changed while the Opportunity Space was being built. Restart from one stable career state.');
        }
        boundCareerSnapshotId ??= durable.careerSnapshotId;
        assessed.push({ assessmentId: durable.assessmentId, label: jobLabel(jobDescription, index) });
      }

      const spaceResponse = await fetch('/api/opportunity-space', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          careerVaultId,
          opportunityAssessmentIds: assessed.map((item) => item.assessmentId),
        }),
      });
      const spaceResult = await spaceResponse.json() as SpaceResponse;
      const durableSpace = spaceResult.data?.opportunitySpace;
      if (!spaceResponse.ok || !spaceResult.success || !durableSpace || spaceResult.data?.persistence?.status !== 'DURABLE_OPPORTUNITY_SPACE') {
        throw new Error(spaceResult.error || 'Opportunity Space could not be durably completed.');
      }

      setLabels(assessed);
      setSpace(durableSpace);
      setSpaceRevision(spaceResult.data.persistence.revision);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Opportunity Space could not be completed safely.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const labelByAssessment = new Map(labels.map((item) => [item.assessmentId, item.label]));
  const lockedClass = isAnalyzing ? ' cursor-not-allowed opacity-60' : '';

  return (
    <div className="mx-auto max-w-5xl space-y-6" aria-busy={isAnalyzing}>
      <button type="button" onClick={onBack} disabled={isAnalyzing} className={`inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-950 disabled:cursor-not-allowed disabled:opacity-40`}>
        <ArrowLeft className="h-4 w-4" /> {copy.back}
      </button>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">{copy.eyebrow}</p>
        <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight text-gray-950">{copy.title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-500">{copy.description}</p>
        {isAnalyzing && <p className="mt-3 text-xs font-semibold text-blue-700" role="status">{copy.locked}</p>}

        <fieldset disabled={isAnalyzing} className={`mt-7 grid gap-4 md:grid-cols-2${lockedClass}`}>
          <label className="text-sm font-semibold text-gray-800">{copy.role}
            <input value={targetRole} onChange={(event) => updateTarget(() => setTargetRole(event.target.value))} placeholder={copy.rolePlaceholder} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500" />
          </label>
          <label className="text-sm font-semibold text-gray-800">{copy.seniority}
            <select value={targetSeniority} onChange={(event) => updateTarget(() => setTargetSeniority(event.target.value as TargetSeniority))} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500">
              {SENIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-gray-800">{copy.location}
            <input value={targetLocation} onChange={(event) => updateTarget(() => setTargetLocation(event.target.value))} placeholder={copy.locationPlaceholder} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500" />
          </label>
          <label className="text-sm font-semibold text-gray-800">{copy.workModel}
            <select value={targetWorkModel} onChange={(event) => updateTarget(() => setTargetWorkModel(event.target.value as TargetWorkModel))} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500">
              {WORK_MODELS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </fieldset>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-center justify-between gap-4">
          <div><h3 className="text-lg font-bold text-gray-950">{copy.jobs}</h3><p className="mt-1 text-xs text-gray-500">2–10 · one stable CareerSnapshot · one active CareerTarget</p></div>
          <button type="button" onClick={addJob} disabled={isAnalyzing || jobs.length >= 10} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-4 w-4" /> {copy.add}</button>
        </div>

        <div className="mt-5 space-y-4">
          {jobs.map((job, index) => (
            <div key={index} className="rounded-xl border border-gray-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Opportunity {index + 1}</span>
                <button type="button" onClick={() => removeJob(index)} disabled={isAnalyzing || jobs.length <= 2} aria-label={`Remove opportunity ${index + 1}`} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
              </div>
              <textarea value={job} onChange={(event) => updateJob(index, event.target.value)} disabled={isAnalyzing} rows={7} placeholder={copy.jobPlaceholder} className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50" />
            </div>
          ))}
        </div>

        {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</div>}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex max-w-2xl items-start gap-2 text-xs leading-relaxed text-gray-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-700" /><span>{copy.boundary}</span></div>
          <button type="button" onClick={() => void buildSpace()} disabled={!canAnalyze} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 py-3 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"><BriefcaseBusiness className="h-4 w-4" /> {isAnalyzing ? copy.analyzing : copy.analyze}</button>
        </div>
      </section>

      {space && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">{copy.result}</p><h3 className="mt-2 font-serif text-2xl font-bold text-gray-950">{space.entries.length} opportunities, one explainable order</h3></div>
            {spaceRevision !== null && <span className="text-xs font-semibold text-gray-500">{copy.revision}: {spaceRevision}</span>}
          </div>
          <div className="mt-6 space-y-3">
            {space.entries.map((entry, index) => (
              <article key={entry.opportunityAssessmentId} className="rounded-xl border border-gray-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><div className="text-xs font-bold uppercase tracking-wider text-gray-400">#{index + 1} · {entry.priority}</div><h4 className="mt-1 text-base font-bold text-gray-950">{labelByAssessment.get(entry.opportunityAssessmentId) ?? entry.jobSnapshotId}</h4></div>
                  <div className="text-right text-xs text-gray-500"><div>{entry.recommendation}</div><div>{copy.relevance}: {entry.targetRelevance.level}</div><div>{entry.criticalGapCount} {copy.gaps}</div></div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{entry.rationale}</p>
              </article>
            ))}
          </div>
          <p className="mt-5 text-xs leading-relaxed text-gray-500">{space.scopeBoundary}</p>
        </section>
      )}
    </div>
  );
}
