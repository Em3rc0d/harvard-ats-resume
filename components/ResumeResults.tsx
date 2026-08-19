'use client';

import { useState } from 'react';
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
    jobMatch: 'Job Match', resumeQuality: 'Resume Quality', parseability: 'ATS Parseability', notEvaluated: 'Not evaluated',
    noJob: 'No target job was supplied, so Job Match is not evaluated.', requirements: 'Requirement evidence',
    required: 'Required', preferred: 'Preferred', other: 'Other requirements', why: 'Why this status?', evidence: 'Candidate evidence',
    noEvidence: 'No supporting candidate assertion was linked to this requirement.', claims: 'Resume claim traceability',
    claimsDesc: 'Material generated wording is linked back to candidate assertions. Job requirements are never candidate evidence.', supportedBy: 'Supported by',
    version: 'Current version integrity', durable: 'Saved to Career Vault', provenance: 'Complete claim provenance', hash: 'Content hash verified',
    scope: 'What this score means', checks: 'Checks', download: 'Download PDF', print: 'Print', createNew: 'Create New',
    downloadError: 'The PDF could not be generated. The trusted resume version is still available on this page.',
    match: 'Match', potential: 'Potential', gap: 'Gap', unknown: 'Unknown', blocker: 'Blocker',
    strong: 'Strong', solid: 'Solid', mixed: 'Mixed', needsReview: 'Needs review', suggestions: 'Suggestions',
  },
  es: {
    jobMatch: 'Compatibilidad con la vacante', resumeQuality: 'Calidad del CV', parseability: 'Legibilidad ATS', notEvaluated: 'No evaluado',
    noJob: 'No se indicó una vacante objetivo, por lo que Job Match no se evalúa.', requirements: 'Evidencia por requisito',
    required: 'Requeridos', preferred: 'Preferidos', other: 'Otros requisitos', why: '¿Por qué este estado?', evidence: 'Evidencia del candidato',
    noEvidence: 'No se vinculó ninguna assertion del candidato como respaldo.', claims: 'Trazabilidad de claims del CV',
    claimsDesc: 'El contenido material generado está vinculado a assertions del candidato. La vacante nunca cuenta como evidencia.', supportedBy: 'Respaldado por',
    version: 'Integridad de la versión actual', durable: 'Guardado en Career Vault', provenance: 'Provenance completo de claims', hash: 'Hash verificado',
    scope: 'Qué significa este puntaje', checks: 'Validaciones', download: 'Descargar PDF', print: 'Imprimir', createNew: 'Crear nuevo',
    downloadError: 'No pudimos generar el PDF. La versión confiable del CV sigue disponible en esta página.',
    match: 'Match', potential: 'Potencial', gap: 'Gap', unknown: 'Desconocido', blocker: 'Bloqueador',
    strong: 'Fuerte', solid: 'Sólido', mixed: 'Mixto', needsReview: 'Requiere revisión', suggestions: 'Sugerencias',
  },
  fr: {
    jobMatch: 'Adéquation au poste', resumeQuality: 'Qualité du CV', parseability: 'Lisibilité ATS', notEvaluated: 'Non évalué',
    noJob: "Aucun poste cible n'a été fourni; Job Match n'est donc pas évalué.", requirements: 'Preuves par exigence',
    required: 'Obligatoires', preferred: 'Préférées', other: 'Autres exigences', why: 'Pourquoi ce statut ?', evidence: 'Preuves du candidat',
    noEvidence: "Aucune assertion du candidat n'a été liée à cette exigence.", claims: 'Traçabilité des affirmations',
    claimsDesc: 'Le contenu généré est relié aux assertions du candidat. Les exigences du poste ne sont jamais des preuves.', supportedBy: 'Soutenu par',
    version: 'Intégrité de la version', durable: 'Enregistré dans Career Vault', provenance: 'Provenance complète', hash: 'Hash vérifié',
    scope: 'Portée du score', checks: 'Vérifications', download: 'Télécharger PDF', print: 'Imprimer', createNew: 'Créer nouveau',
    downloadError: "Le PDF n'a pas pu être généré. La version fiable du CV reste disponible sur cette page.",
    match: 'Match', potential: 'Potentiel', gap: 'Écart', unknown: 'Inconnu', blocker: 'Bloquant',
    strong: 'Fort', solid: 'Solide', mixed: 'Mitigé', needsReview: 'À revoir', suggestions: 'Suggestions',
  },
  pt: {
    jobMatch: 'Aderência à vaga', resumeQuality: 'Qualidade do CV', parseability: 'Legibilidade ATS', notEvaluated: 'Não avaliado',
    noJob: 'Nenhuma vaga alvo foi informada, portanto o Job Match não é avaliado.', requirements: 'Evidência por requisito',
    required: 'Obrigatórios', preferred: 'Preferidos', other: 'Outros requisitos', why: 'Por que este status?', evidence: 'Evidência do candidato',
    noEvidence: 'Nenhuma assertion do candidato foi vinculada a este requisito.', claims: 'Rastreabilidade dos claims',
    claimsDesc: 'O conteúdo material gerado é ligado às assertions do candidato. Requisitos da vaga nunca são evidência.', supportedBy: 'Apoiado por',
    version: 'Integridade da versão atual', durable: 'Salvo no Career Vault', provenance: 'Provenance completo', hash: 'Hash verificado',
    scope: 'Escopo do score', checks: 'Verificações', download: 'Baixar PDF', print: 'Imprimir', createNew: 'Criar novo',
    downloadError: 'Não foi possível gerar o PDF. A versão confiável do currículo continua disponível nesta página.',
    match: 'Match', potential: 'Potencial', gap: 'Gap', unknown: 'Desconhecido', blocker: 'Bloqueador',
    strong: 'Forte', solid: 'Sólido', mixed: 'Misto', needsReview: 'Requer revisão', suggestions: 'Sugestões',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function metricLabel(score: number, copy: Copy): string {
  if (score >= 85) return copy.strong;
  if (score >= 70) return copy.solid;
  if (score >= 50) return copy.mixed;
  return copy.needsReview;
}

function MetricCard({ title, metric, unavailable, copy }: Readonly<{
  title: string;
  metric?: ProductMetricEvaluation | { readonly score: number; readonly scope: string };
  unavailable?: string;
  copy: Copy;
}>) {
  return (
    <div className="min-h-[168px] rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{title}</p>
      {metric ? (
        <>
          <div className="mt-3 flex items-baseline gap-2"><span className="font-serif text-4xl font-bold text-gray-950">{Math.round(metric.score)}</span><span className="text-sm font-semibold text-gray-400">/100</span></div>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-600">{metricLabel(metric.score, copy)}</p>
          <p className="mt-4 text-xs leading-relaxed text-gray-500">{metric.scope}</p>
        </>
      ) : (
        <div className="mt-4"><p className="font-serif text-2xl font-bold text-gray-400">—</p><p className="mt-3 text-xs leading-relaxed text-gray-500">{unavailable}</p></div>
      )}
    </div>
  );
}

function requirementStyle(status: ExplainableJobRequirementView['status']) {
  if (status === 'MATCH') return { icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
  if (status === 'POTENTIAL_MATCH') return { icon: HelpCircle, className: 'border-amber-200 bg-amber-50 text-amber-700' };
  if (status === 'GAP') return { icon: XCircle, className: 'border-rose-200 bg-rose-50 text-rose-700' };
  if (status === 'BLOCKER') return { icon: AlertTriangle, className: 'border-red-300 bg-red-100 text-red-800' };
  return { icon: HelpCircle, className: 'border-gray-200 bg-gray-100 text-gray-700' };
}

function requirementLabel(status: ExplainableJobRequirementView['status'], copy: Copy): string {
  if (status === 'MATCH') return copy.match;
  if (status === 'POTENTIAL_MATCH') return copy.potential;
  if (status === 'GAP') return copy.gap;
  if (status === 'BLOCKER') return copy.blocker;
  return copy.unknown;
}

function RequirementCard({ requirement, copy }: Readonly<{ requirement: ExplainableJobRequirementView; copy: Copy }>) {
  const style = requirementStyle(requirement.status);
  const Icon = style.icon;
  return (
    <details className="group rounded-lg border border-gray-200 bg-white open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-gray-700" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-relaxed text-gray-900">{requirement.statement}</p>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${style.className}`}>{requirementLabel(requirement.status, copy)}</span>
          </div>
          <p className="mt-2 text-[11px] uppercase tracking-wide text-gray-400">{requirement.kind}{requirement.minimumYears !== undefined ? ` · ${requirement.minimumYears}+ years` : ''}</p>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 text-gray-400 transition-transform group-open:rotate-90" />
      </summary>
      <div className="space-y-4 border-t border-gray-100 p-4">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">{copy.why}</p><p className="mt-1 text-sm leading-relaxed text-gray-700">{requirement.rationale}</p><p className="mt-1 text-xs text-gray-400">{REQUIREMENT_STATUS_EXPLANATIONS[requirement.status]}</p></div>
        <div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">{copy.evidence}</p>
          {requirement.evidence.length > 0 ? <div className="mt-2 space-y-2">{requirement.evidence.map((item) => <div key={item.assertionId} className="rounded-md bg-gray-50 p-3"><p className="text-sm text-gray-800">“{item.statement}”</p><p className="mt-2 break-all font-mono text-[10px] text-gray-400">{item.assertionId}</p></div>)}</div> : <p className="mt-2 text-sm text-gray-500">{copy.noEvidence}</p>}
        </div>
      </div>
    </details>
  );
}

function ClaimCard({ claim, copy }: Readonly<{ claim: ClaimTraceabilityView; copy: Copy }>) {
  return (
    <details className="group rounded-lg border border-gray-200 bg-white">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4"><Link2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /><p className="flex-1 text-sm leading-relaxed text-gray-900">{claim.wording}</p><ChevronRight className="mt-1 h-4 w-4 text-gray-400 transition-transform group-open:rotate-90" /></summary>
      <div className="border-t border-gray-100 p-4"><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">{copy.supportedBy}</p><div className="mt-2 space-y-2">{claim.evidence.map((item) => <div key={`${claim.claimId}-${item.assertionId}`} className="rounded-md bg-gray-50 p-3"><p className="text-sm text-gray-700">“{item.statement}”</p><p className="mt-2 break-all font-mono text-[10px] text-gray-400">{item.assertionId}</p></div>)}</div></div>
    </details>
  );
}

function MetricChecks({ title, metric, copy }: Readonly<{ title: string; metric: ProductMetricEvaluation; copy: Copy }>) {
  return (
    <details className="rounded-lg border border-gray-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4"><div><p className="text-sm font-semibold text-gray-900">{title}</p><p className="mt-1 text-xs text-gray-500">{metric.score}/100</p></div><ChevronRight className="h-4 w-4 text-gray-400" /></summary>
      <div className="border-t border-gray-100 p-4"><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">{copy.scope}</p><p className="mt-1 text-sm text-gray-600">{metric.scope}</p><p className="mt-5 text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">{copy.checks}</p><div className="mt-2 space-y-2">{metric.checks.map((check) => <div key={check.id} className="rounded-md bg-gray-50 p-3"><p className="text-xs font-semibold text-gray-800">{check.status} · {check.label}</p><p className="mt-1 text-xs leading-relaxed text-gray-500">{check.detail}</p></div>)}</div></div>
    </details>
  );
}

function safeFileName(value: string): string {
  const normalized = value.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').replace(/\s+/g, ' ').trim();
  return normalized || 'Candidate';
}

export default function ResumeResults({
  formattedResume,
  productEvaluation,
  jobMatch,
  claimTraceability,
  resumeVersion,
  resumePersistence,
  careerVault,
  suggestions,
  userName,
  onStartOver,
}: Readonly<ResumeResultsProps>) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const jobSummary = summarizeJobMatch(jobMatch);

  const downloadPDF = () => {
    setDownloadError(null);
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 25.4;
      const lineHeight = 5;
      let y = margin;

      pdf.setFont('helvetica');
      formattedResume.split('\n').forEach((line) => {
        const isHeader = line.trim().length > 0 && line === line.toUpperCase();
        pdf.setFontSize(isHeader ? 12 : 10);
        pdf.setFont('helvetica', isHeader ? 'bold' : 'normal');
        const split = pdf.splitTextToSize(line, pageWidth - 2 * margin) as string[];
        if (y + lineHeight * Math.max(1, split.length) > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
        pdf.text(split, margin, y);
        y += lineHeight * Math.max(1, split.length);
      });

      pdf.save(`${safeFileName(userName)} CV ${new Date().getFullYear()}.pdf`);
    } catch {
      // A presentation export failure never invalidates the durable ResumeVersion.
      setDownloadError(copy.downloadError);
    }
  };

  const groups = [
    { label: copy.required, requirements: jobSummary?.required ?? [] },
    { label: copy.preferred, requirements: jobSummary?.preferred ?? [] },
    { label: copy.other, requirements: jobSummary?.unknownNecessity ?? [] },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="no-print flex flex-wrap justify-center gap-3 border-b border-gray-200 pb-6">
        <button type="button" onClick={downloadPDF} className="flex items-center gap-2 rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"><Download className="h-4 w-4" />{copy.download}</button>
        <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"><Printer className="h-4 w-4" />{copy.print}</button>
        <button type="button" onClick={onStartOver} className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"><RefreshCw className="h-4 w-4" />{copy.createNew}</button>
      </div>

      {downloadError && <div className="no-print mx-auto max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">{downloadError}</div>}

      <section className="no-print grid grid-cols-1 gap-4 md:grid-cols-3" aria-label="ATS v2 evaluation summary">
        <MetricCard title={copy.jobMatch} metric={jobMatch ? { score: jobMatch.score, scope: `${jobSummary?.totalRequirements ?? 0} explicit job requirement(s) evaluated against candidate assertions.` } : undefined} unavailable={`${copy.notEvaluated}. ${copy.noJob}`} copy={copy} />
        <MetricCard title={copy.resumeQuality} metric={productEvaluation.resumeQuality} copy={copy} />
        <MetricCard title={copy.parseability} metric={productEvaluation.atsParseability} copy={copy} />
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <div className="no-print space-y-6 lg:col-span-3">
          <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <div className="flex items-start justify-between gap-4"><div><h3 className="text-base font-bold text-gray-950">{copy.requirements}</h3>{jobSummary ? <p className="mt-1 text-sm text-gray-500">{jobSummary.statusCounts.MATCH} MATCH · {jobSummary.statusCounts.POTENTIAL_MATCH} POTENTIAL · {jobSummary.statusCounts.GAP} GAP · {jobSummary.statusCounts.UNKNOWN} UNKNOWN</p> : <p className="mt-1 text-sm text-gray-500">{copy.noJob}</p>}</div>{jobMatch && <ShieldCheck className="h-6 w-6 text-gray-700" />}</div>
            {jobSummary && <div className="mt-5 space-y-6">{groups.map((group) => group.requirements.length > 0 && <div key={group.label}><div className="mb-2 flex items-center gap-2"><p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">{group.label}</p><span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-600">{group.requirements.length}</span></div><div className="space-y-2">{group.requirements.map((requirement) => <RequirementCard key={requirement.id} requirement={requirement} copy={copy} />)}</div></div>)}</div>}
          </section>

          <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <div className="flex items-start gap-3"><Link2 className="mt-0.5 h-5 w-5 text-blue-600" /><div><h3 className="text-base font-bold text-gray-950">{copy.claims}</h3><p className="mt-1 text-sm leading-relaxed text-gray-500">{copy.claimsDesc}</p></div></div>
            <div className="mt-4 space-y-2">{claimTraceability.map((claim) => <ClaimCard key={claim.claimId} claim={claim} copy={copy} />)}</div>
          </section>

          {suggestions.length > 0 && <section className="rounded-xl border border-gray-200 bg-white p-5"><h3 className="text-sm font-bold text-gray-950">{copy.suggestions}</h3><div className="mt-3 space-y-2">{suggestions.map((suggestion) => <p key={suggestion} className="text-sm leading-relaxed text-gray-600">• {suggestion}</p>)}</div></section>}

          <section className="space-y-2"><MetricChecks title={copy.resumeQuality} metric={productEvaluation.resumeQuality} copy={copy} /><MetricChecks title={copy.parseability} metric={productEvaluation.atsParseability} copy={copy} /></section>

          <details className="rounded-xl border border-gray-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5"><div className="flex items-center gap-3"><Database className="h-5 w-5 text-gray-600" /><div><p className="text-sm font-bold text-gray-900">{copy.version}</p><p className="mt-1 text-xs text-gray-500">{resumePersistence}</p></div></div><ChevronRight className="h-4 w-4 text-gray-400" /></summary>
            <div className="grid gap-3 border-t border-gray-100 p-5 text-sm text-gray-600"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{copy.durable}</div><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{copy.provenance}</div><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{copy.hash}</div><div className="mt-2 rounded-md bg-gray-50 p-3 font-mono text-[11px] break-all text-gray-500"><p>{resumeVersion.id}</p><p className="mt-1">sha256: {resumeVersion.contentSha256}</p><p className="mt-1">vault revision: {careerVault.revision}</p><p className="mt-1">model: {resumeVersion.generation.model}</p></div></div>
          </details>
        </div>

        <div className="lg:sticky lg:top-28 lg:col-span-2">
          <div className="print-content relative overflow-hidden rounded-sm border border-gray-200 bg-white shadow-sm">
            <div className="min-h-[11in] whitespace-pre-wrap bg-white p-6 font-serif text-[10.5pt] leading-[1.45] text-black md:p-10">{formattedResume}</div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: String.raw`
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
