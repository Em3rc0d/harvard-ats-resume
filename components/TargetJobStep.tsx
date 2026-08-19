'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Compass,
  FileText,
  PencilLine,
  Search,
  ShieldCheck,
  Target,
} from 'lucide-react';
import type { ResumeRequest } from '@/lib/schemas';
import { evaluateGenerationReadiness } from '@/lib/application/product/GenerationReadiness';
import type { OpportunityAssessment } from '@/lib/application/opportunity/OpportunityAssessment';
import { getOrCreateCareerVaultId } from '@/lib/client/CareerVaultCapability';
import OpportunityAssessmentCard from '@/components/OpportunityAssessmentCard';
import { useLanguage } from '@/components/LanguageProvider';

interface TargetJobStepProps {
  readonly data: ResumeRequest;
  readonly isLoading: boolean;
  readonly onBack: () => void;
  readonly onEditDetails: () => void;
  readonly onGenerate: (data: ResumeRequest) => Promise<void>;
}

type TargetMode = 'TARGETED' | 'GENERAL' | null;
type TargetSeniority = 'ENTRY' | 'JUNIOR' | 'MID' | 'SENIOR' | 'LEAD' | 'STAFF' | 'PRINCIPAL' | 'MANAGER' | 'DIRECTOR' | 'ANY';
type TargetWorkModel = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'FLEXIBLE';
type TargetDimensionStatus = 'ALIGNED' | 'PARTIAL' | 'CONFLICT' | 'UNKNOWN' | 'NOT_CONSTRAINED';

type TargetRelevance = {
  readonly level: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  readonly role: TargetDimensionStatus;
  readonly seniority: TargetDimensionStatus;
  readonly location: TargetDimensionStatus;
  readonly workModel: TargetDimensionStatus;
  readonly employmentType: TargetDimensionStatus;
  readonly reasons: readonly string[];
  readonly scopeBoundary: 'PREFERENCE_ALIGNMENT_NOT_CAPABILITY_EVIDENCE';
};

type OpportunityAssessmentResponse = {
  readonly success?: boolean;
  readonly data?: {
    readonly assessment?: OpportunityAssessment;
    readonly careerTarget?: {
      readonly relevance: TargetRelevance;
      readonly portfolioRevision: number;
      readonly scopeBoundary: 'TARGET_PREFERENCE_DOES_NOT_CHANGE_JOB_MATCH';
    };
    readonly opportunityHistory?: {
      readonly persistence: 'DURABLE_OPPORTUNITY_HISTORY';
      readonly assessmentId: string;
      readonly careerSnapshotId: string;
      readonly jobSnapshotId: string;
      readonly revision: number;
    };
  };
  readonly error?: string;
};

const SENIORITIES: readonly TargetSeniority[] = ['ANY', 'ENTRY', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'STAFF', 'PRINCIPAL', 'MANAGER', 'DIRECTOR'];
const WORK_MODELS: readonly TargetWorkModel[] = ['FLEXIBLE', 'REMOTE', 'HYBRID', 'ONSITE'];

const COPY = {
  en: {
    eyebrow: 'Target', title: 'What are you applying for?',
    description: 'Career evidence answers what you can defend. Career Target records what direction you actually want. The two stay separate.',
    targeted: 'Specific job', targetedDesc: 'Define your direction, paste the role, assess it, then build from supported evidence.',
    general: 'General resume', generalDesc: 'Create a general version without Opportunity Assessment.',
    targetTitle: 'Career Target', targetHelp: 'Intent is not evidence. These preferences help decide relevance; they never satisfy job requirements.',
    roleLabel: 'Target role', rolePlaceholder: 'e.g. Senior Backend Engineer', seniorityLabel: 'Preferred seniority',
    locationLabel: 'Preferred location', locationPlaceholder: 'e.g. Lima, Peru', workModelLabel: 'Work model',
    label: 'Job description', placeholder: 'Paste the full job description here…',
    trust: 'Missing requirements stay missing. Neither a Career Target nor a Job Description can create a skill, responsibility, metric, seniority, or credential.',
    readinessTitle: 'Your career evidence needs review before assessment or generation.', readinessBody: 'Review these evidence fields before continuing:',
    back: 'Back to career review', edit: 'Edit career details', assess: 'Assess opportunity', assessing: 'Assessing evidence…',
    assessHint: 'Evidence fit and target relevance are deterministic and separate. No resume is generated here.',
    generate: 'Generate trusted resume', build: 'Build targeted resume', generating: 'Checking and generating…',
    relevanceTitle: 'Target relevance', relevanceBoundary: 'This evaluates preference alignment only. It does not change Job Match or candidate evidence.',
    locked: 'Target inputs are locked while the durable assessment is running.', failure: 'Opportunity assessment could not be durably completed.',
  },
  es: {
    eyebrow: 'Objetivo', title: '¿A qué estás postulando?',
    description: 'Career Evidence responde qué puedes defender. Career Target registra hacia dónde realmente quieres ir. Ambos permanecen separados.',
    targeted: 'Vacante específica', targetedDesc: 'Define tu dirección, pega la vacante, evalúala y luego construye con evidencia respaldada.',
    general: 'CV general', generalDesc: 'Crea una versión general sin Opportunity Assessment.',
    targetTitle: 'Career Target', targetHelp: 'La intención no es evidencia. Estas preferencias ayudan a decidir relevancia; nunca cumplen requisitos de la vacante.',
    roleLabel: 'Rol objetivo', rolePlaceholder: 'ej. Senior Backend Engineer', seniorityLabel: 'Seniority preferido',
    locationLabel: 'Ubicación preferida', locationPlaceholder: 'ej. Lima, Perú', workModelLabel: 'Modalidad',
    label: 'Descripción de la vacante', placeholder: 'Pega aquí la descripción completa de la vacante…',
    trust: 'Los requisitos faltantes permanecen faltantes. Ni Career Target ni la vacante pueden crear una skill, responsabilidad, métrica, seniority o credencial.',
    readinessTitle: 'Tu evidencia profesional necesita revisión antes de evaluar o generar.', readinessBody: 'Revisa estos campos de evidencia antes de continuar:',
    back: 'Volver a revisión de carrera', edit: 'Editar datos de carrera', assess: 'Evaluar oportunidad', assessing: 'Evaluando evidencia…',
    assessHint: 'El fit de evidencia y la relevancia del target son determinísticos y separados. Aquí no se genera el CV.',
    generate: 'Generar CV confiable', build: 'Construir CV dirigido', generating: 'Verificando y generando…',
    relevanceTitle: 'Relevancia con tu target', relevanceBoundary: 'Esto evalúa sólo preferencias. No modifica Job Match ni evidencia del candidato.',
    locked: 'Los inputs del target quedan bloqueados durante la evaluación durable.', failure: 'La evaluación no pudo completarse de forma durable.',
  },
  fr: {
    eyebrow: 'Cible', title: 'À quel poste postulez-vous ?',
    description: 'Career Evidence décrit ce que vous pouvez défendre. Career Target décrit la direction souhaitée. Les deux restent séparés.',
    targeted: 'Poste spécifique', targetedDesc: 'Définissez votre direction, collez le poste, évaluez-le puis construisez avec des preuves.',
    general: 'CV général', generalDesc: "Créez une version générale sans évaluation d'opportunité.",
    targetTitle: 'Career Target', targetHelp: "L'intention n'est pas une preuve. Ces préférences servent à juger la pertinence, jamais à satisfaire une exigence.",
    roleLabel: 'Rôle cible', rolePlaceholder: 'ex. Senior Backend Engineer', seniorityLabel: 'Niveau préféré',
    locationLabel: 'Lieu préféré', locationPlaceholder: 'ex. Paris, France', workModelLabel: 'Mode de travail',
    label: 'Description du poste', placeholder: 'Collez ici la description complète du poste…',
    trust: "Une cible ou une offre ne peut jamais créer une compétence, responsabilité, métrique, ancienneté ou certification du candidat.",
    readinessTitle: 'Vos preuves de carrière doivent être revues avant toute évaluation ou génération.', readinessBody: 'Vérifiez ces champs de preuve avant de continuer :',
    back: 'Retour à la revue', edit: 'Modifier la carrière', assess: "Évaluer l'opportunité", assessing: 'Évaluation des preuves…',
    assessHint: "Le fit de preuve et la pertinence de cible sont déterministes et séparés. Aucun CV n'est généré ici.",
    generate: 'Générer le CV fiable', build: 'Construire le CV ciblé', generating: 'Vérification et génération…',
    relevanceTitle: 'Pertinence de la cible', relevanceBoundary: "Évalue seulement les préférences. Ne modifie ni Job Match ni les preuves du candidat.",
    locked: "Les champs cible sont verrouillés pendant l'évaluation durable.", failure: "L'évaluation n'a pas pu être finalisée durablement.",
  },
  pt: {
    eyebrow: 'Alvo', title: 'Para qual vaga você está se candidatando?',
    description: 'Career Evidence responde o que você pode defender. Career Target registra a direção que você realmente quer. Os dois ficam separados.',
    targeted: 'Vaga específica', targetedDesc: 'Defina sua direção, cole a vaga, avalie e depois construa com evidência respaldada.',
    general: 'Currículo geral', generalDesc: 'Crie uma versão geral sem Opportunity Assessment.',
    targetTitle: 'Career Target', targetHelp: 'Intenção não é evidência. Preferências ajudam a decidir relevância; nunca cumprem requisitos da vaga.',
    roleLabel: 'Cargo alvo', rolePlaceholder: 'ex. Senior Backend Engineer', seniorityLabel: 'Senioridade preferida',
    locationLabel: 'Local preferido', locationPlaceholder: 'ex. São Paulo, Brasil', workModelLabel: 'Modelo de trabalho',
    label: 'Descrição da vaga', placeholder: 'Cole aqui a descrição completa da vaga…',
    trust: 'Requisitos ausentes continuam ausentes. Nem Career Target nem a vaga podem criar skill, responsabilidade, métrica, senioridade ou credencial.',
    readinessTitle: 'Sua evidência profissional precisa de revisão antes de avaliar ou gerar.', readinessBody: 'Revise estes campos de evidência antes de continuar:',
    back: 'Voltar à revisão da carreira', edit: 'Editar dados de carreira', assess: 'Avaliar oportunidade', assessing: 'Avaliando evidência…',
    assessHint: 'Fit de evidência e relevância do target são determinísticos e separados. Nenhum currículo é gerado aqui.',
    generate: 'Gerar currículo confiável', build: 'Construir currículo direcionado', generating: 'Verificando e gerando…',
    relevanceTitle: 'Relevância do target', relevanceBoundary: 'Avalia apenas preferências. Não altera Job Match nem evidência do candidato.',
    locked: 'Os inputs de alvo ficam bloqueados durante a avaliação durável.', failure: 'A avaliação não pôde ser concluída de forma durável.',
  },
} as const;

export default function TargetJobStep({ data, isLoading, onBack, onEditDetails, onGenerate }: Readonly<TargetJobStepProps>) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const initialJob = data.jobDescription?.trim() ?? '';
  const [mode, setMode] = useState<TargetMode>(initialJob ? 'TARGETED' : null);
  const [jobDescription, setJobDescription] = useState(initialJob);
  const [targetRole, setTargetRole] = useState('');
  const [targetSeniority, setTargetSeniority] = useState<TargetSeniority>('ANY');
  const [targetLocation, setTargetLocation] = useState('');
  const [targetWorkModel, setTargetWorkModel] = useState<TargetWorkModel>('FLEXIBLE');
  const [assessment, setAssessment] = useState<OpportunityAssessment | null>(null);
  const [targetRelevance, setTargetRelevance] = useState<TargetRelevance | null>(null);
  const [assessedJobDescription, setAssessedJobDescription] = useState('');
  const [assessedTargetKey, setAssessedTargetKey] = useState('');
  const [isAssessing, setIsAssessing] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const readiness = useMemo(() => evaluateGenerationReadiness(data), [data]);
  const busy = isLoading || isAssessing;

  const normalizedJobDescription = jobDescription.trim();
  const normalizedTargetRole = targetRole.trim();
  const normalizedTargetLocation = targetLocation.trim();
  const targetKey = useMemo(() => JSON.stringify({
    roleTitle: normalizedTargetRole,
    preferredSeniority: targetSeniority,
    preferredLocations: normalizedTargetLocation ? [normalizedTargetLocation] : [],
    workModels: [targetWorkModel],
  }), [normalizedTargetLocation, normalizedTargetRole, targetSeniority, targetWorkModel]);

  const currentAssessment = assessment && assessedJobDescription === normalizedJobDescription && assessedTargetKey === targetKey
    ? assessment
    : null;

  const invalidateAssessment = () => {
    setAssessment(null);
    setTargetRelevance(null);
    setAssessedJobDescription('');
    setAssessedTargetKey('');
    setAssessmentError(null);
  };

  const mutateTarget = (change: () => void) => {
    if (busy) return;
    change();
    invalidateAssessment();
  };

  const canAssess = !busy && mode === 'TARGETED' && readiness.ready && normalizedJobDescription.length >= 20 && normalizedTargetRole.length >= 2;
  const canGenerate = !busy && readiness.ready && (
    mode === 'GENERAL' || (mode === 'TARGETED' && Boolean(currentAssessment && targetRelevance))
  );

  const assess = async () => {
    if (!canAssess) return;

    // Freeze a single request snapshot before the durable write begins. The UI
    // remains disabled until the response has either been accepted or rejected.
    const jobSnapshot = normalizedJobDescription;
    const targetSnapshot = {
      roleTitle: normalizedTargetRole,
      preferredSeniority: targetSeniority,
      preferredLocations: normalizedTargetLocation ? [normalizedTargetLocation] : [],
      workModels: [targetWorkModel],
      employmentTypes: ['ANY'],
      industries: [],
      relocation: 'UNSPECIFIED',
      priority: 3,
    } as const;
    const snapshotKey = targetKey;

    setIsAssessing(true);
    setAssessmentError(null);

    try {
      const response = await fetch('/api/assess-opportunity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          jobDescription: jobSnapshot,
          careerVaultId: getOrCreateCareerVaultId(),
          careerTarget: targetSnapshot,
        }),
      });

      let result: OpportunityAssessmentResponse;
      try {
        result = await response.json() as OpportunityAssessmentResponse;
      } catch {
        invalidateAssessment();
        setAssessmentError(copy.failure);
        return;
      }

      if (!response.ok || !result.success || !result.data?.assessment || !result.data.opportunityHistory || !result.data.careerTarget?.relevance) {
        invalidateAssessment();
        setAssessmentError(result.error || copy.failure);
        return;
      }

      setAssessment(result.data.assessment);
      setTargetRelevance(result.data.careerTarget.relevance);
      setAssessedJobDescription(jobSnapshot);
      setAssessedTargetKey(snapshotKey);
    } catch {
      invalidateAssessment();
      setAssessmentError(copy.failure);
    } finally {
      setIsAssessing(false);
    }
  };

  const generate = async () => {
    if (!canGenerate || mode === null) return;
    await onGenerate({ ...data, jobDescription: mode === 'TARGETED' ? normalizedJobDescription : '' });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6" aria-busy={busy}>
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">{copy.eyebrow}</p>
        <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight text-gray-950">{copy.title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-500">{copy.description}</p>
        {busy && <p className="mt-3 text-xs font-semibold text-blue-700" role="status">{copy.locked}</p>}

        {!readiness.ready && (
          <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4" role="alert">
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
                <button type="button" onClick={onEditDetails} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-md bg-amber-900 px-4 py-2 text-sm font-bold text-white hover:bg-amber-800 disabled:opacity-40">
                  <PencilLine className="h-4 w-4" /> {copy.edit}
                </button>
              </div>
            </div>
          </div>
        )}

        <fieldset disabled={busy} className="mt-7">
          <div className="grid gap-4 md:grid-cols-2">
            <button type="button" onClick={() => mutateTarget(() => setMode('TARGETED'))} className={`rounded-xl border-2 p-5 text-left transition ${mode === 'TARGETED' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-400'}`}>
              <Target className="h-5 w-5 text-blue-700" />
              <p className="mt-3 font-bold text-gray-950">{copy.targeted}</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-500">{copy.targetedDesc}</p>
            </button>
            <button type="button" onClick={() => mutateTarget(() => setMode('GENERAL'))} className={`rounded-xl border-2 p-5 text-left transition ${mode === 'GENERAL' ? 'border-gray-950 bg-gray-50' : 'border-gray-200 bg-white hover:border-gray-400'}`}>
              <FileText className="h-5 w-5 text-gray-700" />
              <p className="mt-3 font-bold text-gray-950">{copy.general}</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-500">{copy.generalDesc}</p>
            </button>
          </div>

          {mode === 'TARGETED' && (
            <div className="mt-6 space-y-6">
              <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-5">
                <div className="flex items-start gap-3">
                  <Compass className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" />
                  <div><h3 className="font-bold text-violet-950">{copy.targetTitle}</h3><p className="mt-1 text-xs leading-relaxed text-violet-800">{copy.targetHelp}</p></div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-semibold text-gray-800">{copy.roleLabel}
                    <input value={targetRole} onChange={(event) => mutateTarget(() => setTargetRole(event.target.value))} placeholder={copy.rolePlaceholder} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-violet-500" />
                  </label>
                  <label className="text-sm font-semibold text-gray-800">{copy.seniorityLabel}
                    <select value={targetSeniority} onChange={(event) => mutateTarget(() => setTargetSeniority(event.target.value as TargetSeniority))} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal">{SENIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}</select>
                  </label>
                  <label className="text-sm font-semibold text-gray-800">{copy.locationLabel}
                    <input value={targetLocation} onChange={(event) => mutateTarget(() => setTargetLocation(event.target.value))} placeholder={copy.locationPlaceholder} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-violet-500" />
                  </label>
                  <label className="text-sm font-semibold text-gray-800">{copy.workModelLabel}
                    <select value={targetWorkModel} onChange={(event) => mutateTarget(() => setTargetWorkModel(event.target.value as TargetWorkModel))} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal">{WORK_MODELS.map((value) => <option key={value} value={value}>{value}</option>)}</select>
                  </label>
                </div>
              </div>

              <div>
                <label htmlFor="target-job-description" className="text-sm font-semibold text-gray-800">{copy.label}</label>
                <textarea id="target-job-description" value={jobDescription} onChange={(event) => mutateTarget(() => setJobDescription(event.target.value))} rows={14} className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm leading-relaxed outline-none focus:border-blue-500" placeholder={copy.placeholder} />
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button type="button" onClick={() => void assess()} disabled={!canAssess} className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40">
                    <Search className="h-4 w-4" /> {isAssessing ? copy.assessing : copy.assess}
                  </button>
                  <p className="text-xs leading-relaxed text-gray-500">{copy.assessHint}</p>
                </div>
                {assessmentError && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{assessmentError}</div>}
              </div>
            </div>
          )}
        </fieldset>

        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" /><p className="text-sm leading-relaxed text-blue-900">{copy.trust}</p></div>
        </div>
      </section>

      {currentAssessment && <OpportunityAssessmentCard assessment={currentAssessment} />}

      {currentAssessment && targetRelevance && (
        <section className="rounded-2xl border border-violet-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-600">Career Target</p><h3 className="mt-1 text-xl font-bold text-gray-950">{copy.relevanceTitle}</h3></div>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black text-violet-800">{targetRelevance.level}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
            {([
              ['ROLE', targetRelevance.role],
              ['SENIORITY', targetRelevance.seniority],
              ['LOCATION', targetRelevance.location],
              ['WORK MODEL', targetRelevance.workModel],
              ['EMPLOYMENT', targetRelevance.employmentType],
            ] as const).map(([label, status]) => (
              <div key={label} className="rounded-lg border border-gray-200 p-3"><p className="font-bold text-gray-500">{label}</p><p className="mt-1 font-black text-gray-900">{status}</p></div>
            ))}
          </div>
          <div className="mt-4 space-y-2">{targetRelevance.reasons.map((reason) => <p key={reason} className="text-sm leading-relaxed text-gray-600">• {reason}</p>)}</div>
          <p className="mt-4 border-t border-gray-100 pt-3 text-xs font-medium text-violet-800">{copy.relevanceBoundary}</p>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="button" onClick={onBack} disabled={busy} className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft className="h-4 w-4" /> {copy.back}</button>
        <button type="button" onClick={onEditDetails} disabled={busy} className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 sm:ml-3"><PencilLine className="h-4 w-4" /> {copy.edit}</button>
        <button type="button" onClick={() => void generate()} disabled={!canGenerate} className="rounded-md bg-gray-950 px-6 py-3 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 sm:ml-auto">{isLoading ? copy.generating : mode === 'TARGETED' ? copy.build : copy.generate}</button>
      </div>
    </div>
  );
}
