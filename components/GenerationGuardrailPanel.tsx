'use client';

import { AlertTriangle, ChevronDown, PencilLine, ShieldCheck } from 'lucide-react';
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
    eyebrow: 'Truth guardrail',
    groundingTitle: 'We paused before adding unsupported career facts.',
    groundingBody: 'The draft contained wording that your current evidence does not fully support. Nothing was published as a trusted resume version.',
    semanticTitle: 'We paused because the wording may overstate your evidence.',
    semanticBody: 'The draft became stronger than the responsibility or scope currently documented in your career evidence.',
    compositionTitle: 'We could not build a fully traceable resume version.',
    compositionBody: 'The wording passed the truth checks, but the system could not safely bind every material resume claim to its supporting career assertions. No ResumeVersion was emitted and no storage attempt is implied.',
    persistenceTitle: 'We could not safely save this version.',
    persistenceBody: 'The resume was not presented as durably saved because Career Vault could not complete its integrity or storage contract.',
    genericTitle: 'Generation stopped safely.',
    genericBody: 'The trusted pipeline stopped instead of returning a result that failed one of its contracts.',
    proposed: 'Review first',
    action: 'Edit my career evidence',
    note: 'Confirm or add only information that is genuinely true. Missing evidence is acceptable; invented evidence is not.',
    compositionNote: 'Your career evidence was not changed. This is a claim-traceability/materialization failure, not a Career Vault storage failure.',
    more: 'Show every item',
    technical: 'Technical detail',
    count: (visible: number, total: number) => `${visible} of ${total} items shown`,
  },
  es: {
    eyebrow: 'Guardrail de verdad',
    groundingTitle: 'Pausamos antes de agregar hechos profesionales sin respaldo.',
    groundingBody: 'El borrador contenía redacción que tu evidencia actual no respalda por completo. No se publicó ninguna versión confiable del CV.',
    semanticTitle: 'Pausamos porque la redacción podría exagerar tu evidencia.',
    semanticBody: 'El borrador se volvió más fuerte que la responsabilidad o el alcance documentados actualmente en tu evidencia profesional.',
    compositionTitle: 'No pudimos construir una versión del CV completamente trazable.',
    compositionBody: 'La redacción pasó los controles de verdad, pero el sistema no pudo vincular de forma segura cada claim material del CV con las afirmaciones profesionales que lo respaldan. No se emitió ninguna ResumeVersion y esto no implica un intento fallido de almacenamiento.',
    persistenceTitle: 'No pudimos guardar esta versión de forma segura.',
    persistenceBody: 'El CV no se presentó como guardado porque Career Vault no pudo completar su contrato de integridad o almacenamiento.',
    genericTitle: 'La generación se detuvo de forma segura.',
    genericBody: 'El pipeline confiable se detuvo en lugar de devolver un resultado que incumplía uno de sus contratos.',
    proposed: 'Revisa primero',
    action: 'Editar mi evidencia profesional',
    note: 'Confirma o agrega únicamente información que sea realmente cierta. Puede faltar evidencia; no puede inventarse.',
    compositionNote: 'Tu evidencia profesional no fue modificada. Este es un fallo de trazabilidad/materialización de claims, no un fallo de almacenamiento de Career Vault.',
    more: 'Ver todos los elementos',
    technical: 'Detalle técnico',
    count: (visible: number, total: number) => `Mostrando ${visible} de ${total} elementos`,
  },
  fr: {
    eyebrow: 'Garde-fou de vérité',
    groundingTitle: 'Nous avons interrompu avant d’ajouter des faits professionnels non étayés.',
    groundingBody: "Le brouillon contient une formulation que vos preuves actuelles ne soutiennent pas entièrement. Aucune version fiable du CV n'a été publiée.",
    semanticTitle: 'Nous avons interrompu car la formulation peut exagérer vos preuves.',
    semanticBody: 'Le brouillon dépasse la responsabilité ou la portée actuellement documentée.',
    compositionTitle: "Nous n'avons pas pu construire une version du CV entièrement traçable.",
    compositionBody: "La formulation a passé les contrôles de vérité, mais le système n'a pas pu relier en toute sécurité chaque claim matériel aux assertions de carrière qui le soutiennent. Aucune ResumeVersion n'a été émise et cela n'indique pas un échec de stockage.",
    persistenceTitle: "Cette version n'a pas pu être enregistrée en toute sécurité.",
    persistenceBody: "Le CV n'est pas présenté comme sauvegardé car Career Vault n'a pas pu satisfaire son contrat d'intégrité ou de stockage.",
    genericTitle: 'La génération a été arrêtée en toute sécurité.',
    genericBody: "Le pipeline fiable s'est arrêté plutôt que de retourner un résultat invalide.",
    proposed: 'À vérifier',
    action: 'Modifier mes preuves',
    note: "Confirmez uniquement des informations vraies. Une preuve peut manquer ; elle ne doit pas être inventée.",
    compositionNote: "Vos preuves de carrière n'ont pas été modifiées. Il s'agit d'un échec de traçabilité/matérialisation, pas d'un échec de stockage Career Vault.",
    more: 'Voir tous les éléments',
    technical: 'Détail technique',
    count: (visible: number, total: number) => `${visible} éléments affichés sur ${total}`,
  },
  pt: {
    eyebrow: 'Guardrail de verdade',
    groundingTitle: 'Pausamos antes de adicionar fatos profissionais sem respaldo.',
    groundingBody: 'O rascunho contém uma redação que sua evidência atual não sustenta por completo. Nenhuma versão confiável do currículo foi publicada.',
    semanticTitle: 'Pausamos porque a redação pode exagerar sua evidência.',
    semanticBody: 'O rascunho ficou mais forte que a responsabilidade ou o escopo atualmente documentados.',
    compositionTitle: 'Não foi possível construir uma versão do currículo totalmente rastreável.',
    compositionBody: 'A redação passou pelos controles de verdade, mas o sistema não conseguiu vincular com segurança cada claim material às afirmações profissionais que o sustentam. Nenhuma ResumeVersion foi emitida e isso não indica uma falha de armazenamento.',
    persistenceTitle: 'Não foi possível salvar esta versão com segurança.',
    persistenceBody: 'O currículo não foi apresentado como salvo porque o Career Vault não concluiu seu contrato de integridade ou armazenamento.',
    genericTitle: 'A geração parou com segurança.',
    genericBody: 'O pipeline confiável parou em vez de retornar um resultado que violava seus contratos.',
    proposed: 'Revise primeiro',
    action: 'Editar minha evidência profissional',
    note: 'Confirme ou adicione apenas informações realmente verdadeiras. Evidência pode faltar; não pode ser inventada.',
    compositionNote: 'Sua evidência profissional não foi alterada. Esta é uma falha de rastreabilidade/materialização de claims, não uma falha de armazenamento do Career Vault.',
    more: 'Ver todos os itens',
    technical: 'Detalhe técnico',
    count: (visible: number, total: number) => `Mostrando ${visible} de ${total} itens`,
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
  const allProposed = [...(failure.grounding?.factsToConfirm ?? []), ...semanticClaims]
    .filter((value, index, values) => values.indexOf(value) === index);
  const visible = allProposed.slice(0, 5);

  const isGrounding = Boolean(failure.grounding);
  const isSemantic = Boolean(failure.semanticGrounding);
  const isComposition = Boolean(failure.composition);
  const isPersistence = Boolean(failure.persistence);

  const title = isGrounding
    ? copy.groundingTitle
    : isSemantic
      ? copy.semanticTitle
      : isComposition
        ? copy.compositionTitle
        : isPersistence
          ? copy.persistenceTitle
          : copy.genericTitle;
  const body = isGrounding
    ? copy.groundingBody
    : isSemantic
      ? copy.semanticBody
      : isComposition
        ? copy.compositionBody
        : isPersistence
          ? copy.persistenceBody
          : copy.genericBody;
  const note = isComposition ? copy.compositionNote : copy.note;

  return (
    <section className="overflow-hidden rounded-[28px] border border-amber-200/80 bg-white shadow-[0_24px_70px_rgba(120,53,15,0.10)]" role="alert">
      <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400" />
      <div className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-950 text-amber-50 shadow-lg shadow-amber-950/15">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">{copy.eyebrow}</p>
            <h3 className="mt-2 font-serif text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h3>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{body}</p>
          </div>
        </div>

        {visible.length > 0 ? (
          <div className="mt-7">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-600">{copy.proposed}</p>
              <p className="text-[11px] text-slate-400">{copy.count(visible.length, allProposed.length)}</p>
            </div>
            <div className="mt-3 grid gap-2">
              {visible.map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-3.5 text-sm leading-5 text-slate-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            {allProposed.length > visible.length ? (
              <details className="group mt-3 rounded-2xl border border-slate-200 bg-slate-50/80">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-bold text-slate-600">
                  {copy.more}
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-slate-200 px-4 py-3">
                  <ul className="space-y-2 text-xs leading-5 text-slate-600">
                    {allProposed.map((item) => <li key={item}>• {item}</li>)}
                  </ul>
                </div>
              </details>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
          <p className="text-xs leading-5 text-emerald-950">{note}</p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {(isGrounding || isSemantic) ? (
            <button
              type="button"
              onClick={onEditDetails}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-slate-950/10 transition hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
            >
              <PencilLine className="h-4 w-4" /> {copy.action}
            </button>
          ) : null}

          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer select-none font-semibold hover:text-slate-600">{copy.technical}</summary>
            <p className="mt-2 max-w-3xl rounded-xl bg-slate-50 p-3 font-mono text-[10px] leading-5 text-slate-500">{failure.error}</p>
          </details>
        </div>
      </div>
    </section>
  );
}
