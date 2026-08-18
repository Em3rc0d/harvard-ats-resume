'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resumeRequestSchema, ResumeRequest } from '@/lib/schemas';
import { useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import VoiceInput from './VoiceInput';
import { useLanguage } from '@/components/LanguageProvider';
import { CheckCircle2, FileText, Info, Upload, Wand2 } from 'lucide-react';

// Dynamic import with SSR disabled to prevent PDF.js server-side errors
const CertificateUpload = dynamic(() => import('./CertificateUpload'), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
      <p className="mt-2 text-sm text-slate-500">Loading certificate uploader...</p>
    </div>
  ),
});

const YEAR_REGEX = /\d{4}/;

const OPTIMIZER_COPY = {
  en: {
    needText: 'Write at least 10 characters before asking for a safer rewrite.',
    unavailable: 'The internal optimization service is not available right now.',
    failed: 'We could not improve this text safely. Your original text was preserved.',
    improved: 'Wording improved. No new career facts were authorized by this action.',
    unchanged: 'No safe wording change was needed. Your current text was preserved.',
    fallback: 'The proposed rewrite could not be proven fact-preserving, so your source-safe text was kept.',
    summaryHint: 'AI may improve clarity and structure, but it cannot add career facts you did not provide.',
    metricsHint: 'Use metrics only when they are true and you can verify them.',
    optimize: 'Optimize & Improve',
    optimizing: 'Checking safe rewrite...',
    experiencePlaceholder: 'Describe what you actually did, the technologies you used, and verified outcomes when available.',
    projectPlaceholder: 'Describe what you built, your actual role, the technologies used, and verified outcomes when available.',
    targetBody: 'Paste the job description to compare its requirements against your career evidence. The vacancy cannot create candidate skills or facts.',
    generalBody: 'Create a general evidence-backed resume without a target-specific Opportunity Assessment.',
    generalSelected: 'Generate a general evidence-backed resume version from the career facts you provided.',
  },
  es: {
    needText: 'Escribe al menos 10 caracteres antes de pedir una reescritura segura.',
    unavailable: 'El servicio interno de mejora no está disponible en este momento.',
    failed: 'No pudimos mejorar este texto de forma segura. Conservamos tu texto original.',
    improved: 'Redacción mejorada. Esta acción no autorizó nuevos hechos profesionales.',
    unchanged: 'No fue necesario hacer un cambio seguro de redacción. Conservamos tu texto actual.',
    fallback: 'La propuesta no pudo demostrarse como fiel a tus hechos, así que conservamos tu texto respaldado.',
    summaryHint: 'La IA puede mejorar claridad y estructura, pero no puede agregar hechos profesionales que no proporcionaste.',
    metricsHint: 'Usa métricas únicamente cuando sean reales y puedas verificarlas.',
    optimize: 'Optimizar y Mejorar',
    optimizing: 'Verificando mejora segura...',
    experiencePlaceholder: 'Describe lo que realmente hiciste, las tecnologías que usaste y resultados verificables cuando existan.',
    projectPlaceholder: 'Describe qué construiste, cuál fue realmente tu rol, las tecnologías usadas y resultados verificables cuando existan.',
    targetBody: 'Pega la vacante para comparar sus requisitos contra tu evidencia profesional. La oferta no puede crear skills ni hechos del candidato.',
    generalBody: 'Crea un CV general respaldado por evidencia, sin un Opportunity Assessment específico para una vacante.',
    generalSelected: 'Genera una versión general del CV usando únicamente los hechos profesionales que proporcionaste.',
  },
  fr: {
    needText: 'Écrivez au moins 10 caractères avant de demander une reformulation sûre.',
    unavailable: "Le service interne d'amélioration n'est pas disponible actuellement.",
    failed: "Le texte n'a pas pu être amélioré en toute sécurité. Le texte original a été conservé.",
    improved: 'La formulation a été améliorée sans autoriser de nouveaux faits professionnels.',
    unchanged: "Aucune modification sûre n'était nécessaire. Votre texte actuel a été conservé.",
    fallback: "La proposition n'a pas pu être prouvée fidèle aux faits ; le texte source a donc été conservé.",
    summaryHint: "L'IA peut améliorer la clarté et la structure, mais elle ne peut pas ajouter de faits professionnels absents de vos données.",
    metricsHint: 'Utilisez des métriques uniquement si elles sont vraies et vérifiables.',
    optimize: 'Optimiser et améliorer',
    optimizing: 'Vérification de la reformulation...',
    experiencePlaceholder: 'Décrivez ce que vous avez réellement fait, les technologies utilisées et les résultats vérifiables disponibles.',
    projectPlaceholder: 'Décrivez ce que vous avez construit, votre rôle réel, les technologies utilisées et les résultats vérifiables disponibles.',
    targetBody: "Collez l'offre pour comparer ses exigences à vos preuves professionnelles. L'offre ne peut pas créer de compétences ou de faits candidat.",
    generalBody: "Créez un CV général fondé sur vos preuves sans Opportunity Assessment spécifique à une offre.",
    generalSelected: 'Générez une version générale du CV uniquement à partir des faits professionnels fournis.',
  },
  pt: {
    needText: 'Escreva pelo menos 10 caracteres antes de pedir uma reescrita segura.',
    unavailable: 'O serviço interno de melhoria não está disponível agora.',
    failed: 'Não foi possível melhorar este texto com segurança. Seu texto original foi preservado.',
    improved: 'Redação melhorada. Esta ação não autorizou novos fatos profissionais.',
    unchanged: 'Nenhuma mudança segura de redação foi necessária. Seu texto atual foi preservado.',
    fallback: 'A proposta não pôde ser comprovada como fiel aos fatos, então mantivemos o texto seguro da fonte.',
    summaryHint: 'A IA pode melhorar clareza e estrutura, mas não pode adicionar fatos profissionais que você não forneceu.',
    metricsHint: 'Use métricas somente quando forem verdadeiras e verificáveis.',
    optimize: 'Otimizar e melhorar',
    optimizing: 'Verificando reescrita segura...',
    experiencePlaceholder: 'Descreva o que você realmente fez, as tecnologias usadas e resultados verificáveis quando existirem.',
    projectPlaceholder: 'Descreva o que você construiu, seu papel real, as tecnologias usadas e resultados verificáveis quando existirem.',
    targetBody: 'Cole a vaga para comparar os requisitos com sua evidência profissional. A vaga não pode criar habilidades ou fatos do candidato.',
    generalBody: 'Crie um currículo geral baseado em evidências sem um Opportunity Assessment específico para uma vaga.',
    generalSelected: 'Gere uma versão geral do currículo usando apenas os fatos profissionais que você forneceu.',
  },
} as const;

interface ResumeFormProps {
  onSubmit: (data: ResumeRequest) => Promise<void>;
  isLoading: boolean;
  initialData?: ResumeRequest;
}

type OptimizationNotice = {
  readonly fieldPath: string;
  readonly tone: 'success' | 'neutral';
  readonly message: string;
};

type OptimizationResponse = {
  readonly output?: string;
  readonly mode?: 'FACT_PRESERVING_AI' | 'PRESENTATION_ONLY_FALLBACK';
  readonly changed?: boolean;
};

export default function ResumeForm({ onSubmit, isLoading, initialData }: Readonly<ResumeFormProps>) {
  const { t, language } = useLanguage();
  const optimizerCopy = OPTIMIZER_COPY[language];
  const [currentSection, setCurrentSection] = useState(0);

  const sections = useMemo(() => [
    t.sections.personal,
    t.sections.summary,
    t.sections.experience,
    t.sections.education,
    t.sections.skills,
    t.sections.projects,
    t.sections.certifications,
    t.sections.languages,
    t.sections.jobDesc
  ], [t]);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    trigger,
    setValue,
    watch,
  } = useForm<ResumeRequest>({
    resolver: zodResolver(resumeRequestSchema),
    defaultValues: initialData || {
      personalInfo: {
        fullName: '',
        location: '',
        email: '',
        linkedin: '',
        github: '',
      },
      summary: '',
      experience: [{
        company: '',
        role: '',
        startDate: '',
        endDate: '',
        description: '',
        technologies: [],
      }],
      education: [{
        institution: '',
        degree: '',
        startDate: '',
        endDate: '',
      }],
      skills: {
        hardSkills: [],
        softSkills: [],
      },
      projects: [],
      certifications: [],
      languages: [],
      jobDescription: '',
    },
  });

  const {
    fields: experienceFields,
    append: appendExperience,
    remove: removeExperience,
  } = useFieldArray({
    control,
    name: 'experience',
  });

  const {
    fields: educationFields,
    append: appendEducation,
    remove: removeEducation,
  } = useFieldArray({
    control,
    name: 'education',
  });

  const {
    fields: projectFields,
    append: appendProject,
    remove: removeProject,
  } = useFieldArray({
    control,
    name: 'projects',
  });

  const {
    fields: certificationFields,
    append: appendCertification,
    remove: removeCertification,
  } = useFieldArray({
    control,
    name: 'certifications',
  });

  const {
    fields: languageFields,
    append: appendLanguage,
    remove: removeLanguage,
  } = useFieldArray({
    control,
    name: 'languages',
  });

  const [hardSkillsInput, setHardSkillsInput] = useState('');
  const [softSkillsInput, setSoftSkillsInput] = useState('');
  const [hardSkills, setHardSkills] = useState<string[]>(initialData?.skills?.hardSkills || []);
  const [softSkills, setSoftSkills] = useState<string[]>(initialData?.skills?.softSkills || []);

  /* Legacy name retained for schema/UI continuity: this means target-specific analysis. */
  const [wantsJobOptimization, setWantsJobOptimization] = useState<boolean | null>(
    initialData?.jobDescription ? true : null
  );

  const addHardSkill = () => {
    if (hardSkillsInput.trim()) {
      const newSkills = [...hardSkills, hardSkillsInput.trim()];
      setHardSkills(newSkills);
      setValue('skills.hardSkills', newSkills, { shouldValidate: true });
      setHardSkillsInput('');
    }
  };

  const addSoftSkill = () => {
    if (softSkillsInput.trim()) {
      const newSkills = [...softSkills, softSkillsInput.trim()];
      setSoftSkills(newSkills);
      setValue('skills.softSkills', newSkills, { shouldValidate: true });
      setSoftSkillsInput('');
    }
  };

  const removeHardSkill = (index: number) => {
    const newSkills = hardSkills.filter((_, i) => i !== index);
    setHardSkills(newSkills);
    setValue('skills.hardSkills', newSkills, { shouldValidate: true });
  };

  const removeSoftSkill = (index: number) => {
    const newSkills = softSkills.filter((_, i) => i !== index);
    setSoftSkills(newSkills);
    setValue('skills.softSkills', newSkills, { shouldValidate: true });
  };

  const [optimizingField, setOptimizingField] = useState<string | null>(null);
  const [optimizationNotice, setOptimizationNotice] = useState<OptimizationNotice | null>(null);
  const optimizeUrl = process.env.NEXT_PUBLIC_N8N_OPTIMIZE_URL;

  const handleOptimize = async (fieldPath: any) => {
    const currentText = watch(fieldPath);
    if (!currentText || currentText.length < 10) {
      alert(optimizerCopy.needText);
      return;
    }

    if (!optimizeUrl) {
      alert(optimizerCopy.unavailable);
      return;
    }

    setOptimizingField(fieldPath);
    setOptimizationNotice(null);
    try {
      const response = await fetch(optimizeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: currentText }),
      });

      if (!response.ok) {
        throw new Error('Safe optimization request failed.');
      }

      const result = await response.json() as OptimizationResponse;
      const optimizedText = result.output?.trim();
      if (!optimizedText) {
        throw new Error('Safe optimization returned no text.');
      }

      const changed = result.changed === true && optimizedText !== currentText;
      if (changed) {
        setValue(fieldPath, optimizedText, { shouldValidate: true, shouldDirty: true });
        setOptimizationNotice({
          fieldPath,
          tone: 'success',
          message: optimizerCopy.improved,
        });
      } else {
        setOptimizationNotice({
          fieldPath,
          tone: 'neutral',
          message: result.mode === 'PRESENTATION_ONLY_FALLBACK'
            ? optimizerCopy.fallback
            : optimizerCopy.unchanged,
        });
      }
    } catch (error) {
      console.error('Optimization error:', error);
      setOptimizationNotice({
        fieldPath,
        tone: 'neutral',
        message: optimizerCopy.failed,
      });
    } finally {
      setOptimizingField(null);
    }
  };

  const optimizationFeedback = (fieldPath: string) => {
    if (optimizationNotice?.fieldPath !== fieldPath) return null;
    const success = optimizationNotice.tone === 'success';
    return (
      <div
        className={`mt-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-5 ${
          success
            ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
            : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}
        role="status"
      >
        {success
          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>{optimizationNotice.message}</span>
      </div>
    );
  };

  // Handle batch certificate upload
  const handleBatchCertificates = useCallback((certificates: Array<{
    degree: string;
    institution: string;
    graduationDate: string;
    gpa?: string;
    honors?: string;
  }>) => {
    if (educationFields.length === 1 && !educationFields[0].institution) {
      removeEducation(0);
    }

    certificates.forEach(cert => {
      const yearMatch = YEAR_REGEX.exec(cert.graduationDate);
      const year = yearMatch?.[0];

      appendEducation({
        institution: cert.institution,
        degree: cert.degree,
        startDate: '',
        endDate: year || cert.graduationDate,
      });
    });
  }, [educationFields, removeEducation, appendEducation]);

  const nextSection = async () => {
    const fieldsToValidate = getSectionFields(currentSection);
    const isValid = await trigger(fieldsToValidate as any);

    if (isValid && currentSection < sections.length - 1) {
      setCurrentSection(currentSection + 1);
      setOptimizationNotice(null);
    }
  };

  const prevSection = () => {
    if (currentSection > 0) {
      setCurrentSection(currentSection - 1);
      setOptimizationNotice(null);
    }
  };

  const getSectionFields = (section: number) => {
    switch (section) {
      case 0: return ['personalInfo'];
      case 1: return ['summary'];
      case 2: return ['experience'];
      case 3: return ['education'];
      case 4: return ['skills'];
      case 5: return ['projects'];
      case 6: return ['certifications'];
      case 7: return ['languages'];
      case 8: return ['jobDescription'];
      default: return [];
    }
  };

  const onFormSubmit = handleSubmit((data) => {
    data.skills.hardSkills = hardSkills;
    data.skills.softSkills = softSkills;
    onSubmit(data);
  });

  const handleVoiceInput = useCallback((field: any, text: string) => {
    const current = watch(field) || '';
    const newText = current + (current && !current.endsWith(' ') ? ' ' : '') + text;
    setValue(field, newText, {
      shouldValidate: true,
      shouldDirty: true
    });
  }, [setValue, watch]);

  const handleCertificateData = useCallback((data: {
    degree: string;
    institution: string;
    graduationDate: string;
    gpa?: string;
    honors?: string;
  }, index: number) => {
    setValue(`education.${index}.institution`, data.institution, { shouldValidate: true });
    setValue(`education.${index}.degree`, data.degree, { shouldValidate: true });

    const yearMatch = YEAR_REGEX.exec(data.graduationDate);
    const year = yearMatch?.[0];
    if (year) {
      setValue(`education.${index}.endDate`, year, { shouldValidate: true });
      setValue(`education.${index}.startDate`, '', { shouldValidate: true });
    } else {
      setValue(`education.${index}.endDate`, data.graduationDate, { shouldValidate: true });
      setValue(`education.${index}.startDate`, '', { shouldValidate: true });
    }
  }, [setValue]);

  return (
    <form onSubmit={onFormSubmit} className="mx-auto max-w-4xl">
      {/* Progress Bar */}
      <div className="mb-8 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-sm backdrop-blur-lg">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">Career evidence</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">{sections[currentSection]}</h2>
          </div>
          <span className="text-xs font-semibold text-slate-500">{t.form.step} {currentSection + 1} {t.form.of} {sections.length}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-1.5 rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-violet-600 transition-all duration-500 ease-out"
            style={{ width: `${((currentSection + 1) / sections.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Section 0: Personal Information */}
      {currentSection === 0 && (
        <div className="card space-y-4">
          <h2 className="mb-4 text-2xl font-bold text-slate-800">{t.form.personalInfo}</h2>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t.fields.fullName} *
            </label>
            <input
              {...register('personalInfo.fullName')}
              className="input-field"
              placeholder="John Doe"
            />
            {errors.personalInfo?.fullName && (
              <p className="mt-1 text-sm text-red-500">{errors.personalInfo.fullName.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t.fields.location} *
            </label>
            <input
              {...register('personalInfo.location')}
              className="input-field"
              placeholder="Boston, MA"
            />
            {errors.personalInfo?.location && (
              <p className="mt-1 text-sm text-red-500">{errors.personalInfo.location.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t.fields.email} *
            </label>
            <input
              {...register('personalInfo.email')}
              type="email"
              className="input-field"
              placeholder="john.doe@example.com"
            />
            {errors.personalInfo?.email && (
              <p className="mt-1 text-sm text-red-500">{errors.personalInfo.email.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t.fields.linkedin}
            </label>
            <input
              {...register('personalInfo.linkedin')}
              type="url"
              className="input-field"
              placeholder="https://linkedin.com/in/johndoe"
            />
            {errors.personalInfo?.linkedin && (
              <p className="mt-1 text-sm text-red-500">{errors.personalInfo.linkedin.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              GitHub URL
            </label>
            <input
              {...register('personalInfo.github')}
              type="url"
              className="input-field"
              placeholder="https://github.com/johndoe"
            />
            {errors.personalInfo?.github && (
              <p className="mt-1 text-sm text-red-500">{errors.personalInfo.github.message}</p>
            )}
          </div>
        </div>
      )}

      {/* Section 1: Professional Summary */}
      {currentSection === 1 && (
        <div className="card space-y-4">
          <h2 className="mb-4 text-2xl font-bold text-slate-800">{t.form.summary}</h2>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t.sections.summary} *
            </label>
            <div className="relative">
              <textarea
                {...register('summary')}
                rows={5}
                className="input-field pb-10"
                placeholder={t.fields.summaryPlaceholder}
              />
              <div className="absolute bottom-2 right-2">
                <VoiceInput onTranscript={(text) => handleVoiceInput('summary', text)} />
              </div>
            </div>
            {errors.summary && (
              <p className="mt-1 text-sm text-red-500">{errors.summary.message}</p>
            )}
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-xs leading-5 text-slate-500">
                {optimizerCopy.summaryHint}
              </p>
              <button
                type="button"
                onClick={() => handleOptimize('summary')}
                disabled={optimizingField === 'summary'}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-800 transition hover:-translate-y-0.5 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {optimizingField === 'summary' ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-blue-700"></div>
                    {optimizerCopy.optimizing}
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    {optimizerCopy.optimize}
                  </>
                )}
              </button>
            </div>
            {optimizationFeedback('summary')}
          </div>
        </div>
      )}

      {/* Section 2: Work Experience */}
      {currentSection === 2 && (
        <div className="card space-y-6">
          <h2 className="mb-4 text-2xl font-bold text-slate-800">{t.form.experience}</h2>

          {experienceFields.map((field, index) => (
            <div key={field.id} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/45 p-4">
              {experienceFields.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeExperience(index)}
                  className="float-right text-sm font-medium text-red-500 hover:text-red-700"
                >
                  {t.form.remove}
                </button>
              )}

              <h3 className="text-lg font-bold">{t.sections.experience} #{index + 1}</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t.fields.company} *
                  </label>
                  <input
                    {...register(`experience.${index}.company`)}
                    className="input-field"
                    placeholder="Google Inc."
                  />
                  {errors.experience?.[index]?.company && (
                    <p className="mt-1 text-sm text-red-500">{errors.experience[index]?.company?.message}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t.fields.role} *
                  </label>
                  <input
                    {...register(`experience.${index}.role`)}
                    className="input-field"
                    placeholder="Software Engineer"
                  />
                  {errors.experience?.[index]?.role && (
                    <p className="mt-1 text-sm text-red-500">{errors.experience[index]?.role?.message}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t.fields.startDate} *
                  </label>
                  <input
                    {...register(`experience.${index}.startDate`)}
                    className="input-field"
                    placeholder="Jan 2022"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t.fields.endDate} *
                  </label>
                  <input
                    {...register(`experience.${index}.endDate`)}
                    className="input-field"
                    placeholder="Present"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t.fields.description} *
                </label>
                <div className="relative">
                  <textarea
                    {...register(`experience.${index}.description`)}
                    rows={5}
                    className="input-field pb-10"
                    placeholder={optimizerCopy.experiencePlaceholder}
                  />
                  <div className="absolute bottom-2 right-2">
                    <VoiceInput onTranscript={(text) => handleVoiceInput(`experience.${index}.description`, text)} />
                  </div>
                </div>
                {errors.experience?.[index]?.description && (
                  <p className="mt-1 text-sm text-red-500">{errors.experience[index]?.description?.message}</p>
                )}
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {optimizerCopy.metricsHint}
                </p>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleOptimize(`experience.${index}.description`)}
                    disabled={optimizingField === `experience.${index}.description`}
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-800 transition hover:-translate-y-0.5 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {optimizingField === `experience.${index}.description` ? (
                      <>
                        <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-blue-700"></div>
                        {optimizerCopy.optimizing}
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" />
                        {optimizerCopy.optimize}
                      </>
                    )}
                  </button>
                </div>
                {optimizationFeedback(`experience.${index}.description`)}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => appendExperience({
              company: '',
              role: '',
              startDate: '',
              endDate: '',
              description: '',
              technologies: [],
            })}
            className="btn-secondary w-full"
          >
            {t.form.addExperience}
          </button>
        </div>
      )}

      {/* Section 3: Education */}
      {currentSection === 3 && (
        <div className="card space-y-6">
          <h2 className="mb-4 text-2xl font-bold text-slate-800">{t.form.education}</h2>

          <div className="mb-6 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
            <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-blue-900">
              <Upload className="h-5 w-5" />
              Quick Start: Upload certificates
            </h3>
            <p className="mb-4 text-sm leading-6 text-blue-700">
              Select certificate images to extract draft education fields, then review them before continuing.
            </p>
            <CertificateUpload
              onDataExtracted={() => { }}
              onBatchDataExtracted={handleBatchCertificates}
              allowMultiple={true}
              index={-1}
            />
          </div>

          {educationFields.map((field, index) => (
            <div key={field.id} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/45 p-4">
              {educationFields.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeEducation(index)}
                  className="float-right text-sm font-medium text-red-500 hover:text-red-700"
                >
                  {t.form.remove}
                </button>
              )}

              <h3 className="text-lg font-bold">{t.sections.education} #{index + 1}</h3>

              {(!watch(`education.${index}.institution`) && !watch(`education.${index}.degree`)) && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 transition-all duration-300">
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-900">
                    <FileText className="h-4 w-4" />
                    Quick Fill: Upload Certificate #{index + 1}
                  </h4>
                  <p className="mb-3 text-xs leading-5 text-blue-700">
                    Extract draft fields from a diploma or certificate, then verify the result yourself.
                  </p>
                  <CertificateUpload onDataExtracted={(data) => handleCertificateData(data, index)} index={index} />
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t.fields.institution} *
                </label>
                <input
                  {...register(`education.${index}.institution`)}
                  className="input-field"
                  placeholder="Harvard University"
                />
                {errors.education?.[index]?.institution && (
                  <p className="mt-1 text-sm text-red-500">{errors.education[index]?.institution?.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t.fields.degree} *
                </label>
                <input
                  {...register(`education.${index}.degree`)}
                  className="input-field"
                  placeholder="Bachelor of Science in Computer Science"
                />
                {errors.education?.[index]?.degree && (
                  <p className="mt-1 text-sm text-red-500">{errors.education[index]?.degree?.message}</p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t.fields.startDate} *
                  </label>
                  <input
                    {...register(`education.${index}.startDate`)}
                    className="input-field"
                    placeholder="2018"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t.fields.endDate} *
                  </label>
                  <input
                    {...register(`education.${index}.endDate`)}
                    className="input-field"
                    placeholder="2022"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => appendEducation({
              institution: '',
              degree: '',
              startDate: '',
              endDate: '',
            })}
            className="btn-secondary w-full"
          >
            {t.form.addEducation}
          </button>
        </div>
      )}

      {/* Section 4: Skills */}
      {currentSection === 4 && (
        <div className="card space-y-6">
          <h2 className="mb-4 text-2xl font-bold text-slate-800">{t.form.skills}</h2>

          <label className="mb-2 block text-sm font-medium text-slate-700">
            {t.fields.hardSkills} *
          </label>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={hardSkillsInput}
              onChange={(e) => setHardSkillsInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (hardSkillsInput.includes(',')) {
                    const newSkills = hardSkillsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    const updatedSkills = [...hardSkills, ...newSkills];
                    setHardSkills(updatedSkills);
                    setValue('skills.hardSkills', updatedSkills, { shouldValidate: true });
                    setHardSkillsInput('');
                  } else {
                    addHardSkill();
                  }
                }
              }}
              className="input-field flex-1"
              placeholder="React, Python, AWS (comma separated enabled)"
            />
            <button
              type="button"
              onClick={() => {
                if (hardSkillsInput.includes(',')) {
                  const newSkills = hardSkillsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                  const updatedSkills = [...hardSkills, ...newSkills];
                  setHardSkills(updatedSkills);
                  setValue('skills.hardSkills', updatedSkills, { shouldValidate: true });
                  setHardSkillsInput('');
                } else {
                  addHardSkill();
                }
              }}
              className="btn-primary"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {hardSkills.map((skill, index) => (
              <span
                key={index}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1 text-sm text-slate-800"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => removeHardSkill(index)}
                  className="font-bold text-slate-500 hover:text-slate-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {hardSkills.length === 0 && (
            <p className="mt-1 text-sm text-red-500">At least one hard skill is required</p>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              {t.fields.softSkills}
            </label>
            <div className="mb-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={softSkillsInput}
                onChange={(e) => setSoftSkillsInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (softSkillsInput.includes(',')) {
                      const newSkills = softSkillsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                      const updatedSkills = [...softSkills, ...newSkills];
                      setSoftSkills(updatedSkills);
                      setValue('skills.softSkills', updatedSkills, { shouldValidate: true });
                      setSoftSkillsInput('');
                    } else {
                      addSoftSkill();
                    }
                  }
                }}
                className="input-field flex-1"
                placeholder="Leadership, Communication (comma separated enabled)"
              />
              <button
                type="button"
                onClick={() => {
                  if (softSkillsInput.includes(',')) {
                    const newSkills = softSkillsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    const updatedSkills = [...softSkills, ...newSkills];
                    setSoftSkills(updatedSkills);
                    setValue('skills.softSkills', updatedSkills, { shouldValidate: true });
                    setSoftSkillsInput('');
                  } else {
                    addSoftSkill();
                  }
                }}
                className="btn-primary"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {softSkills.map((skill, index) => (
                <span
                  key={index}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1 text-sm text-slate-800"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSoftSkill(index)}
                    className="font-bold text-slate-500 hover:text-slate-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Section 5: Projects */}
      {currentSection === 5 && (
        <div className="card space-y-6">
          <h2 className="mb-4 text-2xl font-bold text-slate-800">{t.sections.projects}</h2>

          {projectFields.map((field, index) => (
            <div key={field.id} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/45 p-4">
              <button
                type="button"
                onClick={() => removeProject(index)}
                className="float-right text-sm font-medium text-red-500 hover:text-red-700"
              >
                {t.form.remove}
              </button>

              <h3 className="text-lg font-bold">{t.sections.projects} #{index + 1}</h3>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t.fields.projectName} *
                </label>
                <input
                  {...register(`projects.${index}.name`)}
                  className="input-field"
                  placeholder="Portfolio Website"
                />
                {errors.projects?.[index]?.name && (
                  <p className="mt-1 text-sm text-red-500">{errors.projects[index]?.name?.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t.fields.projectLink}
                </label>
                <input
                  {...register(`projects.${index}.link`)}
                  className="input-field"
                  placeholder="https://github.com/username/project"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t.fields.description} *
                </label>
                <div className="relative">
                  <textarea
                    {...register(`projects.${index}.description`)}
                    rows={4}
                    className="input-field pb-10"
                    placeholder={optimizerCopy.projectPlaceholder}
                  />
                  <div className="absolute bottom-2 right-2">
                    <VoiceInput onTranscript={(text) => handleVoiceInput(`projects.${index}.description`, text)} />
                  </div>
                </div>
                {errors.projects?.[index]?.description && (
                  <p className="mt-1 text-sm text-red-500">{errors.projects[index]?.description?.message}</p>
                )}
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleOptimize(`projects.${index}.description`)}
                    disabled={optimizingField === `projects.${index}.description`}
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-800 transition hover:-translate-y-0.5 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {optimizingField === `projects.${index}.description` ? (
                      <>
                        <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-blue-700"></div>
                        {optimizerCopy.optimizing}
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" />
                        {optimizerCopy.optimize}
                      </>
                    )}
                  </button>
                </div>
                {optimizationFeedback(`projects.${index}.description`)}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t.fields.hardSkills}
                </label>
                <input
                  placeholder="React, TypeScript, Tailwind (comma separated)"
                  className="input-field"
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val) setValue(`projects.${index}.technologies`, val.split(',').map(s => s.trim()));
                  }}
                />
                <p className="mt-1 text-xs text-slate-500">Separate technologies with commas</p>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => appendProject({ name: '', description: '', technologies: [], link: '' })}
            className="btn-secondary w-full"
          >
            {t.form.addProject}
          </button>
        </div>
      )}

      {/* Section 6: Certifications */}
      {currentSection === 6 && (
        <div className="card space-y-6">
          <h2 className="mb-4 text-2xl font-bold text-slate-800">{t.sections.certifications}</h2>

          {certificationFields.map((field, index) => (
            <div key={field.id} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/45 p-4">
              <button
                type="button"
                onClick={() => removeCertification(index)}
                className="float-right text-sm font-medium text-red-500 hover:text-red-700"
              >
                {t.form.remove}
              </button>

              <h3 className="text-lg font-bold">{t.sections.certifications} #{index + 1}</h3>

              <div>
                <label
                  htmlFor={`cert-name-${index}`}
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Name *
                </label>
                <input
                  {...register(`certifications.${index}.name`)}
                  id={`cert-name-${index}`}
                  className="input-field"
                  placeholder="AWS Certified Solutions Architect"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t.fields.issuer} *
                </label>
                <input
                  {...register(`certifications.${index}.issuer`)}
                  className="input-field"
                  placeholder="Amazon Web Services"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t.fields.credentialDate} *
                </label>
                <input
                  {...register(`certifications.${index}.date`)}
                  className="input-field"
                  placeholder="2024"
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => appendCertification({ name: '', issuer: '', date: '' })}
            className="btn-secondary w-full"
          >
            {t.form.addCertification}
          </button>
        </div>
      )}

      {/* Section 7: Languages */}
      {currentSection === 7 && (
        <div className="card space-y-6">
          <h2 className="mb-4 text-2xl font-bold text-slate-800">{t.sections.languages}</h2>

          {languageFields.map((field, index) => (
            <div key={field.id} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/45 p-4">
              <button
                type="button"
                onClick={() => removeLanguage(index)}
                className="float-right text-sm font-medium text-red-500 hover:text-red-700"
              >
                {t.form.remove}
              </button>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t.fields.language} *
                  </label>
                  <input
                    {...register(`languages.${index}.language`)}
                    className="input-field"
                    placeholder="English"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t.fields.proficiency} *
                  </label>
                  <select
                    {...register(`languages.${index}.proficiency`)}
                    className="input-field"
                  >
                    <option value="">Select...</option>
                    <option value="Native">Native</option>
                    <option value="Fluent">Fluent</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Basic">Basic</option>
                  </select>
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => appendLanguage({ language: '', proficiency: '' })}
            className="btn-secondary w-full"
          >
            {t.form.addLanguage}
          </button>
        </div>
      )}

      {/* Section 8: Job Description */}
      {currentSection === 8 && (
        <div className="card space-y-6">
          <h2 className="mb-4 text-2xl font-bold text-slate-800">{t.form.jobDesc}</h2>

          {wantsJobOptimization === null ? (
            <div className="space-y-6 py-8 text-center">
              <div className="mb-6">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <FileText className="h-8 w-8" />
                </div>
                <h3 className="mb-2 text-xl font-bold text-slate-900">{t.jobDetails.title}</h3>
                <p className="mx-auto max-w-md text-slate-500">
                  {t.jobDetails.question}
                </p>
              </div>

              <div className="mx-auto grid max-w-xl gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setWantsJobOptimization(true)}
                  className="group rounded-2xl border-2 border-blue-100 p-6 text-left transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50"
                >
                  <span className="mb-1 block font-bold text-blue-700">
                    {t.jobDetails.yes}
                  </span>
                  <span className="text-sm leading-6 text-slate-500">
                    {optimizerCopy.targetBody}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setWantsJobOptimization(false);
                    setValue('jobDescription', '');
                  }}
                  className="group rounded-2xl border-2 border-slate-100 p-6 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
                >
                  <span className="mb-1 block font-bold text-slate-900">
                    {t.jobDetails.no}
                  </span>
                  <span className="text-sm leading-6 text-slate-500">
                    {optimizerCopy.generalBody}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div>
              {wantsJobOptimization && (
                <>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <label className="block text-sm font-medium text-slate-700">
                      {t.jobDetails.pasteLabel}
                    </label>
                    <button
                      type="button"
                      onClick={() => setWantsJobOptimization(null)}
                      className="text-sm font-semibold text-blue-600 hover:underline"
                    >
                      Change Selection
                    </button>
                  </div>

                  <div className="relative">
                    <textarea
                      {...register('jobDescription')}
                      rows={12}
                      className="input-field pb-10"
                      placeholder={t.fields.jobDescPlaceholder}
                      autoFocus
                    />
                    <div className="absolute bottom-2 right-2">
                      <VoiceInput onTranscript={(text) => handleVoiceInput('jobDescription', text)} />
                    </div>
                  </div>
                </>
              )}

              {!wantsJobOptimization && (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 text-center">
                  <div className="mx-auto max-w-md space-y-4">
                    <p className="font-medium text-slate-600">
                      You selected a <span className="font-bold text-slate-900">General Resume</span>.
                    </p>
                    <p className="text-sm leading-6 text-slate-500">
                      {optimizerCopy.generalSelected}
                    </p>
                    <button
                      type="button"
                      onClick={() => setWantsJobOptimization(null)}
                      className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:underline"
                    >
                      Change Selection
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex justify-between gap-4">
        {currentSection > 0 && (
          <button
            type="button"
            onClick={prevSection}
            disabled={isLoading}
            className="btn-secondary disabled:opacity-50"
          >
            {t.form.prev}
          </button>
        )}

        {currentSection < sections.length - 1 ? (
          <button
            type="button"
            onClick={nextSection}
            disabled={isLoading}
            className="btn-primary ml-auto disabled:opacity-50"
          >
            {t.form.next}
          </button>
        ) : (
          <button
            type="submit"
            disabled={isLoading || hardSkills.length === 0 || (currentSection === 8 && wantsJobOptimization === null)}
            className="btn-primary ml-auto px-8 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {t.form.generating}
              </span>
            ) : t.form.generate}
          </button>
        )}
      </div>
    </form>
  );
}
