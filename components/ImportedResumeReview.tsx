'use client';

import {
  BriefcaseBusiness,
  CheckCircle2,
  GraduationCap,
  Languages,
  PencilLine,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import type { ResumeRequest } from '@/lib/schemas';
import type { ResumeImportContext } from '@/lib/application/import/ResumeImportProvider';
import { buildImportedResumeReviewModel } from '@/lib/application/presentation/ImportedResumeReviewModel';
import { useLanguage } from '@/components/LanguageProvider';

interface ImportedResumeReviewProps {
  readonly data: ResumeRequest;
  readonly context: ResumeImportContext;
  readonly onEdit: () => void;
  readonly onContinue: () => void;
  readonly onStartOver: () => void;
}

const COPY = {
  en: {
    eyebrow: 'Career review',
    title: 'We found your career information.',
    description: 'Review what came from your uploaded resume before choosing a target job. Nothing extracted here is treated as externally verified fact.',
    source: 'Source document',
    fields: 'source-backed fields',
    fromCv: 'From CV',
    personal: 'Personal details',
    summary: 'Professional summary',
    experience: 'Experience',
    education: 'Education',
    skills: 'Skills',
    projects: 'Projects',
    certifications: 'Certifications',
    languages: 'Languages',
    distinction: 'Academic distinction',
    noItems: 'No items extracted.',
    edit: 'Edit career details',
    continue: 'Continue to target job',
    startOver: 'Use another resume',
    trust: 'The job description stays separate from your career evidence. We will not add missing facts automatically.',
  },
  es: {
    eyebrow: 'Revisión de carrera',
    title: 'Encontramos la información de tu carrera.',
    description: 'Revisa lo que proviene de tu CV antes de elegir una vacante objetivo. Nada de lo extraído aquí se trata como un hecho externamente verificado.',
    source: 'Documento fuente',
    fields: 'campos respaldados por la fuente',
    fromCv: 'Desde tu CV',
    personal: 'Datos personales',
    summary: 'Resumen profesional',
    experience: 'Experiencia',
    education: 'Educación',
    skills: 'Habilidades',
    projects: 'Proyectos',
    certifications: 'Certificaciones',
    languages: 'Idiomas',
    distinction: 'Distinción académica',
    noItems: 'No se extrajeron elementos.',
    edit: 'Editar datos de carrera',
    continue: 'Continuar a vacante objetivo',
    startOver: 'Usar otro CV',
    trust: 'La descripción de la vacante permanece separada de tu evidencia profesional. No añadiremos hechos faltantes automáticamente.',
  },
  fr: {
    eyebrow: 'Revue de carrière',
    title: 'Nous avons trouvé vos informations professionnelles.',
    description: 'Vérifiez les données provenant de votre CV avant de choisir un poste cible. Les données extraites ne sont pas considérées comme des faits vérifiés par une source externe.',
    source: 'Document source',
    fields: 'champs liés à la source',
    fromCv: 'Depuis le CV',
    personal: 'Informations personnelles',
    summary: 'Résumé professionnel',
    experience: 'Expérience',
    education: 'Formation',
    skills: 'Compétences',
    projects: 'Projets',
    certifications: 'Certifications',
    languages: 'Langues',
    distinction: 'Distinction académique',
    noItems: 'Aucun élément extrait.',
    edit: 'Modifier les informations',
    continue: 'Continuer vers le poste cible',
    startOver: 'Utiliser un autre CV',
    trust: "La description du poste reste séparée de vos preuves professionnelles. Nous n'ajouterons pas automatiquement de faits manquants.",
  },
  pt: {
    eyebrow: 'Revisão de carreira',
    title: 'Encontramos suas informações profissionais.',
    description: 'Revise o que veio do seu currículo antes de escolher uma vaga-alvo. Nada extraído aqui é tratado como fato verificado externamente.',
    source: 'Documento de origem',
    fields: 'campos respaldados pela fonte',
    fromCv: 'Do currículo',
    personal: 'Dados pessoais',
    summary: 'Resumo profissional',
    experience: 'Experiência',
    education: 'Formação',
    skills: 'Habilidades',
    projects: 'Projetos',
    certifications: 'Certificações',
    languages: 'Idiomas',
    distinction: 'Distinção acadêmica',
    noItems: 'Nenhum item extraído.',
    edit: 'Editar dados da carreira',
    continue: 'Continuar para vaga-alvo',
    startOver: 'Usar outro currículo',
    trust: 'A descrição da vaga permanece separada da sua evidência profissional. Não adicionaremos fatos ausentes automaticamente.',
  },
} as const;

function EvidenceBadge({ label }: Readonly<{ label: string }>) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
      <CheckCircle2 className="h-3 w-3" />
      {label}
    </span>
  );
}

function EmptyState({ text }: Readonly<{ text: string }>) {
  return <p className="text-sm text-gray-400">{text}</p>;
}

export default function ImportedResumeReview({
  data,
  context,
  onEdit,
  onContinue,
  onStartOver,
}: Readonly<ImportedResumeReviewProps>) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const review = buildImportedResumeReviewModel(data, context);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-950 px-6 py-7 text-white md:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">{copy.eyebrow}</p>
          <h2 className="mt-2 text-3xl font-serif font-bold tracking-tight">{copy.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-300">{copy.description}</p>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">{copy.source}</p>
            <p className="mt-1 break-all text-sm font-semibold text-gray-900">{review.sourceFileName}</p>
            <p className="mt-1 text-xs text-gray-500">
              {review.importerVersion} · {review.totalEvidenceFields} {copy.fields}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-right font-mono text-[10px] text-gray-400">
            sha256: {review.sourceSha256.slice(0, 16)}…
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-gray-950">{copy.personal}</h3>
            <EvidenceBadge label={copy.fromCv} />
          </div>
          <div className="mt-4 space-y-2 text-sm text-gray-700">
            <p className="font-semibold text-gray-950">{data.personalInfo.fullName}</p>
            <p>{data.personalInfo.email}</p>
            <p>{data.personalInfo.location}</p>
            {data.personalInfo.linkedin && <p className="break-all text-blue-700">{data.personalInfo.linkedin}</p>}
            {data.personalInfo.github && <p className="break-all text-blue-700">{data.personalInfo.github}</p>}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-gray-950">{copy.summary}</h3>
            <EvidenceBadge label={copy.fromCv} />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-gray-700">{data.summary}</p>
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <BriefcaseBusiness className="h-5 w-5 text-gray-700" />
          <h3 className="font-bold text-gray-950">{copy.experience}</h3>
          <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">{data.experience.length}</span>
        </div>
        <div className="space-y-3">
          {data.experience.length === 0 ? <EmptyState text={copy.noItems} /> : data.experience.map((item, index) => (
            <div key={`${item.company}-${item.role}-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-950">{item.role}</p>
                  <p className="text-sm text-gray-600">{item.company} · {item.startDate} — {item.endDate}</p>
                </div>
                <EvidenceBadge label={copy.fromCv} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-gray-700">{item.description}</p>
              {item.technologies.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.technologies.map((technology) => (
                    <span key={technology} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700">{technology}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-gray-700" />
            <h3 className="font-bold text-gray-950">{copy.education}</h3>
          </div>
          <div className="space-y-3">
            {data.education.length === 0 ? <EmptyState text={copy.noItems} /> : data.education.map((item, index) => (
              <div key={`${item.institution}-${index}`} className="rounded-lg bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-950">{item.degree}</p>
                    <p className="text-sm text-gray-600">{item.institution}</p>
                    <p className="mt-1 text-xs text-gray-400">{item.startDate} — {item.endDate}</p>
                    {item.honors?.trim() ? (
                      <p className="mt-2 text-xs font-semibold text-indigo-700">{copy.distinction}: {item.honors}</p>
                    ) : null}
                  </div>
                  <EvidenceBadge label={copy.fromCv} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gray-700" />
            <h3 className="font-bold text-gray-950">{copy.skills}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {[...data.skills.hardSkills, ...data.skills.softSkills].map((skill) => (
              <span key={skill} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">{skill}</span>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <details className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" open={(data.projects?.length ?? 0) > 0}>
          <summary className="cursor-pointer font-bold text-gray-950">{copy.projects} ({data.projects?.length ?? 0})</summary>
          <div className="mt-4 space-y-3">
            {(data.projects?.length ?? 0) === 0 ? <EmptyState text={copy.noItems} /> : data.projects?.map((project, index) => (
              <div key={`${project.name}-${index}`} className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm font-semibold text-gray-900">{project.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">{project.description}</p>
                {project.technologies.length > 0 && <p className="mt-2 text-[11px] text-gray-400">{project.technologies.join(' · ')}</p>}
              </div>
            ))}
          </div>
        </details>

        <details className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" open={(data.certifications?.length ?? 0) > 0}>
          <summary className="cursor-pointer font-bold text-gray-950">{copy.certifications} ({data.certifications?.length ?? 0})</summary>
          <div className="mt-4 space-y-3">
            {(data.certifications?.length ?? 0) === 0 ? <EmptyState text={copy.noItems} /> : data.certifications?.map((certification, index) => (
              <div key={`${certification.name}-${index}`} className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm font-semibold text-gray-900">{certification.name}</p>
                <p className="mt-1 text-xs text-gray-600">{certification.issuer} · {certification.date}</p>
              </div>
            ))}
          </div>
        </details>

        <details className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" open={(data.languages?.length ?? 0) > 0}>
          <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-gray-950">
            <Languages className="h-4 w-4" /> {copy.languages} ({data.languages?.length ?? 0})
          </summary>
          <div className="mt-4 space-y-2">
            {(data.languages?.length ?? 0) === 0 ? <EmptyState text={copy.noItems} /> : data.languages?.map((item, index) => (
              <div key={`${item.language}-${index}`} className="flex justify-between gap-3 rounded-lg bg-gray-50 p-3 text-sm">
                <span className="font-semibold text-gray-900">{item.language}</span>
                <span className="text-gray-500">{item.proficiency}</span>
              </div>
            ))}
          </div>
        </details>
      </div>

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <p className="text-sm leading-relaxed text-blue-900">{copy.trust}</p>
        </div>
      </section>

      <div className="flex flex-col gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:items-center">
        <button type="button" onClick={onStartOver} className="text-sm font-medium text-gray-500 hover:text-gray-900">
          {copy.startOver}
        </button>
        <div className="sm:ml-auto flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={onEdit} className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">
            <PencilLine className="h-4 w-4" /> {copy.edit}
          </button>
          <button type="button" onClick={onContinue} className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800">
            <Target className="h-4 w-4" /> {copy.continue}
          </button>
        </div>
      </div>
    </div>
  );
}
