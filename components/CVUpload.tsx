'use client';

import { useState } from 'react';
import type { ResumeRequest } from '@/lib/schemas';
import type { ResumeImportContext } from '@/lib/application/import/ResumeImportProvider';
import { useLanguage } from '@/components/LanguageProvider';
import { Upload } from 'lucide-react';

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

export default function CVUpload({ onDataExtracted, onCancel }: Readonly<CVUploadProps>) {
    const { t } = useLanguage();
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
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

    return (
        <div className="max-w-2xl mx-auto text-center p-8 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="mb-8">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Upload className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{t.upload.title}</h2>
                <p className="text-gray-500">
                    {t.upload.desc}
                </p>
            </div>

            <div className="space-y-4">
                <div className="relative">
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
                        className={`block w-full border-2 border-dashed border-gray-300 rounded-lg p-12 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                    >
                        {isUploading ? (
                            <div className="flex flex-col items-center">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
                                <p className="text-blue-600 font-medium">{t.upload.analyzing}</p>
                                <p className="text-sm text-gray-400 mt-1">{t.upload.wait}</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center">
                                <span className="text-gray-600 font-medium mb-2">{t.upload.dragDrop}</span>
                                <span className="text-sm text-gray-400">{t.upload.formats}</span>
                            </div>
                        )}
                    </label>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <div className="pt-4 border-t border-gray-100">
                    <button
                        onClick={onCancel}
                        className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                    >
                        {t.upload.cancel}
                    </button>
                </div>
            </div>
        </div>
    );
}
