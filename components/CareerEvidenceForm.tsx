'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, ShieldCheck, Trash2, Wand2 } from 'lucide-react';
import type { ResumeRequest } from '@/lib/schemas';
import { evaluateGenerationReadiness } from '@/lib/application/product/GenerationReadiness';
import { useLanguage } from '@/components/LanguageProvider';
import CertificateUpload from '@/components/CertificateUpload';
import VoiceInput from '@/components/VoiceInput';

type EvidenceSection =
  | 'PERSONAL'
  | 'SUMMARY'
  | 'EXPERIENCE'
  | 'EDUCATION'
  | 'SKILLS'
  | 'PROJECTS'
  | 'CERTIFICATIONS'
  | 'LANGUAGES';

interface CareerEvidenceFormProps {
  readonly initialData?: ResumeRequest;
  readonly onComplete: (data: ResumeRequest) => void;
  readonly onCancel?: () => void;
}

const SECTIONS: readonly EvidenceSection[] = [
  'PERSONAL', 'SUMMARY', 'EXPERIENCE', 'EDUCATION', 'SKILLS', 'PROJECTS', 'CERTIFICATIONS', 'LANGUAGES',
];

const COPY = {
  en: {
    eyebrow: 'Career evidence',
    title: 'Build only what you can defend',
    body: 'This editor stores candidate evidence only. Job targeting happens after this step and cannot create candidate facts.',
    next: 'Next', previous: 'Previous', target: 'Continue to target', cancel: 'Cancel',
    readiness: 'Review these fields before continuing', optional: 'Optional', add: 'Add', remove: 'Remove',
    optimize: 'Improve wording safely', optimizing: 'Improving…', optimizeError: 'This wording could not be optimized safely.',
    personal: 'Personal information', summary: 'Professional summary', experience: 'Work experience', education: 'Education',
    skills: 'Skills', projects: 'Projects', certifications: 'Certifications', languages: 'Languages',
    sourceRule: 'If something is not true or not yours, leave it out. Missing evidence is safer than invented evidence.',
  },
  es: {
    eyebrow: 'Evidencia profesional',
    title: 'Construye sólo lo que puedes defender',
    body: 'Este editor guarda únicamente evidencia del candidato. El target de la vacante ocurre después y no puede crear hechos profesionales.',
    next: 'Siguiente', previous: 'Anterior', target: 'Continuar al target', cancel: 'Cancelar',
    readiness: 'Revisa estos campos antes de continuar', optional: 'Opcional', add: 'Agregar', remove: 'Eliminar',
    optimize: 'Mejorar redacción de forma segura', optimizing: 'Mejorando…', optimizeError: 'Esta redacción no pudo optimizarse de forma segura.',
    personal: 'Información personal', summary: 'Resumen profesional', experience: 'Experiencia laboral', education: 'Educación',
    skills: 'Habilidades', projects: 'Proyectos', certifications: 'Certificaciones', languages: 'Idiomas',
    sourceRule: 'Si algo no es verdadero o no te pertenece, déjalo fuera. Es mejor que falte evidencia a inventarla.',
  },
  fr: {
    eyebrow: 'Preuves de carrière', title: 'Construisez uniquement ce que vous pouvez défendre',
    body: "Cet éditeur ne contient que les preuves du candidat. Le ciblage du poste vient ensuite et ne peut pas créer de faits professionnels.",
    next: 'Suivant', previous: 'Précédent', target: 'Continuer vers la cible', cancel: 'Annuler',
    readiness: 'Vérifiez ces champs avant de continuer', optional: 'Optionnel', add: 'Ajouter', remove: 'Supprimer',
    optimize: 'Améliorer la formulation en sécurité', optimizing: 'Amélioration…', optimizeError: "Cette formulation n'a pas pu être optimisée en sécurité.",
    personal: 'Informations personnelles', summary: 'Résumé professionnel', experience: 'Expérience', education: 'Formation',
    skills: 'Compétences', projects: 'Projets', certifications: 'Certifications', languages: 'Langues',
    sourceRule: "Si une information n'est pas vraie ou ne vous appartient pas, laissez-la de côté.",
  },
  pt: {
    eyebrow: 'Evidência profissional', title: 'Construa apenas o que você pode defender',
    body: 'Este editor guarda somente evidência do candidato. O alvo da vaga vem depois e não pode criar fatos profissionais.',
    next: 'Próximo', previous: 'Anterior', target: 'Continuar para o alvo', cancel: 'Cancelar',
    readiness: 'Revise estes campos antes de continuar', optional: 'Opcional', add: 'Adicionar', remove: 'Remover',
    optimize: 'Melhorar texto com segurança', optimizing: 'Melhorando…', optimizeError: 'Este texto não pôde ser otimizado com segurança.',
    personal: 'Informações pessoais', summary: 'Resumo profissional', experience: 'Experiência profissional', education: 'Educação',
    skills: 'Habilidades', projects: 'Projetos', certifications: 'Certificações', languages: 'Idiomas',
    sourceRule: 'Se algo não for verdadeiro ou não for seu, deixe de fora. Evidência ausente é melhor que evidência inventada.',
  },
} as const;

function blankData(): ResumeRequest {
  return {
    personalInfo: { fullName: '', location: '', email: '', linkedin: '', github: '' },
    summary: '',
    experience: [],
    education: [],
    skills: { hardSkills: [], softSkills: [] },
    projects: [],
    certifications: [],
    languages: [],
    jobDescription: '',
  };
}

function cloneData(value?: ResumeRequest): ResumeRequest {
  return value ? JSON.parse(JSON.stringify(value)) as ResumeRequest : blankData();
}

function listText(values: readonly string[]): string {
  return values.join(', ');
}

function parseList(value: string): string[] {
  return Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)));
}

export default function CareerEvidenceForm({ initialData, onComplete, onCancel }: Readonly<CareerEvidenceFormProps>) {
  const { language, t } = useLanguage();
  const copy = COPY[language];
  const [data, setData] = useState<ResumeRequest>(() => cloneData(initialData));
  const [sectionIndex, setSectionIndex] = useState(0);
  const [issuesVisible, setIssuesVisible] = useState(false);
  const [optimizingKey, setOptimizingKey] = useState<string | null>(null);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);
  const readiness = useMemo(() => evaluateGenerationReadiness(data), [data]);
  const section = SECTIONS[sectionIndex];

  const setPersonal = (key: keyof ResumeRequest['personalInfo'], value: string) => {
    setData((current) => ({ ...current, personalInfo: { ...current.personalInfo, [key]: value } }));
  };

  const optimize = async (key: string, source: string, apply: (value: string) => void) => {
    if (source.trim().length < 10 || optimizingKey) return;
    setOptimizingKey(key);
    setOptimizationError(null);
    try {
      const response = await fetch('/api/optimize-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: source }),
      });
      const result = await response.json() as { output?: string; error?: string };
      if (!response.ok || !result.output) {
        setOptimizationError(result.error || copy.optimizeError);
        return;
      }
      apply(result.output);
    } catch {
      setOptimizationError(copy.optimizeError);
    } finally {
      setOptimizingKey(null);
    }
  };

  const complete = () => {
    if (!readiness.ready) {
      setIssuesVisible(true);
      return;
    }
    setIssuesVisible(false);
    onComplete({ ...data, jobDescription: data.jobDescription ?? '' });
  };

  const labels: Record<EvidenceSection, string> = {
    PERSONAL: copy.personal, SUMMARY: copy.summary, EXPERIENCE: copy.experience, EDUCATION: copy.education,
    SKILLS: copy.skills, PROJECTS: copy.projects, CERTIFICATIONS: copy.certifications, LANGUAGES: copy.languages,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">{copy.eyebrow}</p>
        <h2 className="mt-2 font-serif text-3xl font-bold text-gray-950">{copy.title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-500">{copy.body}</p>
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
          <p className="text-xs leading-5 text-emerald-900">{copy.sourceRule}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-7">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
                {sectionIndex + 1} / {SECTIONS.length}
              </p>
              <h3 className="mt-1 text-xl font-bold text-gray-950">{labels[section]}</h3>
            </div>
            <div className="text-xs text-gray-400">{Math.round(((sectionIndex + 1) / SECTIONS.length) * 100)}%</div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${((sectionIndex + 1) / SECTIONS.length) * 100}%` }} />
          </div>
        </div>

        {section === 'PERSONAL' && (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-gray-700">{t.fields.fullName} *
              <input value={data.personalInfo.fullName} onChange={(event) => setPersonal('fullName', event.target.value)} className="input-field mt-1" autoComplete="name" />
            </label>
            <label className="text-sm font-semibold text-gray-700">{t.fields.email} *
              <input value={data.personalInfo.email} onChange={(event) => setPersonal('email', event.target.value)} className="input-field mt-1" type="email" autoComplete="email" />
            </label>
            <label className="text-sm font-semibold text-gray-700">{t.fields.location} *
              <input value={data.personalInfo.location} onChange={(event) => setPersonal('location', event.target.value)} className="input-field mt-1" autoComplete="address-level2" />
            </label>
            <label className="text-sm font-semibold text-gray-700">{t.fields.linkedin} <span className="font-normal text-gray-400">({copy.optional})</span>
              <input value={data.personalInfo.linkedin ?? ''} onChange={(event) => setPersonal('linkedin', event.target.value)} className="input-field mt-1" inputMode="url" />
            </label>
            <label className="text-sm font-semibold text-gray-700 md:col-span-2">{t.fields.github} <span className="font-normal text-gray-400">({copy.optional})</span>
              <input value={data.personalInfo.github ?? ''} onChange={(event) => setPersonal('github', event.target.value)} className="input-field mt-1" inputMode="url" />
            </label>
          </div>
        )}

        {section === 'SUMMARY' && (
          <div>
            <div className="relative">
              <textarea value={data.summary} onChange={(event) => setData((current) => ({ ...current, summary: event.target.value }))} rows={7} className="input-field pb-12" placeholder={t.fields.summaryPlaceholder} />
              <div className="absolute bottom-3 right-3"><VoiceInput onTranscript={(text) => setData((current) => ({ ...current, summary: `${current.summary} ${text}`.trim() }))} /></div>
            </div>
            <button type="button" onClick={() => void optimize('summary', data.summary, (value) => setData((current) => ({ ...current, summary: value })))} disabled={data.summary.trim().length < 10 || optimizingKey !== null} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 disabled:opacity-40">
              <Wand2 className="h-4 w-4" /> {optimizingKey === 'summary' ? copy.optimizing : copy.optimize}
            </button>
          </div>
        )}

        {section === 'EXPERIENCE' && (
          <div className="space-y-4">
            {data.experience.map((item, index) => (
              <div key={`experience-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="mb-4 flex items-center justify-between"><strong>{copy.experience} #{index + 1}</strong>
                  <button type="button" onClick={() => setData((current) => ({ ...current, experience: current.experience.filter((_, i) => i !== index) }))} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600" aria-label={`${copy.remove} ${copy.experience} ${index + 1}`}><Trash2 className="h-4 w-4" /> {copy.remove}</button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <input value={item.company} onChange={(event) => setData((current) => ({ ...current, experience: current.experience.map((entry, i) => i === index ? { ...entry, company: event.target.value } : entry) }))} className="input-field" placeholder={t.fields.company} />
                  <input value={item.role} onChange={(event) => setData((current) => ({ ...current, experience: current.experience.map((entry, i) => i === index ? { ...entry, role: event.target.value } : entry) }))} className="input-field" placeholder={t.fields.role} />
                  <input value={item.startDate} onChange={(event) => setData((current) => ({ ...current, experience: current.experience.map((entry, i) => i === index ? { ...entry, startDate: event.target.value } : entry) }))} className="input-field" placeholder={t.fields.startDate} />
                  <input value={item.endDate} onChange={(event) => setData((current) => ({ ...current, experience: current.experience.map((entry, i) => i === index ? { ...entry, endDate: event.target.value } : entry) }))} className="input-field" placeholder={t.fields.endDate} />
                </div>
                <textarea value={item.description} onChange={(event) => setData((current) => ({ ...current, experience: current.experience.map((entry, i) => i === index ? { ...entry, description: event.target.value } : entry) }))} rows={5} className="input-field mt-3" placeholder={t.fields.description} />
                <input value={listText(item.technologies)} onChange={(event) => setData((current) => ({ ...current, experience: current.experience.map((entry, i) => i === index ? { ...entry, technologies: parseList(event.target.value) } : entry) }))} className="input-field mt-3" placeholder="TypeScript, Node.js, PostgreSQL" />
              </div>
            ))}
            <button type="button" onClick={() => setData((current) => ({ ...current, experience: [...current.experience, { company: '', role: '', startDate: '', endDate: '', description: '', technologies: [] }] }))} className="btn-secondary w-full"><Plus className="mr-2 inline h-4 w-4" />{copy.add} {copy.experience}</button>
          </div>
        )}

        {section === 'EDUCATION' && (
          <div className="space-y-4">
            <CertificateUpload
              allowMultiple
              index={-20}
              onDataExtracted={() => undefined}
              onBatchDataExtracted={(items) => {
                const sourceBacked = items.filter((item) => item.institution || item.degree || item.graduationDate);
                if (sourceBacked.length === 0) return;
                setData((current) => ({ ...current, education: [...current.education, ...sourceBacked.map((item) => ({ institution: item.institution, degree: item.degree, startDate: '', endDate: item.graduationDate }))] }));
              }}
            />
            {data.education.map((item, index) => (
              <div key={`education-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="mb-4 flex items-center justify-between"><strong>{copy.education} #{index + 1}</strong>
                  <button type="button" onClick={() => setData((current) => ({ ...current, education: current.education.filter((_, i) => i !== index) }))} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600" aria-label={`${copy.remove} ${copy.education} ${index + 1}`}><Trash2 className="h-4 w-4" /> {copy.remove}</button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <input value={item.institution} onChange={(event) => setData((current) => ({ ...current, education: current.education.map((entry, i) => i === index ? { ...entry, institution: event.target.value } : entry) }))} className="input-field" placeholder={t.fields.institution} />
                  <input value={item.degree} onChange={(event) => setData((current) => ({ ...current, education: current.education.map((entry, i) => i === index ? { ...entry, degree: event.target.value } : entry) }))} className="input-field" placeholder={t.fields.degree} />
                  <input value={item.startDate} onChange={(event) => setData((current) => ({ ...current, education: current.education.map((entry, i) => i === index ? { ...entry, startDate: event.target.value } : entry) }))} className="input-field" placeholder={t.fields.startDate} />
                  <input value={item.endDate} onChange={(event) => setData((current) => ({ ...current, education: current.education.map((entry, i) => i === index ? { ...entry, endDate: event.target.value } : entry) }))} className="input-field" placeholder={t.fields.endDate} />
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setData((current) => ({ ...current, education: [...current.education, { institution: '', degree: '', startDate: '', endDate: '' }] }))} className="btn-secondary w-full"><Plus className="mr-2 inline h-4 w-4" />{copy.add} {copy.education}</button>
          </div>
        )}

        {section === 'SKILLS' && (
          <div className="space-y-4">
            <label className="block text-sm font-semibold text-gray-700">{t.fields.hardSkills} *
              <textarea value={listText(data.skills.hardSkills)} onChange={(event) => setData((current) => ({ ...current, skills: { ...current.skills, hardSkills: parseList(event.target.value) } }))} rows={4} className="input-field mt-1" placeholder="TypeScript, React, PostgreSQL" />
            </label>
            <label className="block text-sm font-semibold text-gray-700">{t.fields.softSkills}
              <textarea value={listText(data.skills.softSkills)} onChange={(event) => setData((current) => ({ ...current, skills: { ...current.skills, softSkills: parseList(event.target.value) } }))} rows={3} className="input-field mt-1" placeholder="Communication, Collaboration" />
            </label>
          </div>
        )}

        {section === 'PROJECTS' && (
          <div className="space-y-4">
            {(data.projects ?? []).map((item, index) => (
              <div key={`project-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="mb-4 flex items-center justify-between"><strong>{copy.projects} #{index + 1}</strong><button type="button" onClick={() => setData((current) => ({ ...current, projects: (current.projects ?? []).filter((_, i) => i !== index) }))} className="text-red-600" aria-label={`${copy.remove} ${copy.projects} ${index + 1}`}><Trash2 className="h-4 w-4" /></button></div>
                <input value={item.name} onChange={(event) => setData((current) => ({ ...current, projects: (current.projects ?? []).map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry) }))} className="input-field" placeholder={t.fields.projectName} />
                <textarea value={item.description} onChange={(event) => setData((current) => ({ ...current, projects: (current.projects ?? []).map((entry, i) => i === index ? { ...entry, description: event.target.value } : entry) }))} rows={4} className="input-field mt-3" placeholder={t.fields.description} />
                <input value={listText(item.technologies)} onChange={(event) => setData((current) => ({ ...current, projects: (current.projects ?? []).map((entry, i) => i === index ? { ...entry, technologies: parseList(event.target.value) } : entry) }))} className="input-field mt-3" placeholder="React, FastAPI, Docker" />
                <input value={item.link ?? ''} onChange={(event) => setData((current) => ({ ...current, projects: (current.projects ?? []).map((entry, i) => i === index ? { ...entry, link: event.target.value } : entry) }))} className="input-field mt-3" placeholder={t.fields.projectLink} inputMode="url" />
              </div>
            ))}
            <button type="button" onClick={() => setData((current) => ({ ...current, projects: [...(current.projects ?? []), { name: '', description: '', technologies: [], link: '' }] }))} className="btn-secondary w-full"><Plus className="mr-2 inline h-4 w-4" />{copy.add} {copy.projects}</button>
          </div>
        )}

        {section === 'CERTIFICATIONS' && (
          <div className="space-y-4">
            {(data.certifications ?? []).map((item, index) => (
              <div key={`cert-${index}`} className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-[1fr_1fr_180px_auto]">
                <input value={item.name} onChange={(event) => setData((current) => ({ ...current, certifications: (current.certifications ?? []).map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry) }))} className="input-field" placeholder="Certification" />
                <input value={item.issuer} onChange={(event) => setData((current) => ({ ...current, certifications: (current.certifications ?? []).map((entry, i) => i === index ? { ...entry, issuer: event.target.value } : entry) }))} className="input-field" placeholder={t.fields.issuer} />
                <input value={item.date} onChange={(event) => setData((current) => ({ ...current, certifications: (current.certifications ?? []).map((entry, i) => i === index ? { ...entry, date: event.target.value } : entry) }))} className="input-field" placeholder={t.fields.credentialDate} />
                <button type="button" onClick={() => setData((current) => ({ ...current, certifications: (current.certifications ?? []).filter((_, i) => i !== index) }))} className="text-red-600" aria-label={`${copy.remove} ${copy.certifications} ${index + 1}`}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setData((current) => ({ ...current, certifications: [...(current.certifications ?? []), { name: '', issuer: '', date: '' }] }))} className="btn-secondary w-full"><Plus className="mr-2 inline h-4 w-4" />{copy.add} {copy.certifications}</button>
          </div>
        )}

        {section === 'LANGUAGES' && (
          <div className="space-y-4">
            {(data.languages ?? []).map((item, index) => (
              <div key={`language-${index}`} className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-[1fr_1fr_auto]">
                <input value={item.language} onChange={(event) => setData((current) => ({ ...current, languages: (current.languages ?? []).map((entry, i) => i === index ? { ...entry, language: event.target.value } : entry) }))} className="input-field" placeholder={t.fields.language} />
                <input value={item.proficiency} onChange={(event) => setData((current) => ({ ...current, languages: (current.languages ?? []).map((entry, i) => i === index ? { ...entry, proficiency: event.target.value } : entry) }))} className="input-field" placeholder={t.fields.proficiency} />
                <button type="button" onClick={() => setData((current) => ({ ...current, languages: (current.languages ?? []).filter((_, i) => i !== index) }))} className="text-red-600" aria-label={`${copy.remove} ${copy.languages} ${index + 1}`}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setData((current) => ({ ...current, languages: [...(current.languages ?? []), { language: '', proficiency: '' }] }))} className="btn-secondary w-full"><Plus className="mr-2 inline h-4 w-4" />{copy.add} {copy.languages}</button>
          </div>
        )}

        {optimizationError && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800" role="status">{optimizationError}</p>}

        {issuesVisible && readiness.issues.length > 0 && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
            <p className="text-sm font-bold text-amber-900">{copy.readiness}</p>
            <ul className="mt-2 space-y-1 text-xs text-amber-800">
              {readiness.issues.slice(0, 12).map((issue) => <li key={`${issue.fieldPath}-${issue.message}`}>• {issue.fieldPath}: {issue.message}</li>)}
            </ul>
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5">
          <div className="flex gap-2">
            {sectionIndex === 0 && onCancel ? <button type="button" onClick={onCancel} className="btn-secondary">{copy.cancel}</button> : null}
            {sectionIndex > 0 ? <button type="button" onClick={() => { setIssuesVisible(false); setSectionIndex((value) => Math.max(0, value - 1)); }} className="btn-secondary"><ArrowLeft className="mr-2 inline h-4 w-4" />{copy.previous}</button> : null}
          </div>
          {sectionIndex < SECTIONS.length - 1 ? (
            <button type="button" onClick={() => { setIssuesVisible(false); setSectionIndex((value) => Math.min(SECTIONS.length - 1, value + 1)); }} className="btn-primary">{copy.next}<ArrowRight className="ml-2 inline h-4 w-4" /></button>
          ) : (
            <button type="button" onClick={complete} className="btn-primary">{copy.target}<ArrowRight className="ml-2 inline h-4 w-4" /></button>
          )}
        </div>
      </section>
    </div>
  );
}
