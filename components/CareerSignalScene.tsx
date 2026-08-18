'use client';

import { useLanguage } from '@/components/LanguageProvider';

const COPY = {
  en: { evidence: 'Career evidence', target: 'Target', market: 'Market', decision: 'Decision' },
  es: { evidence: 'Evidencia', target: 'Objetivo', market: 'Mercado', decision: 'Decisión' },
  fr: { evidence: 'Preuves', target: 'Cible', market: 'Marché', decision: 'Décision' },
  pt: { evidence: 'Evidência', target: 'Objetivo', market: 'Mercado', decision: 'Decisão' },
} as const;

export default function CareerSignalScene() {
  const { language } = useLanguage();
  const copy = COPY[language];

  return (
    <div className="signal-scene" aria-hidden="true">
      <div className="signal-halo signal-halo-a" />
      <div className="signal-halo signal-halo-b" />
      <div className="signal-orbit signal-orbit-a">
        <span className="signal-node signal-node-a" />
      </div>
      <div className="signal-orbit signal-orbit-b">
        <span className="signal-node signal-node-b" />
      </div>
      <div className="signal-orbit signal-orbit-c">
        <span className="signal-node signal-node-c" />
      </div>

      <div className="signal-core">
        <div className="signal-core-inner">
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-100">CV</span>
          <span className="mt-1 text-lg font-serif font-bold text-white">Engine</span>
        </div>
      </div>

      <div className="signal-card signal-card-evidence">
        <span className="signal-dot bg-emerald-400" />
        {copy.evidence}
      </div>
      <div className="signal-card signal-card-target">
        <span className="signal-dot bg-cyan-400" />
        {copy.target}
      </div>
      <div className="signal-card signal-card-market">
        <span className="signal-dot bg-violet-400" />
        {copy.market}
      </div>
      <div className="signal-card signal-card-decision">
        <span className="signal-dot bg-amber-400" />
        {copy.decision}
      </div>
    </div>
  );
}
