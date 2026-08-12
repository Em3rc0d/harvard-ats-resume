'use client';

import { AlertTriangle, CheckCircle2, Compass, HelpCircle, XCircle } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';
import type {
  OpportunityAssessment,
  OpportunityRecommendation,
  OpportunityRequirementSignal,
} from '@/lib/application/opportunity/OpportunityAssessment';

const COPY = {
  en: {
    eyebrow: 'Opportunity assessment',
    question: 'Should I apply?',
    action: 'Recommended action',
    requiredCoverage: 'Required coverage',
    preferredCoverage: 'Preferred coverage',
    criticalGaps: 'Critical gaps',
    eligibility: 'Eligibility signal',
    supports: 'What supports you',
    transferable: 'Transferable evidence',
    missing: 'What is missing',
    noCriticalGaps: 'No explicit required gaps were detected.',
    evidence: 'Evidence',
    readyNow: 'Ready now',
    strongStretch: 'Strong stretch',
    buildable: 'Buildable',
    aspirational: 'Aspirational',
    lowAlignment: 'Low alignment',
    yes: 'Yes — prioritize this application',
    consider: 'Consider applying with eyes open',
    notYet: 'Not yet — strengthen the gaps first',
    futureTarget: 'Treat it as a future target',
    no: 'No — deprioritize for now',
    apply: 'Apply',
    applyCaution: 'Apply with caution',
    buildFirst: 'Build missing evidence first',
    planPath: 'Plan a path toward this role',
    deprioritize: 'Deprioritize',
  },
  es: {
    eyebrow: 'Evaluación de oportunidad',
    question: '¿Debería postular?',
    action: 'Acción recomendada',
    requiredCoverage: 'Cobertura requerida',
    preferredCoverage: 'Cobertura preferida',
    criticalGaps: 'Gaps críticos',
    eligibility: 'Señal de elegibilidad',
    supports: 'Qué te respalda',
    transferable: 'Evidencia transferible',
    missing: 'Qué falta',
    noCriticalGaps: 'No se detectaron gaps explícitos en requisitos requeridos.',
    evidence: 'Evidencia',
    readyNow: 'Listo ahora',
    strongStretch: 'Stretch sólido',
    buildable: 'Construible',
    aspirational: 'Aspiracional',
    lowAlignment: 'Baja alineación',
    yes: 'Sí — prioriza esta postulación',
    consider: 'Considera postular conociendo los gaps',
    notYet: 'Aún no — fortalece primero los gaps',
    futureTarget: 'Trátalo como objetivo futuro',
    no: 'No — despriorízalo por ahora',
    apply: 'Postular',
    applyCaution: 'Postular con cautela',
    buildFirst: 'Construir primero la evidencia faltante',
    planPath: 'Planificar una ruta hacia el rol',
    deprioritize: 'Despriorizar',
  },
  fr: {
    eyebrow: "Évaluation de l'opportunité",
    question: 'Dois-je postuler ?',
    action: 'Action recommandée',
    requiredCoverage: 'Couverture obligatoire',
    preferredCoverage: 'Couverture préférée',
    criticalGaps: 'Écarts critiques',
    eligibility: "Signal d'éligibilité",
    supports: 'Ce qui vous soutient',
    transferable: 'Preuves transférables',
    missing: 'Ce qui manque',
    noCriticalGaps: "Aucun écart explicite sur les exigences obligatoires n'a été détecté.",
    evidence: 'Preuve',
    readyNow: 'Prêt maintenant',
    strongStretch: 'Stretch solide',
    buildable: 'Atteignable',
    aspirational: 'Aspirationnel',
    lowAlignment: 'Faible alignement',
    yes: 'Oui — priorisez cette candidature',
    consider: 'Envisagez de postuler en connaissant les écarts',
    notYet: "Pas encore — renforcez d'abord les écarts",
    futureTarget: 'Traitez-le comme une cible future',
    no: 'Non — dépriorisez pour le moment',
    apply: 'Postuler',
    applyCaution: 'Postuler avec prudence',
    buildFirst: "Construire d'abord les preuves manquantes",
    planPath: 'Planifier une trajectoire vers ce rôle',
    deprioritize: 'Déprioriser',
  },
  pt: {
    eyebrow: 'Avaliação da oportunidade',
    question: 'Devo me candidatar?',
    action: 'Ação recomendada',
    requiredCoverage: 'Cobertura obrigatória',
    preferredCoverage: 'Cobertura preferida',
    criticalGaps: 'Lacunas críticas',
    eligibility: 'Sinal de elegibilidade',
    supports: 'O que sustenta sua candidatura',
    transferable: 'Evidência transferível',
    missing: 'O que falta',
    noCriticalGaps: 'Nenhuma lacuna explícita em requisitos obrigatórios foi detectada.',
    evidence: 'Evidência',
    readyNow: 'Pronto agora',
    strongStretch: 'Stretch sólido',
    buildable: 'Construível',
    aspirational: 'Aspiracional',
    lowAlignment: 'Baixo alinhamento',
    yes: 'Sim — priorize esta candidatura',
    consider: 'Considere se candidatar conhecendo as lacunas',
    notYet: 'Ainda não — fortaleça primeiro as lacunas',
    futureTarget: 'Trate como um objetivo futuro',
    no: 'Não — despriorize por enquanto',
    apply: 'Candidatar-se',
    applyCaution: 'Candidatar-se com cautela',
    buildFirst: 'Construir primeiro a evidência que falta',
    planPath: 'Planejar um caminho até a função',
    deprioritize: 'Despriorizar',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function recommendationLabel(value: OpportunityRecommendation, copy: Copy): string {
  if (value === 'READY_NOW') return copy.readyNow;
  if (value === 'STRONG_STRETCH') return copy.strongStretch;
  if (value === 'BUILDABLE') return copy.buildable;
  if (value === 'ASPIRATIONAL') return copy.aspirational;
  return copy.lowAlignment;
}

function decisionLabel(value: OpportunityAssessment['shouldApply'], copy: Copy): string {
  if (value === 'YES') return copy.yes;
  if (value === 'CONSIDER') return copy.consider;
  if (value === 'NOT_YET') return copy.notYet;
  if (value === 'FUTURE_TARGET') return copy.futureTarget;
  return copy.no;
}

function actionLabel(value: OpportunityAssessment['nextAction'], copy: Copy): string {
  if (value === 'APPLY') return copy.apply;
  if (value === 'APPLY_WITH_CAUTION') return copy.applyCaution;
  if (value === 'BUILD_FIRST') return copy.buildFirst;
  if (value === 'PLAN_PATH') return copy.planPath;
  return copy.deprioritize;
}

function recommendationStyle(value: OpportunityRecommendation) {
  if (value === 'READY_NOW') return 'border-emerald-300 bg-emerald-50 text-emerald-900';
  if (value === 'STRONG_STRETCH') return 'border-blue-300 bg-blue-50 text-blue-900';
  if (value === 'BUILDABLE') return 'border-amber-300 bg-amber-50 text-amber-950';
  if (value === 'ASPIRATIONAL') return 'border-violet-300 bg-violet-50 text-violet-950';
  return 'border-rose-300 bg-rose-50 text-rose-950';
}

function SignalList({
  title,
  items,
  empty,
  copy,
}: Readonly<{
  title: string;
  items: readonly OpportunityRequirementSignal[];
  empty?: string;
  copy: Copy;
}>) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">{title}</p>
      {items.length > 0 ? (
        <div className="mt-2 space-y-2">
          {items.slice(0, 5).map((item) => (
            <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-sm font-semibold leading-relaxed text-gray-900">{item.statement}</p>
              {item.evidenceStatements.length > 0 && (
                <div className="mt-2 space-y-1">
                  {item.evidenceStatements.slice(0, 2).map((statement) => (
                    <p key={statement} className="text-xs leading-relaxed text-gray-500">
                      <span className="font-semibold text-gray-600">{copy.evidence}:</span> “{statement}”
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : empty ? (
        <p className="mt-2 text-sm text-gray-500">{empty}</p>
      ) : null}
    </div>
  );
}

export default function OpportunityAssessmentCard({
  assessment,
}: Readonly<{ assessment: OpportunityAssessment }>) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const requiredCoverage = assessment.requiredCoverage === null ? '—' : `${assessment.requiredCoverage}%`;
  const preferredCoverage = assessment.preferredCoverage === null ? '—' : `${assessment.preferredCoverage}%`;

  return (
    <section className={`rounded-2xl border p-5 shadow-sm md:p-6 ${recommendationStyle(assessment.recommendation)}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="h-5 w-5" />
            <p className="text-xs font-bold uppercase tracking-[0.18em]">{copy.eyebrow}</p>
          </div>
          <h3 className="mt-3 text-2xl font-serif font-bold">{recommendationLabel(assessment.recommendation, copy)}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed opacity-90">{assessment.rationale}</p>
        </div>
        <div className="rounded-xl border border-current/20 bg-white/70 px-4 py-3 md:max-w-xs">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] opacity-70">{copy.question}</p>
          <p className="mt-1 text-sm font-bold">{decisionLabel(assessment.shouldApply, copy)}</p>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.15em] opacity-70">{copy.action}</p>
          <p className="mt-1 text-sm font-semibold">{actionLabel(assessment.nextAction, copy)}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-current/15 bg-white/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide opacity-60">{copy.requiredCoverage}</p>
          <p className="mt-1 text-xl font-bold">{requiredCoverage}</p>
        </div>
        <div className="rounded-lg border border-current/15 bg-white/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide opacity-60">{copy.preferredCoverage}</p>
          <p className="mt-1 text-xl font-bold">{preferredCoverage}</p>
        </div>
        <div className="rounded-lg border border-current/15 bg-white/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide opacity-60">{copy.criticalGaps}</p>
          <p className="mt-1 text-xl font-bold">{assessment.criticalGaps.length}</p>
        </div>
        <div className="rounded-lg border border-current/15 bg-white/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide opacity-60">{copy.eligibility}</p>
          <p className="mt-1 text-sm font-bold">{assessment.eligibility}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <SignalList title={copy.supports} items={assessment.strongEvidence} copy={copy} />
          {assessment.transferableEvidence.length > 0 && (
            <SignalList title={copy.transferable} items={assessment.transferableEvidence} copy={copy} />
          )}
        </div>
        <SignalList title={copy.missing} items={assessment.criticalGaps} empty={copy.noCriticalGaps} copy={copy} />
      </div>

      <div className="mt-5 flex gap-2 border-t border-current/15 pt-4 text-xs leading-relaxed opacity-70">
        {assessment.recommendation === 'READY_NOW' ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : assessment.recommendation === 'LOW_ALIGNMENT' ? (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : assessment.eligibility === 'UNCERTAIN' ? (
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <p>{assessment.scopeBoundary}</p>
      </div>
    </section>
  );
}
