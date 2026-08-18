'use client';

import { useState } from 'react';
import { ArrowRight, BadgeCheck, CircleAlert, Scale, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';

const COPY = {
  en: {
    eyebrow: 'Responsible use',
    title: 'Before you continue',
    body: 'CV Engine helps you organize career evidence, improve presentation and analyze opportunities. It does not guarantee ATS ranking, interviews, offers or employment.',
    truth: 'Use only information that is true and that you can defend.',
    noFraud: 'Do not use this service to fabricate experience, education, identity, credentials, metrics or achievements.',
    review: 'Review every material fact before submitting an application. You remain responsible for what you choose to send.',
    note: 'Use CV Engine only for lawful, honest and responsible purposes.',
    accept: 'I understand — continue with real information',
  },
  es: {
    eyebrow: 'Uso responsable',
    title: 'Antes de continuar',
    body: 'CV Engine ayuda a organizar evidencia profesional, mejorar su presentación y analizar oportunidades. No garantiza ranking ATS, entrevistas, ofertas ni empleo.',
    truth: 'Usa únicamente información verdadera y que puedas defender.',
    noFraud: 'No uses este servicio para inventar experiencia, estudios, identidad, credenciales, métricas o logros.',
    review: 'Revisa cada hecho material antes de enviar una postulación. Tú sigues siendo responsable de lo que decides compartir.',
    note: 'Usa CV Engine únicamente con fines legales, honestos y responsables.',
    accept: 'Entiendo — continuaré con información real',
  },
  fr: {
    eyebrow: 'Utilisation responsable',
    title: 'Avant de continuer',
    body: "CV Engine aide à organiser vos preuves professionnelles, améliorer leur présentation et analyser des opportunités. Il ne garantit ni classement ATS, ni entretien, ni offre, ni emploi.",
    truth: 'Utilisez uniquement des informations vraies que vous pouvez défendre.',
    noFraud: "N'utilisez pas ce service pour inventer une expérience, une formation, une identité, des justificatifs, des métriques ou des réalisations.",
    review: "Vérifiez chaque fait important avant d'envoyer une candidature. Vous restez responsable de ce que vous choisissez de transmettre.",
    note: "Utilisez CV Engine uniquement à des fins légales, honnêtes et responsables.",
    accept: 'Je comprends — continuer avec des informations réelles',
  },
  pt: {
    eyebrow: 'Uso responsável',
    title: 'Antes de continuar',
    body: 'O CV Engine ajuda a organizar evidências profissionais, melhorar a apresentação e analisar oportunidades. Ele não garante ranking ATS, entrevistas, ofertas ou emprego.',
    truth: 'Use somente informações verdadeiras e que você possa comprovar.',
    noFraud: 'Não use este serviço para inventar experiência, formação, identidade, credenciais, métricas ou conquistas.',
    review: 'Revise cada fato relevante antes de enviar uma candidatura. Você continua responsável pelo que decide compartilhar.',
    note: 'Use o CV Engine somente para fins legais, honestos e responsáveis.',
    accept: 'Entendi — continuar com informações reais',
  },
} as const;

export default function TrustDisclaimer() {
  const { language } = useLanguage();
  const [accepted, setAccepted] = useState(false);
  const copy = COPY[language];

  if (accepted) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/70 px-4 py-6 backdrop-blur-xl" role="presentation">
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/15 bg-white shadow-[0_35px_100px_rgba(15,23,42,0.38)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="responsible-use-title"
        aria-describedby="responsible-use-description"
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-blue-600 to-violet-600" />
        <div className="relative p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">{copy.eyebrow}</p>
              <h2 id="responsible-use-title" className="mt-2 font-serif text-3xl font-bold tracking-tight text-slate-950">
                {copy.title}
              </h2>
              <p id="responsible-use-description" className="mt-3 text-sm leading-6 text-slate-600 sm:text-[15px]">
                {copy.body}
              </p>
            </div>
          </div>

          <div className="mt-7 grid gap-3">
            <div className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <p className="text-sm leading-6 text-emerald-950">{copy.truth}</p>
            </div>
            <div className="flex gap-3 rounded-2xl border border-amber-100 bg-amber-50/75 p-4">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <p className="text-sm leading-6 text-amber-950">{copy.noFraud}</p>
            </div>
            <div className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" />
              <p className="text-sm leading-6 text-slate-700">{copy.review}</p>
            </div>
          </div>

          <p className="mt-6 text-xs leading-5 text-slate-500">{copy.note}</p>

          <button
            type="button"
            autoFocus
            onClick={() => setAccepted(true)}
            className="group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-950/15 transition duration-300 hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            {copy.accept}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </div>
  );
}
