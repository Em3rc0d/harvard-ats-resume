'use client';

import { useState } from 'react';
import type { ResumeRequest } from '@/lib/schemas';
import type { ResumeImportContext } from '@/lib/application/import/ResumeImportProvider';
import { useLanguage } from '@/components/LanguageProvider';
import { FileCheck2, ShieldCheck, Upload } from 'lucide-react';

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
}

const PROCESS_COPY = {
  en: {
    trust: 'Your file is processed through the server-side trusted import boundary. Job descriptions are never extracted from your resume.',
    pipeline: ['Read machine-readable document text', 'Extract candidate facts', 'Verify every extracted field against the source'],
  },
  es: {
    trust: 'Tu archivo se procesa mediante la frontera confiable de importación del servidor. Las descripciones de vacantes nunca se extraen de tu CV.',
    pipeline: ['Leer el texto legible del documento', 'Extraer hechos del candidato', 'Verificar cada campo contra la fuente'],
  },
  fr: {
    trust: "Votre fichier passe par la frontière d'importation fiable côté serveur. Les descriptions de poste ne sont jamais extraites de votre CV.",
    pipeline: ['Lire le texte exploitable du document', 'Extraire les faits du candidat', 'Vérifier chaque champ extrait dans la source'],
  },
  pt: {
    trust: 'Seu arquivo é processado pela fronteira confiável de importação no servidor. Descrições de vagas nunca são extraídas do currículo.',
    pipeline: ['Ler o texto processável do documento', 'Extrair fatos do candidato', 'Verificar cada campo extraído na fonte'],
  },
} as const;

export default function CVUpload({ onDataExtracted, onCancel }: Readonly<CVUploadProps>) {
  const { t, language } = useLanguage();
  const processCopy = PROCESS_COPY[language];
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = async (file: File) => {
    if (isUploading) return;

    setIsUploading(true);
    setIsDragging(false);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // The browser talks only to our server-side import boundary.
      // File parsing, structured extraction, and provenance validation stay server-side.
      const response = await fetch('/api/import-resume', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json() as ImportResponse;

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || 'Failed to import resume');
      }

      // Resume import never supplies Job Description truth. The target
      // job remains a separate user-controlled input after review.
      const mappedData: ResumeRequest = {
        ...result.data.resume,
        jobDescription: '',
      };

      onDataExtracted(mappedData, result.data.context);
    } catch (err) {
      console.error('Upload error:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to extract information from CV. Please try again or fill manually.',
      );
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
            accept=".pdf,.docx"
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
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="border-t border-gray-100 pt-4">
          <button
            onClick={onCancel}
            disabled={isUploading}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            {t.upload.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
