'use client';

import { useRef } from 'react';
import jsPDF from 'jspdf';
import { useLanguage } from '@/components/LanguageProvider';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  HelpCircle,
  Link2,
  Printer,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type {
  ClaimTraceabilityView,
  ExplainableJobRequirementView,
  GeneratedResumeResult,
} from '@/lib/application/product/ProductResultContract';
import type { ProductMetricEvaluation } from '@/lib/application/product/ProductEvaluationService';
import {
  REQUIREMENT_STATUS_EXPLANATIONS,
  summarizeJobMatch,
} from '@/lib/application/product/ExplainabilityPresenter';

type ResumeResultsProps = GeneratedResumeResult & {
  readonly userName: string;
  readonly onStartOver: () => void;
};

const COPY = {
  en: {
    jobMatch: 'Job Match',
    resumeQuality: 'Resume Quality',
    parseability: 'ATS Parseability',
    notEvaluated: 'Not evaluated',
    noJob: 'Add a Job Description to evaluate fit. No target means no Job Match score.',
    requirements: 'Requirement evidence',
    required: 'Required',
    preferred: 'Preferred',
    other: 'Other requirements',
    why: 'Why this status?',
    evidence: 'Candidate evidence',
    noEvidence: 'No supporting candidate assertion was linked to this requirement.',
    claims: 'Resume claim traceability',
    claimsDesc: 'Material generated wording is linked back to candidate assertions. Job requirements are never used as candidate evidence.',
    supportedBy: 'Supported by',
    version: 'Current version integrity',
    durable: 'Saved to Career Vault',
    provenance: 'Complete claim provenance',
    contentHash: 'Content hash verified',
    scope: 'What this score means',
    checks: 'Checks',
    technical: 'Technical details',
    download: 'Download PDF',
    print: 'Print',
    createNew: 'Create New',
    match: 'Match',
    potential: 'Potential',
    gap: 'Gap',
    unknown: 'Unknown',
    blocker: 'Blocker',
  },
  es: {
    jobMatch: 'Compatibilidad con la vacante',
    resumeQuality: 'Calidad del CV',
    parseability: 'Legibilidad ATS',
    notEvaluated: 'No evaluado',
    noJob: 'Agrega una descripción de vacante para evaluar encaje. Sin objetivo no existe un puntaje de Job Match.',
    requirements: 'Evidencia por requisito',
    required: 'Requeridos',
    preferred: 'Preferidos',
    other: 'Otros requisitos',
    why: '¿Por qué este estado?',
    evidence: 'Evidencia del candidato',
    noEvidence: 'No se vinculó ninguna assertion del candidato como respaldo de este requisito.',
    claims: 'Trazabilidad de claims del CV',
    claimsDesc: 'El contenido material generado está vinculado a assertions del candidato. Los requisitos de la vacante nunca cuentan como evidencia del candidato.',
    supportedBy: 'Respaldado por',
    version: 'Integridad de la versión actual',
    durable: 'Guardado en Career Vault',
    provenance: 'Provenance completo de claims',
    contentHash: 'Hash de contenido verificado',
    scope: 'Qué significa este puntaje',
    checks: 'Validaciones',
    technical: 'Detalles técnicos',
    download: 'Descargar PDF',
    print: 'Imprimir',
    createNew: 'Crear Nuevo',
    match: 'Match',
    potential: 'Potencial',
    gap: 'Gap',
    unknown: 'Desconocido',
    blocker: 'Bloqueador',
  },
  fr: {
    jobMatch: 'Adéquation au poste',
    resumeQuality: 'Qualité du CV',
    parseability: 'Lisibilité ATS',
    notEvaluated: 'Non évalué',
    noJob: "Ajoutez une description de poste pour évaluer l'adéquation.",
    requirements: 'Preuves par exigence',
    required: 'Obligatoires',
    preferred: 'Préférées',
    other: 'Autres exigences',
    why: 'Pourquoi ce statut ?',
    evidence: 'Preuves du candidat',
    noEvidence: 'Aucune assertion du candidat n’a été liée à cette exigence.',
    claims: 'Traçabilité des affirmations du CV',
    claimsDesc: 'Le contenu généré est relié aux assertions du candidat.',
    supportedBy: 'Soutenu par',
    version: 'Intégrité de la version actuelle',
    durable: 'Enregistré dans Career Vault',
    provenance: 'Provenance complète',
    contentHash: 'Hash du contenu vérifié',
    scope: 'Portée du score',
    checks: 'Vérifications',
    technical: 'Détails techniques',
    download: 'Télécharger PDF',
    print: 'Imprimer',
    createNew: 'Créer Nouveau',
    match: 'Match',
    potential: 'Potentiel',
    gap: 'Écart',
    unknown: 'Inconnu',
    blocker: 'Bloquant',
  },
  pt: {
    jobMatch: 'Aderência à vaga',
    resumeQuality: 'Qualidade do CV',
    parseability: 'Legibilidade ATS',
    notEvaluated: 'Não avaliado',
    noJob: 'Adicione uma descrição da vaga para avaliar aderência.',
    requirements: 'Evidência por requisito',
    required: 'Obrigatórios',
    preferred: 'Preferidos',
    other: 'Outros requisitos',
    why: 'Por que este status?',
    evidence: 'Evidência do candidato',
    noEvidence: 'Nenhuma assertion do candidato foi vinculada a este requisito.',
    claims: 'Rastreabilidade dos claims do CV',
    claimsDesc: 'O conteúdo material gerado é vinculado às assertions do candidato.',
    supportedBy: 'Apoiado por',
    version: 'Integridade da versão atual',
    durable: 'Salvo no Career Vault',
    provenance: 'Provenance completo',
    contentHash: 'Hash de conteúdo verificado',
    scope: 'Escopo do score',
    checks: 'Verificações',
    technical: 'Detalhes técnicos',
    download: 'Baixar PDF',
    print: 'Imprimir',
    createNew: 'Criar Novo',
    match: 'Match',
    potential: 'Potencial',
    gap: 'Gap',
    unknown: 'Desconhecido',
    blocker: 'Bloqueador',
  },
} as const;

function metricLabel(score: number): string {
  if (score >= 85) return 'Strong';
  if (score >= 70) return 'Solid';
  if (score >= 50) return 'Mixed';
  return 'Needs review';
}

function MetricCard({
  title,
  metric,
  unavailable,
}: Readonly<{
  title: string;
  metric?: ProductMetricEvaluation | { readonly score: number; readonly scope: string };
  unavailable?: string;
}>) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-h-[168px]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{title}</p>
      {metric ? (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-serif font-bold text-gray-950">{Math.round(metric.score)}</span>
            <span className="text-sm font-semibold text-gray-400">/100</span>
          </div>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-600">{metricLabel(metric.score)}</p>
          <p className="mt-4 text-xs leading-relaxed text-gray-500">{metric.scope}</p>
        </>
      ) : (
        <div className="mt-4">
          <p className="text-2xl font-serif font-bold text-gray-400">—</p>
          <p className="mt-3 text-xs leading-relaxed text-gray-500">{unavailable}</p>
        </div>
      )}
    </div>
  );
}

function statusStyle(status: ExplainableJobRequirementView['status']) {
  switch (status) {
    case 'MATCH':
      return { icon: CheckCircle2, badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'POTENTIAL_MATCH':
      return { icon: HelpCircle, badge: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'GAP':
      return { icon: XCircle, badge: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'BLOCKER':
      return { icon: AlertTriangle, badge: 'bg-red-100 text-red-800 border-red-300' };
    default:
      return { icon: HelpCircle, badge: 'bg-gray-100 text-gray-700 border-gray-200' };
  }
}

function requirementStatusLabel(
  status: ExplainableJobRequirementView['status'],
  copy: (typeof COPY)[keyof typeof COPY],
): string {
  if (status === 'MATCH') return copy.match;
  if (status === 'POTENTIAL_MATCH') return copy.potential;
  if (status === 'GAP') return copy.gap;
  if (status === 'BLOCKER') return copy.blocker;
  return copy.unknown;
}

function RequirementCard({
  requirement,
  copy,
}: Readonly<{
  requirement: ExplainableJobRequirementView;
  copy: (typeof COPY)[keyof typeof COPY];
}>) {
  const style = statusStyle(requirement.status);
  const Icon = style.icon;

  return (
    <details className="group rounded-lg border border-gray-200 bg-white open:shadow-sm">
      <summary className="cursor-pointer list-none p-4 flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-gray-700" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-relaxed text-gray-900">{requirement.statement}</p>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${style.badge}`}>
              {requirementStatusLabel(requirement.status, copy)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-gray-400">
            <span>{requirement.kind}</span>
            {requirement.minimumYears !== undefined && <span>• {requirement.minimumYears}+ years</span>}
          </div>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 text-gray-400 transition-transform group-open:rotate-90" />
      </summary>

      <div className="border-t border-gray-100 px-4 pb-4 pt-4 space-y-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">{copy.why}</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-700">{requirement.rationale}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">{REQUIREMENT_STATUS_EXPLANATIONS[requirement.status]}</p>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">{copy.evidence}</p>
          {requirement.evidence.length > 0 ? (
            <div className="mt-2 space-y-2">
              {requirement.evidence.map((evidence) => (
                <div key={evidence.assertionId} className="rounded-md bg-gray-50 p-3">
                  <p className="text-sm leading-relaxed text-gray-800">“{evidence.statement}”</p>
                  <p className="mt-2 break-all font-mono text-[10px] text-gray-400">{evidence.assertionId}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-500">{copy.noEvidence}</p>
          )}
        </div>
      </div>
    </details>
  );
}

function MetricChecks({
  title,
  metric,
  scopeLabel,
  checksLabel,
}: Readonly<{
  title: string;
  metric: ProductMetricEvaluation;
  scopeLabel: string;
  checksLabel: string;
}>) {
  return (
    <details className="rounded-lg border border-gray-200 bg-white">
      <summary className="cursor-pointer list-none p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="mt-1 text-xs text-gray-500">{metric.score}/100</p>
        </div>
        <ChevronRight className="h-4 w-4 text-gray-400" />
      </summary>
      <div className="border-t border-gray-100 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">{scopeLabel}</p>
        <p className="mt-1 text-sm text-gray-600">{metric.scope}</p>
        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">{checksLabel}</p>
        <div className="mt-2 space-y-2">
          {metric.checks.map((check) => (
            <div key={check.id} className="flex gap-3 rounded-md bg-gray-50 p-3">
              {check.status === 'PASS' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : check.status === 'WARN' ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              ) : (
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              )}
              <div>
                <p className="text-xs font-semibold text-gray-800">{check.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function ClaimCard({ claim, copy }: Readonly<{ claim: ClaimTraceabilityView; copy: (typeof COPY)[keyof typeof COPY] }>) {
  return (
    <details className="group rounded-lg border border-gray-200 bg-white">
      <summary className="cursor-pointer list-none p-4 flex items-start gap-3">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <p className="flex-1 text-sm leading-relaxed text-gray-900">{claim.wording}</p>
        <ChevronRight className="mt-1 h-4 w-4 text-gray-400 transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-gray-100 px-4 pb-4 pt-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">{copy.supportedBy}</p>
        <div className="mt-2 space-y-2">
          {claim.evidence.map((evidence) => (
            <div key={`${claim.claimId}-${evidence.assertionId}`} className="rounded-md bg-gray-50 p-3">
              <p className="text-sm text-gray-700">“{evidence.statement}”</p>
              <p className="mt-2 break-all font-mono text-[10px] text-gray-400">{evidence.assertionId}</p>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

export default function ResumeResults({
  formattedResume,
  productEvaluation,
  jobMatch,
  claimTraceability,
  resumeVersion,
  resumePersistence,
  careerVault,
  userName,
  onStartOver,
}: Readonly<ResumeResultsProps>) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const resumeRef = useRef<HTMLDivElement>(null);
  const jobSummary = summarizeJobMatch(jobMatch);

  const downloadPDF = () => {
    if (!resumeRef.current) return;

    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const lines = formattedResume.split('\n');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 25.4;
      const lineHeight = 5;
      let y = margin;

      pdf.setFont('helvetica');
      pdf.setFontSize(10);

      lines.forEach((line) => {
        if (y > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
        const isHeader = line === line.toUpperCase() && line.trim().length > 0;
        pdf.setFontSize(isHeader ? 12 : 10);
        pdf.setFont('helvetica', isHeader ? 'bold' : 'normal');
        const splitText = pdf.splitTextToSize(line, pageWidth - 2 * margin);
        pdf.text(splitText, margin, y);
        y += lineHeight * splitText.length;
      });

      const currentYear = new Date().getFullYear();
      pdf.save(`${userName}, CV- ${currentYear}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  const groups = [
    { label: copy.required, requirements: jobSummary?.required ?? [] },
    { label: copy.preferred, requirements: jobSummary?.preferred ?? [] },
    { label: copy.other, requirements: jobSummary?.unknownNecessity ?? [] },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="no-print flex gap-3 justify-center flex-wrap pb-6 border-b border-gray-200">
        <button onClick={downloadPDF} className="px-5 py-2.5 bg-gray-900 text-white rounded-md hover:bg-gray-800 font-medium text-sm flex items-center gap-2">
          <Download className="w-4 h-4" />
          <span>{copy.download}</span>
        </button>
        <button onClick={() => window.print()} className="px-5 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 font-medium text-sm flex items-center gap-2">
          <Printer className="w-4 h-4" />
          <span>{copy.print}</span>
        </button>
        <button onClick={onStartOver} className="px-5 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 font-medium text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          <span>{copy.createNew}</span>
        </button>
      </div>

      <section className="no-print grid grid-cols-1 md:grid-cols-3 gap-4" aria-label="ATS v2 evaluation summary">
        <MetricCard
          title={copy.jobMatch}
          metric={jobMatch ? {
            score: jobMatch.score,
            scope: `${jobSummary?.totalRequirements ?? 0} explicit job requirement(s) evaluated against candidate assertions.`,
          } : undefined}
          unavailable={`${copy.notEvaluated}. ${copy.noJob}`}
        />
        <MetricCard title={copy.resumeQuality} metric={productEvaluation.resumeQuality} />
        <MetricCard title={copy.parseability} metric={productEvaluation.atsParseability} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3 space-y-6 no-print">
          <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-gray-950">{copy.requirements}</h3>
                {jobSummary ? (
                  <p className="mt-1 text-sm text-gray-500">
                    {jobSummary.statusCounts.MATCH} MATCH · {jobSummary.statusCounts.POTENTIAL_MATCH} POTENTIAL · {jobSummary.statusCounts.GAP} GAP · {jobSummary.statusCounts.UNKNOWN} UNKNOWN
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-gray-500">{copy.noJob}</p>
                )}
              </div>
              {jobMatch && <ShieldCheck className="h-6 w-6 text-gray-700" />}
            </div>

            {jobSummary && (
              <div className="mt-5 space-y-6">
                {groups.map((group) => group.requirements.length > 0 && (
                  <div key={group.label}>
                    <div className="mb-2 flex items-center gap-2">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">{group.label}</p>
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-600">{group.requirements.length}</span>
                    </div>
                    <div className="space-y-2">
                      {group.requirements.map((requirement) => (
                        <RequirementCard key={requirement.id} requirement={requirement} copy={copy} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <div className="flex items-start gap-3">
              <Link2 className="mt-0.5 h-5 w-5 text-blue-600" />
              <div>
                <h3 className="text-base font-bold text-gray-950">{copy.claims}</h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-500">{copy.claimsDesc}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {claimTraceability.map((claim) => (
                <ClaimCard key={claim.claimId} claim={claim} copy={copy} />
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <MetricChecks title={copy.resumeQuality} metric={productEvaluation.resumeQuality} scopeLabel={copy.scope} checksLabel={copy.checks} />
            <MetricChecks title={copy.parseability} metric={productEvaluation.atsParseability} scopeLabel={copy.scope} checksLabel={copy.checks} />
          </section>

          <details className="rounded-xl border border-gray-200 bg-white">
            <summary className="cursor-pointer list-none p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="text-sm font-bold text-gray-900">{copy.version}</p>
                  <p className="mt-1 text-xs text-gray-500">{resumePersistence}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </summary>
            <div className="border-t border-gray-100 p-5 grid gap-3 text-sm text-gray-600">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {copy.durable}</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {copy.provenance}</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {copy.contentHash}</div>
              <div className="mt-2 rounded-md bg-gray-50 p-3 font-mono text-[11px] break-all text-gray-500">
                <p>{resumeVersion.id}</p>
                <p className="mt-1">sha256: {resumeVersion.contentSha256}</p>
                <p className="mt-1">vault revision: {careerVault.revision}</p>
                <p className="mt-1">model: {resumeVersion.generation.model}</p>
              </div>
            </div>
          </details>
        </div>

        <div className="lg:col-span-2 lg:sticky lg:top-28">
          <div className="bg-white rounded-sm shadow-sm border border-gray-200 relative overflow-hidden print-content">
            <div
              ref={resumeRef}
              className="p-6 md:p-10 font-serif bg-white"
              style={{
                minHeight: '11in',
                fontFamily: 'Georgia, Times New Roman, serif',
                fontSize: '10.5pt',
                lineHeight: '1.45',
                color: '#000',
              }}
            >
              <div className="whitespace-pre-wrap">{formattedResume}</div>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: String.raw`
        @media print {
          @page { margin: 0; size: auto; }
          body { background: white; }
          body * { visibility: hidden; height: 0; overflow: hidden; }
          header, footer, .no-print { display: none !important; }
          .print-content, .print-content * { visibility: visible !important; height: auto !important; overflow: visible !important; }
          .print-content { position: absolute; left: 0; top: 0; width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; box-shadow: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      ` }} />
    </div>
  );
}
