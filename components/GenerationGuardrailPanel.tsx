'use client';

import { AlertTriangle, ChevronDown, PencilLine, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';

export interface GenerationFailurePayload {
  readonly error: string;
  readonly grounding?: {
    readonly status?: string;
    readonly factsToConfirm?: readonly string[];
    readonly violations?: readonly {
      readonly kind?: string;
      readonly value?: string;
      readonly message?: string;
      readonly source?: string;
    }[];
  };
  readonly semanticGrounding?: {
    readonly status?: string;
    readonly issues?: readonly { readonly generatedClaim?: string }[];
  };
  readonly persistence?: {
    readonly status?: string;
    readonly stage?: string;
    readonly reason?: string;
    readonly retryable?: boolean;
  };
  readonly provider?: {
    readonly status?: string;
    readonly contractVersion?: string;
    readonly provider?: string;
    readonly kind?: string;
    readonly retryable?: boolean;
    readonly retryAfterSeconds?: number;
  };
  readonly composition?: { readonly status?: string };
}

interface GenerationGuardrailPanelProps {
  readonly failure: GenerationFailurePayload;
  readonly onEditDetails: () => void;
}

const COPY = {
  en: {
    truthEyebrow: 'Truth guardrail', traceabilityEyebrow: 'Traceability guardrail', durabilityEyebrow: 'Durability guardrail', providerEyebrow: 'Provider availability', pipelineEyebrow: 'Trusted pipeline',
    groundingTitle: 'Some draft facts still need your evidence.', groundingBody: 'They may be true, but they are not yet represented in your current Career Evidence. We paused instead of assuming. Nothing was published as a trusted resume version.',
    semanticTitle: 'We paused because the wording may overstate your evidence.', semanticBody: 'The draft became stronger than the responsibility or scope currently documented in your career evidence.',
    compositionTitle: 'We could not build a fully traceable resume version.', compositionBody: 'The wording passed the truth checks, but the system could not safely bind every material resume claim to its supporting career assertions. No ResumeVersion was emitted and no storage attempt is implied.',
    persistencePreflightTitle: 'Durable storage is unavailable right now.', persistencePreflightBody: 'CV Engine stopped before generation or durable decision work because the shared persistence backend was not ready. No model output or target state is being presented as saved.',
    persistenceTitle: 'We could not safely save this version.', persistenceBody: 'The operation reached its durable commit boundary but the storage or integrity contract could not be completed. Nothing is presented as durably saved.',
    providerQuotaTitle: 'The AI provider quota is exhausted right now.', providerQuotaBody: 'CV Engine stopped the provider-dependent step before emitting a trusted resume version. Your Career Evidence was not changed.',
    providerAuthTitle: 'The AI provider cannot be authenticated.', providerAuthBody: 'CV Engine stopped because the configured provider credentials were rejected or unavailable. This is an operator configuration problem, not a problem with your Career Evidence.',
    providerTransientTitle: 'The AI provider is temporarily unavailable.', providerTransientBody: 'CV Engine stopped the provider-dependent step safely. No untrusted model result was emitted as a ResumeVersion.',
    genericTitle: 'Generation stopped safely.', genericBody: 'The trusted pipeline stopped instead of returning a result that failed one of its contracts.',
    proposed: 'Needs evidence', action: 'Review / add career evidence',
    evidenceNote: 'If an item is true, add or confirm it in the matching Career Evidence field. That makes it candidate-asserted evidence; it does not make it externally verified. If it is false or uncertain, leave it out.',
    compositionNote: 'Your career evidence was not changed. This is a claim-traceability/materialization failure, not a Career Vault storage failure.',
    persistenceNote: 'Your Career Evidence is not the problem here. Retry only after durable storage is available; changing career facts cannot repair an infrastructure failure.',
    providerRetryNote: 'Your Career Evidence is not the problem. Retrying is safe when the provider becomes available again.',
    providerStopNote: 'Your Career Evidence is not the problem. Repeating the same request cannot repair the current provider condition; the provider quota or credentials must be corrected first.',
    genericNote: 'No trusted state was emitted from the failed pipeline stage.', more: 'Show every item', technical: 'Technical detail',
    count: (visible: number, total: number) => `${visible} of ${total} items shown`,
  },
  es: {
    truthEyebrow: 'Guardrail de verdad', traceabilityEyebrow: 'Guardrail de trazabilidad', durabilityEyebrow: 'Guardrail de durabilidad', providerEyebrow: 'Disponibilidad del proveedor', pipelineEyebrow: 'Pipeline confiable',
    groundingTitle: 'Algunos hechos del borrador aún necesitan tu evidencia.', groundingBody: 'Pueden ser verdaderos, pero todavía no están representados en tu Evidencia Profesional actual. Pausamos en lugar de asumir. No se publicó ninguna versión confiable del CV.',
    semanticTitle: 'Pausamos porque la redacción podría exagerar tu evidencia.', semanticBody: 'El borrador se volvió más fuerte que la responsabilidad o el alcance documentados actualmente en tu evidencia profesional.',
    compositionTitle: 'No pudimos construir una versión del CV completamente trazable.', compositionBody: 'La redacción pasó los controles de verdad, pero el sistema no pudo vincular de forma segura cada claim material del CV con las afirmaciones profesionales que lo respaldan. No se emitió ninguna ResumeVersion y esto no implica un intento fallido de almacenamiento.',
    persistencePreflightTitle: 'El almacenamiento durable no está disponible en este momento.', persistencePreflightBody: 'CV Engine se detuvo antes de generar o crear decisiones durables porque el backend compartido de persistencia no estaba listo. Ninguna salida del modelo ni estado de target se presenta como guardado.',
    persistenceTitle: 'No pudimos guardar esta versión de forma segura.', persistenceBody: 'La operación llegó a su frontera de commit durable, pero no pudo completar el contrato de almacenamiento o integridad. Nada se presenta como guardado de forma durable.',
    providerQuotaTitle: 'La cuota del proveedor de IA está agotada.', providerQuotaBody: 'CV Engine detuvo la etapa que depende del proveedor antes de emitir una versión confiable del CV. Tu Evidencia Profesional no fue modificada.',
    providerAuthTitle: 'No se pudo autenticar con el proveedor de IA.', providerAuthBody: 'CV Engine se detuvo porque las credenciales configuradas fueron rechazadas o no están disponibles. Es un problema de configuración del operador, no de tu Evidencia Profesional.',
    providerTransientTitle: 'El proveedor de IA no está disponible temporalmente.', providerTransientBody: 'CV Engine detuvo la etapa dependiente del proveedor de forma segura. Ninguna salida no confiable del modelo se emitió como ResumeVersion.',
    genericTitle: 'La generación se detuvo de forma segura.', genericBody: 'El pipeline confiable se detuvo en lugar de devolver un resultado que incumplía uno de sus contratos.',
    proposed: 'Necesita evidencia', action: 'Revisar / agregar evidencia profesional',
    evidenceNote: 'Si un elemento es verdadero, agrégalo o confírmalo en el campo correspondiente de Evidencia Profesional. Eso lo convierte en evidencia declarada por el candidato; no en un hecho verificado externamente. Si es falso o incierto, déjalo fuera.',
    compositionNote: 'Tu evidencia profesional no fue modificada. Este es un fallo de trazabilidad/materialización de claims, no un fallo de almacenamiento de Career Vault.',
    persistenceNote: 'Tu Evidencia Profesional no es el problema. Reintenta sólo cuando el almacenamiento durable esté disponible; cambiar hechos profesionales no puede reparar una falla de infraestructura.',
    providerRetryNote: 'Tu Evidencia Profesional no es el problema. Reintentar es seguro cuando el proveedor vuelva a estar disponible.',
    providerStopNote: 'Tu Evidencia Profesional no es el problema. Repetir la misma solicitud no puede reparar la condición actual; primero debe resolverse la cuota o las credenciales del proveedor.',
    genericNote: 'No se emitió estado confiable desde la etapa del pipeline que falló.', more: 'Ver todos los elementos', technical: 'Detalle técnico',
    count: (visible: number, total: number) => `Mostrando ${visible} de ${total} elementos`,
  },
  fr: {
    truthEyebrow: 'Garde-fou de vérité', traceabilityEyebrow: 'Garde-fou de traçabilité', durabilityEyebrow: 'Garde-fou de durabilité', providerEyebrow: 'Disponibilité du fournisseur', pipelineEyebrow: 'Pipeline fiable',
    groundingTitle: 'Certains faits du brouillon nécessitent encore vos preuves.', groundingBody: "Ils peuvent être vrais, mais ne sont pas encore représentés dans vos preuves de carrière actuelles. Nous avons interrompu plutôt que de supposer. Aucune version fiable du CV n'a été publiée.",
    semanticTitle: 'Nous avons interrompu car la formulation peut exagérer vos preuves.', semanticBody: 'Le brouillon dépasse la responsabilité ou la portée actuellement documentée.',
    compositionTitle: "Nous n'avons pas pu construire une version du CV entièrement traçable.", compositionBody: "La formulation a passé les contrôles de vérité, mais le système n'a pas pu relier en toute sécurité chaque claim matériel aux assertions de carrière qui le soutiennent. Aucune ResumeVersion n'a été émise et cela n'indique pas un échec de stockage.",
    persistencePreflightTitle: 'Le stockage durable est indisponible pour le moment.', persistencePreflightBody: "CV Engine s'est arrêté avant la génération ou les décisions durables car le backend de persistance partagé n'était pas prêt. Aucun résultat de modèle ni état de cible n'est présenté comme enregistré.",
    persistenceTitle: "Cette version n'a pas pu être enregistrée en toute sécurité.", persistenceBody: "L'opération a atteint sa frontière de commit durable, mais le contrat de stockage ou d'intégrité n'a pas pu être terminé. Rien n'est présenté comme enregistré durablement.",
    providerQuotaTitle: "Le quota du fournisseur d'IA est épuisé.", providerQuotaBody: "CV Engine a arrêté l'étape dépendante du fournisseur avant d'émettre une version fiable du CV. Vos preuves de carrière n'ont pas été modifiées.",
    providerAuthTitle: "L'authentification auprès du fournisseur d'IA a échoué.", providerAuthBody: "CV Engine s'est arrêté car les identifiants configurés ont été refusés ou sont indisponibles. Il s'agit d'un problème de configuration, pas de vos preuves de carrière.",
    providerTransientTitle: "Le fournisseur d'IA est temporairement indisponible.", providerTransientBody: "CV Engine a arrêté l'étape dépendante du fournisseur en toute sécurité. Aucun résultat non fiable n'a été émis comme ResumeVersion.",
    genericTitle: 'La génération a été arrêtée en toute sécurité.', genericBody: "Le pipeline fiable s'est arrêté plutôt que de retourner un résultat invalide.",
    proposed: 'Preuve nécessaire', action: 'Vérifier / ajouter des preuves',
    evidenceNote: "Si un élément est vrai, ajoutez-le ou confirmez-le dans le champ de preuve correspondant. Il devient alors une preuve déclarée par le candidat, et non un fait vérifié par une source externe. S'il est faux ou incertain, laissez-le de côté.",
    compositionNote: "Vos preuves de carrière n'ont pas été modifiées. Il s'agit d'un échec de traçabilité/matérialisation, pas d'un échec de stockage Career Vault.",
    persistenceNote: "Vos preuves de carrière ne sont pas en cause. Réessayez seulement lorsque le stockage durable est disponible; modifier vos faits de carrière ne peut pas réparer une panne d'infrastructure.",
    providerRetryNote: "Vos preuves de carrière ne sont pas en cause. Il est sûr de réessayer lorsque le fournisseur redevient disponible.",
    providerStopNote: "Vos preuves de carrière ne sont pas en cause. Répéter la même requête ne corrigera pas cette condition; le quota ou les identifiants du fournisseur doivent d'abord être corrigés.",
    genericNote: "Aucun état fiable n'a été émis depuis l'étape du pipeline en échec.", more: 'Voir tous les éléments', technical: 'Détail technique',
    count: (visible: number, total: number) => `${visible} éléments affichés sur ${total}`,
  },
  pt: {
    truthEyebrow: 'Guardrail de verdade', traceabilityEyebrow: 'Guardrail de rastreabilidade', durabilityEyebrow: 'Guardrail de durabilidade', providerEyebrow: 'Disponibilidade do provedor', pipelineEyebrow: 'Pipeline confiável',
    groundingTitle: 'Alguns fatos do rascunho ainda precisam da sua evidência.', groundingBody: 'Eles podem ser verdadeiros, mas ainda não estão representados na sua Evidência Profissional atual. Pausamos em vez de assumir. Nenhuma versão confiável do currículo foi publicada.',
    semanticTitle: 'Pausamos porque a redação pode exagerar sua evidência.', semanticBody: 'O rascunho ficou mais forte que a responsabilidade ou o escopo atualmente documentados.',
    compositionTitle: 'Não foi possível construir uma versão do currículo totalmente rastreável.', compositionBody: 'A redação passou pelos controles de verdade, mas o sistema não conseguiu vincular com segurança cada claim material às afirmações profissionais que o sustentam. Nenhuma ResumeVersion foi emitida e isso não indica uma falha de armazenamento.',
    persistencePreflightTitle: 'O armazenamento durável está indisponível no momento.', persistencePreflightBody: 'O CV Engine parou antes da geração ou de decisões duráveis porque o backend compartilhado de persistência não estava pronto. Nenhuma saída do modelo nem estado de target é apresentado como salvo.',
    persistenceTitle: 'Não foi possível salvar esta versão com segurança.', persistenceBody: 'A operação chegou à fronteira de commit durável, mas o contrato de armazenamento ou integridade não pôde ser concluído. Nada é apresentado como salvo de forma durável.',
    providerQuotaTitle: 'A cota do provedor de IA está esgotada.', providerQuotaBody: 'O CV Engine interrompeu a etapa dependente do provedor antes de emitir uma versão confiável. Sua Evidência Profissional não foi alterada.',
    providerAuthTitle: 'Não foi possível autenticar no provedor de IA.', providerAuthBody: 'O CV Engine parou porque as credenciais configuradas foram rejeitadas ou estão indisponíveis. É um problema de configuração do operador, não da sua Evidência Profissional.',
    providerTransientTitle: 'O provedor de IA está temporariamente indisponível.', providerTransientBody: 'O CV Engine interrompeu a etapa dependente do provedor com segurança. Nenhuma saída não confiável foi emitida como ResumeVersion.',
    genericTitle: 'A geração parou com segurança.', genericBody: 'O pipeline confiável parou em vez de retornar um resultado que violava seus contratos.',
    proposed: 'Precisa de evidência', action: 'Revisar / adicionar evidência profissional',
    evidenceNote: 'Se um item for verdadeiro, adicione-o ou confirme-o no campo correspondente de Evidência Profissional. Isso o torna evidência declarada pelo candidato; não um fato verificado externamente. Se for falso ou incerto, deixe-o de fora.',
    compositionNote: 'Sua evidência profissional não foi alterada. Esta é uma falha de rastreabilidade/materialização de claims, não uma falha de armazenamento do Career Vault.',
    persistenceNote: 'Sua Evidência Profissional não é o problema aqui. Tente novamente apenas quando o armazenamento durável estiver disponível; alterar fatos profissionais não pode reparar uma falha de infraestrutura.',
    providerRetryNote: 'Sua Evidência Profissional não é o problema. É seguro tentar novamente quando o provedor voltar a ficar disponível.',
    providerStopNote: 'Sua Evidência Profissional não é o problema. Repetir a mesma solicitação não corrige a condição atual; primeiro é preciso resolver a cota ou as credenciais do provedor.',
    genericNote: 'Nenhum estado confiável foi emitido pela etapa do pipeline que falhou.', more: 'Ver todos os itens', technical: 'Detalhe técnico',
    count: (visible: number, total: number) => `Mostrando ${visible} de ${total} itens`,
  },
} as const;

export default function GenerationGuardrailPanel({ failure, onEditDetails }: Readonly<GenerationGuardrailPanelProps>) {
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
  const isProvider = Boolean(failure.provider);
  const isPreflight = failure.persistence?.stage === 'PREFLIGHT';
  const providerKind = failure.provider?.kind;
  const providerTitle = providerKind === 'QUOTA_EXHAUSTED'
    ? copy.providerQuotaTitle
    : providerKind === 'AUTHENTICATION_FAILED'
      ? copy.providerAuthTitle
      : copy.providerTransientTitle;
  const providerBody = providerKind === 'QUOTA_EXHAUSTED'
    ? copy.providerQuotaBody
    : providerKind === 'AUTHENTICATION_FAILED'
      ? copy.providerAuthBody
      : copy.providerTransientBody;

  const eyebrow = isGrounding || isSemantic
    ? copy.truthEyebrow
    : isComposition
      ? copy.traceabilityEyebrow
      : isPersistence
        ? copy.durabilityEyebrow
        : isProvider
          ? copy.providerEyebrow
          : copy.pipelineEyebrow;
  const title = isGrounding
    ? copy.groundingTitle
    : isSemantic
      ? copy.semanticTitle
      : isComposition
        ? copy.compositionTitle
        : isPersistence
          ? (isPreflight ? copy.persistencePreflightTitle : copy.persistenceTitle)
          : isProvider
            ? providerTitle
            : copy.genericTitle;
  const body = isGrounding
    ? copy.groundingBody
    : isSemantic
      ? copy.semanticBody
      : isComposition
        ? copy.compositionBody
        : isPersistence
          ? (isPreflight ? copy.persistencePreflightBody : copy.persistenceBody)
          : isProvider
            ? providerBody
            : copy.genericBody;
  const note = isGrounding || isSemantic
    ? copy.evidenceNote
    : isComposition
      ? copy.compositionNote
      : isPersistence
        ? copy.persistenceNote
        : isProvider
          ? (failure.provider?.retryable === false ? copy.providerStopNote : copy.providerRetryNote)
          : copy.genericNote;

  return (
    <section className="overflow-hidden rounded-[28px] border border-amber-200/80 bg-white shadow-[0_24px_70px_rgba(120,53,15,0.10)]" role="alert">
      <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400" />
      <div className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-950 text-amber-50 shadow-lg shadow-amber-950/15"><ShieldCheck className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">{eyebrow}</p>
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
                  {copy.more}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-slate-200 px-4 py-3">
                  <ul className="space-y-2 text-xs leading-5 text-slate-600">{allProposed.map((item) => <li key={item}>• {item}</li>)}</ul>
                </div>
              </details>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"><p className="text-xs leading-5 text-emerald-950">{note}</p></div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {(isGrounding || isSemantic) ? (
            <button type="button" onClick={onEditDetails} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-slate-950/10 transition hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">
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
