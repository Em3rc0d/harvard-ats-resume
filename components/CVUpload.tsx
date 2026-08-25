'use client';

import { useState } from 'react';
import type { ResumeRequest } from '@/lib/schemas';
import type { ResumeImportContext } from '@/lib/application/import/ResumeImportProvider';
import { useLanguage } from '@/components/LanguageProvider';
import { AlertTriangle, FileCheck2, RotateCcw, ShieldCheck, Upload } from 'lucide-react';

interface CVUploadProps {
  onDataExtracted: (data: ResumeRequest, sourceContext: ResumeImportContext) => void;
  onCancel: () => void;
}

interface ImportResponse {
  success: boolean;
  data?: {
    resume: Omit<ResumeRequest, 'jobDescription'>;
    context: ResumeImportContext;
  };
  error?: string;
  errorCode?: string;
  stage?: string;
  section?: string;
  canRetry?: boolean;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.docx'] as const;

const PROCESS_COPY = {
  en: {
    trust: 'Your file is processed through the server-side trusted import boundary. Job descriptions are never extracted from your resume.',
    pipeline: ['Read machine-readable document text', 'Extract candidate facts', 'Verify extracted fields against the source'],
    invalidType: 'Use a PDF or DOCX resume.',
    tooLarge: 'This file is larger than 10 MB.',
    network: 'CV Engine could not reach the resume import service. Check your connection and try again.',
    retry: 'Choose another file',
    manualFallback: 'Use manual career evidence instead',
    manualFallbackHint: 'Automatic import stopped before CV Engine could safely accept the extracted facts. Your resume was not promoted to career truth. Return to the start screen and choose Build my evidence to continue manually.',
    stage: 'Import stage',
    section: 'Section',
    cancel: 'Cancel',
  },
  es: {
    trust: 'Tu archivo se procesa mediante la frontera confiable de importación del servidor. Las descripciones de vacantes nunca se extraen de tu CV.',
    pipeline: ['Leer el texto legible del documento', 'Extraer hechos del candidato', 'Verificar los campos extraídos contra la fuente'],
    invalidType: 'Usa un CV en formato PDF o DOCX.',
    tooLarge: 'Este archivo supera los 10 MB.',
    network: 'CV Engine no pudo comunicarse con el servicio de importación. Verifica tu conexión e inténtalo nuevamente.',
    retry: 'Elegir otro archivo',
    manualFallback: 'Usar evidencia profesional manual',
    manualFallbackHint: 'La importación automática se detuvo antes de que CV Engine pudiera aceptar los datos de forma segura. Tu CV no se convirtió en verdad profesional. Vuelve al inicio y elige Construir mi evidencia para continuar manualmente.',
    stage: 'Etapa de importación',
    section: 'Sección',
    cancel: 'Cancelar',
  },
  fr: {
    trust: "Votre fichier passe par la frontière d'importation fiable côté serveur. Les descriptions de poste ne sont jamais extraites de votre CV.",
    pipeline: ['Lire le texte exploitable du document', 'Extraire les faits du candidat', 'Vérifier les champs extraits dans la source'],
    invalidType: 'Utilisez un CV PDF ou DOCX.',
    tooLarge: 'Ce fichier dépasse 10 Mo.',
    network: "CV Engine n'a pas pu joindre le service d'importation. Vérifiez votre connexion et réessayez.",
    retry: 'Choisir un autre fichier',
    manualFallback: 'Utiliser les preuves de carrière manuelles',
    manualFallbackHint: "L'importation automatique s'est arrêtée avant que CV Engine puisse accepter les faits en toute sécurité. Le CV n'a pas été promu en vérité de carrière. Revenez à l'accueil et choisissez la saisie manuelle des preuves.",
    stage: "Étape d'importation",
    section: 'Section',
    cancel: 'Annuler',
  },
  pt: {
    trust: 'Seu arquivo é processado pela fronteira confiável de importação no servidor. Descrições de vagas nunca são extraídas do currículo.',
    pipeline: ['Ler o texto processável do documento', 'Extrair fatos do candidato', 'Verificar os campos extraídos na fonte'],
    invalidType: 'Use um currículo PDF ou DOCX.',
    tooLarge: 'Este arquivo excede 10 MB.',
    network: 'O CV Engine não conseguiu acessar o serviço de importação. Verifique sua conexão e tente novamente.',
    retry: 'Escolher outro arquivo',
    manualFallback: 'Usar evidências profissionais manuais',
    manualFallbackHint: 'A importação automática parou antes que o CV Engine pudesse aceitar os dados com segurança. O currículo não foi promovido a verdade profissional. Volte ao início e escolha a entrada manual de evidências.',
    stage: 'Etapa de importação',
    section: 'Seção',
    cancel: 'Cancelar',
  },
} as const;

function extension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
}

export default function CVUpload({ onDataExtracted, onCancel }: Readonly<CVUploadProps>) {
  const { t, language } = useLanguage();
  const processCopy = PROCESS_COPY[language];
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorMeta, setErrorMeta] = useState<{ code?: string; stage?: string; section?: string } | null>(null);

  const rejectLocally = (message: string) => {
    setIsDragging(false);
    setError(message);
    setErrorMeta(null);
  };

  const processFile = async (file: File) => {
    if (isUploading) return;

    if (!ALLOWED_EXTENSIONS.includes(extension(file.name) as (typeof ALLOWED_EXTENSIONS)[number])) {
      rejectLocally(processCopy.invalidType);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      rejectLocally(processCopy.tooLarge);
      return;
    }

    setIsUploading(true);
    setIsDragging(false);
    setError(null);
    setErrorMeta(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/import-resume', {
        method: 'POST',
        body: formData,
      });

      let result: ImportResponse;
      try {
        result = await response.json() as ImportResponse;
      } catch {
        setError(processCopy.network);
        setErrorMeta({ code: 'INVALID_SERVER_RESPONSE', stage: 'RESPONSE' });
        return;
      }

      if (!response.ok || !result.success || !result.data) {
        setError(result.error || t.upload.error);
        setErrorMeta({ code: result.errorCode, stage: result.stage, section: result.section });
        return;
      }

      const mappedData: ResumeRequest = {
        ...result.data.resume,
        jobDescription: '',
      };

      onDataExtracted(mappedData, result.data.context);
    } catch {
      setError(processCopy.network);
      setErrorMeta({ code: 'NETWORK_FAILURE', stage: 'REQUEST' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processFile(file);
    event.target.value = '';
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isUploading) setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) await processFile(file);
  };

  const canUseManualFallback = Boolean(
    error &&
    errorMeta?.stage &&
    !['VALIDATION', 'REQUEST', 'RESPONSE'].includes(errorMeta.stage),
  );

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <div className="mb-8">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <Upload className="h-8 w-8" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-gray-900">{t.upload.title}</h2>
        <p className="text-gray-500">{t.upload.desc}</p>
      </div>

      <div className="space-y-4">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-lg border-2 border-dashed transition-colors ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'} ${isUploading ? 'opacity-70' : ''}`}
        >
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="hidden"
            id="cv-upload"
          />
          <label
            htmlFor="cv-upload"
            className={`block w-full p-12 ${isUploading ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-blue-50/50'}`}
          >
            {isUploading ? (
              <div className="flex flex-col items-center">
                <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-blue-100 border-t-blue-600" />
                <p className="font-medium text-blue-700">{t.upload.analyzing}</p>
                <div className="mt-5 w-full max-w-md space-y-2 text-left">
                  {processCopy.pipeline.map((step) => (
                    <div key={step} className="flex items-start gap-2 rounded-md bg-white/80 px-3 py-2 text-xs text-gray-600">
                      <FileCheck2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <span className="mb-2 font-medium text-gray-700">{t.upload.dragDrop}</span>
                <span className="text-sm text-gray-400">{t.upload.formats}</span>
              </div>
            )}
          </label>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-left">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-700" />
            <p className="text-xs leading-relaxed text-gray-600">{processCopy.trust}</p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-left" role="alert">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-red-800">{error}</p>
                {(errorMeta?.code || errorMeta?.stage || errorMeta?.section) && (
                  <p className="mt-2 font-mono text-[10px] text-red-500">
                    {errorMeta.code ?? 'IMPORT_FAILURE'}
                    {errorMeta.stage ? ` · ${processCopy.stage}: ${errorMeta.stage}` : ''}
                    {errorMeta.section ? ` · ${processCopy.section}: ${errorMeta.section}` : ''}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label htmlFor="cv-upload" className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-red-700 hover:underline">
                    <RotateCcw className="h-3.5 w-3.5" /> {processCopy.retry}
                  </label>
                  {canUseManualFallback ? (
                    <button
                      type="button"
                      onClick={onCancel}
                      className="inline-flex items-center rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-800 shadow-sm hover:bg-red-100"
                    >
                      {processCopy.manualFallback}
                    </button>
                  ) : null}
                </div>
                {canUseManualFallback ? (
                  <p className="mt-3 text-xs leading-5 text-red-700">
                    {processCopy.manualFallbackHint}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isUploading}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            {processCopy.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
