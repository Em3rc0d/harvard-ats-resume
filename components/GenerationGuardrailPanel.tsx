'use client';

import { AlertTriangle, PencilLine, ShieldAlert } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';

export interface GenerationFailurePayload {
  readonly error: string;
  readonly grounding?: {
    readonly status?: string;
    readonly factsToConfirm?: readonly string[];
  };
  readonly semanticGrounding?: {
    readonly status?: string;
    readonly issues?: readonly { readonly generatedClaim?: string }[];
  };
  readonly persistence?: { readonly status?: string };
  readonly composition?: { readonly status?: string };
}

interface GenerationGuardrailPanelProps {
  readonly failure: GenerationFailurePayload;
  readonly onEditDetails: () => void;
}

const COPY = {
  en: {
    groundingTitle: 'We protected your career facts.',
    groundingBody: 'The draft proposed wording that is not yet supported by the information you provided. ATS v2 stopped before publishing a stronger claim.',
    semanticTitle: 'This wording may overstate your evidence.',
    semanticBody: 'The draft appears stronger than the underlying responsibility or scope documented in your career evidence.',
    persistenceTitle: 'We could not safely save this version.',
    persistenceBody: 'The resume was not presented as durably saved because the Career Vault could not complete its integrity or storage contract.',
    genericTitle: 'Generation needs attention.',
    genericBody: 'The trusted resume pipeline stopped instead of silently returning a result that failed one of its contracts.',
    proposed: 'Review these items',
    action: 'Edit my career evidence',
    note: 'Only confirm or add information that is genuinely true. Missing evidence is allowed; invented evidence is not.',
  },
  es: {
    groundingTitle: 'Protegimos los hechos de tu carrera.',
    groundingBody: 'El borrador propuso contenido que aún no está respaldado por la información que proporcionaste. ATS v2 se detuvo antes de publicar una afirmación más fuerte.',
    semanticTitle: 'Esta redacción podría exagerar tu evidencia.',
    semanticBody: 'El borrador parece más fuerte que la responsabilidad o el alcance documentados en tu evidencia profesional.',
    persistenceTitle: 'No pudimos guardar esta versión de forma segura.',
    persistenceBody: 'El CV no se presentó como guardado de forma durable porque Career Vault no pudo completar su contrato de integridad o almacenamiento.',
    genericTitle: 'La generación necesita atención.',
    genericBody: 'El pipeline confiable se detuvo en lugar de devolver silenciosamente un resultado que incumplía uno de sus contratos.',
    proposed: 'Revisa estos elementos',
    action: 'Editar mi evidencia profesional',
    note: 'Confirma o agrega únicamente información que sea realmente cierta. Puede faltar evidencia; no puede inventarse.',
  },
  fr: {
    groundingTitle: 'Nous avons protégé les faits de votre carrière.',
    groundingBody: "Le brouillon proposait un contenu qui n'est pas encore étayé par vos informations. ATS v2 s'est arrêté avant de publier une affirmation plus forte.",
    semanticTitle: 'Cette formulation peut exagérer vos preuves.',
    semanticBody: 'Le brouillon semble plus fort que la responsabilité ou la portée documentée dans vos preuves professionnelles.',
    persistenceTitle: "Cette version n'a pas pu être enregistrée en toute sécurité.",
    persistenceBody: "Le CV n'est pas présenté comme durablement sauvegardé car Career Vault n'a pas pu satisfaire son contrat d'intégrité ou de stockage.",
    genericTitle: 'La génération nécessite votre attention.',
    genericBody: "Le pipeline fiable s'est arrêté au lieu de retourner silencieusement un résultat qui violait un contrat.",
    proposed: 'Éléments à revoir',
    action: 'Modifier mes preuves',
    note: "Confirmez ou ajoutez uniquement des informations vraies. Une preuve peut manquer ; elle ne doit pas être inventée.",
  },
  pt: {
    groundingTitle: 'Protegemos os fatos da sua carreira.',
    groundingBody: 'O rascunho propôs conteúdo que ainda não é respaldado pelas informações fornecidas. ATS v2 parou antes de publicar uma afirmação mais forte.',
    semanticTitle: 'Esta redação pode exagerar sua evidência.',
    semanticBody: 'O rascunho parece mais forte que a responsabilidade ou o escopo documentados na sua evidência profissional.',
    persistenceTitle: 'Não foi possível salvar esta versão com segurança.',
    persistenceBody: 'O currículo não foi apresentado como salvo de forma durável porque o Career Vault não concluiu seu contrato de integridade ou armazenamento.',
    genericTitle: 'A geração precisa de atenção.',
    genericBody: 'O pipeline confiável parou em vez de retornar silenciosamente um resultado que falhou em um de seus contratos.',
    proposed: 'Revise estes itens',
    action: 'Editar minha evidência profissional',
    note: 'Confirme ou adicione apenas informações realmente verdadeiras. Evidência pode faltar; não pode ser inventada.',
  },
} as const;

export default function GenerationGuardrailPanel({
  failure,
  onEditDetails,
}: Readonly<GenerationGuardrailPanelProps>) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const semanticClaims = failure.semanticGrounding?.issues
    ?.map((issue) => issue.generatedClaim?.trim())
    .filter((claim): claim is string => Boolean(claim)) ?? [];
  const proposed = [...(failure.grounding?.factsToConfirm ?? []), ...semanticClaims]
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 5);

  const isGrounding = Boolean(failure.grounding);
  const isSemantic = Boolean(failure.semanticGrounding);
  const isPersistence = Boolean(failure.persistence || failure.composition);

  const title = isGrounding
    ? copy.groundingTitle
    : isSemantic
      ? copy.semanticTitle
      : isPersistence
        ? copy.persistenceTitle
        : copy.genericTitle;
  const body = isGrounding
    ? copy.groundingBody
    : isSemantic
      ? copy.semanticBody
      : isPersistence
        ? copy.persistenceBody
        : copy.genericBody;

  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-amber-300 bg-amber-50 shadow-sm" role="alert">
      <div className="flex gap-4 p-5 md:p-6">
        <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-amber-950">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-amber-900">{body}</p>
          <p className="mt-2 text-xs leading-relaxed text-amber-800">{failure.error}</p>

          {proposed.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800">{copy.proposed}</p>
              <div className="mt-2 space-y-2">
                {proposed.map((item) => (
                  <div key={item} className="flex gap-2 rounded-lg border border-amber-200 bg-white/70 p-3 text-sm text-gray-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="mt-5 text-xs leading-relaxed text-amber-900">{copy.note}</p>
          {(isGrounding || isSemantic) && (
            <button
              type="button"
              onClick={onEditDetails}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-amber-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-800"
            >
              <PencilLine className="h-4 w-4" /> {copy.action}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
