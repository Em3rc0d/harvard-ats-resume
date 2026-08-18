'use client';

import { useCallback, useState } from 'react';
import { createWorker } from 'tesseract.js';
import { useLanguage } from '@/components/LanguageProvider';
import Image from 'next/image';

interface ExtractedEducation {
    degree: string;
    institution: string;
    graduationDate: string;
    gpa?: string;
    honors?: string;
}

interface CertificateUploadProps {
    readonly onDataExtracted: (data: ExtractedEducation) => void;
    readonly onBatchDataExtracted?: (data: ExtractedEducation[]) => void;
    readonly index?: number;
    readonly allowMultiple?: boolean;
}

interface CertificatePdfResponse {
    readonly success?: boolean;
    readonly text?: string;
    readonly error?: string;
}

export default function CertificateUpload(props: Readonly<CertificateUploadProps>) {
    const {
        onDataExtracted,
        onBatchDataExtracted,
        index = 0,
        allowMultiple = false
    } = props;
    const { t } = useLanguage();
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [preview, setPreview] = useState<string | null>(null);
    const [extractedText, setExtractedText] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    const parseEducationData = (text: string): ExtractedEducation => {
        const degreePatterns = [
            /degree\s+of\s+([A-Z][a-z\s]+)/i,
            /diploma\s+of\s+([A-Z][a-z\s]+)/i,
            /certificate\s+of\s+([A-Z][a-z\s]+)/i,
            /[BMD][a-z]+\s+of\s+[A-Z][a-z]+/i,
            /\b(?:BA|BS|MA|MS|PhD|MBA)\b/i
        ];
        const institutionPatterns = [
            /(?:University|College|Institute|School)\s+of\s+[A-Z][a-z]+/i,
            /[A-Z][a-z]+\s+(?:University|College|Institute|School)/i
        ];
        const datePatterns = [
            /(?:awarded|given|dated)\s+(?:on\s+)?(\w+\s+\d{1,2},?\s+\d{4})/i,
            /(\d{1,2}\s+\w+\s+\d{4})/i
        ];
        const gpaPatterns = [
            /GPA:?\s+(\d\.\d+)/i,
            /Grade Point Average:?\s+(\d\.\d+)/i
        ];
        const honorsPatterns = [/Cum\s+Laude/i, /distinction/i, /Dean's\s+List/i];

        let degree = '';
        let institution = '';
        let graduationDate = '';
        let gpa = '';
        let honors = '';

        for (const pattern of degreePatterns) {
            const match = pattern.exec(text);
            if (match) {
                degree = match[0].trim();
                break;
            }
        }

        for (const pattern of institutionPatterns) {
            const match = pattern.exec(text);
            if (match) {
                institution = match[0].trim();
                break;
            }
        }

        for (const pattern of datePatterns) {
            const match = pattern.exec(text);
            if (match) {
                graduationDate = match[1] || match[0];
                break;
            }
        }

        const gpaMatch = gpaPatterns[0].exec(text) || gpaPatterns[1].exec(text);
        if (gpaMatch) gpa = gpaMatch[1];

        const honorsMatch = honorsPatterns.find((pattern) => pattern.test(text));
        if (honorsMatch) honors = honorsMatch.exec(text)?.[0] ?? '';

        return {
            degree: degree || 'Degree not found',
            institution: institution || 'Institution not found',
            graduationDate: graduationDate || 'Date not found',
            gpa: gpa || undefined,
            honors: honors || undefined,
        };
    };

    const extractPdfText = async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/extract-certificate-text', {
            method: 'POST',
            body: formData,
        });
        const result = await response.json() as CertificatePdfResponse;

        if (!response.ok || !result.success || !result.text) {
            throw new Error(result.error || 'Failed to read certificate PDF');
        }

        return result.text;
    };

    const recognizeImageText = async (file: File): Promise<string> => {
        const worker = await createWorker('eng', 1, {
            logger: (message) => {
                if (message.status === 'recognizing text' && !allowMultiple) {
                    setProgress(Math.round(message.progress * 100));
                }
            },
        });

        try {
            const { data: { text } } = await worker.recognize(file);
            return text;
        } finally {
            await worker.terminate();
        }
    };

    const processFile = async (file: File): Promise<ExtractedEducation> => {
        if (!allowMultiple) {
            setIsProcessing(true);
            setProgress(0);
            setError(null);
            setExtractedText('');
            setPreview(null);
        }

        try {
            let text: string;

            if (file.type === 'application/pdf') {
                if (!allowMultiple) setProgress(20);
                text = await extractPdfText(file);
                if (!allowMultiple) setProgress(100);
            } else {
                if (!allowMultiple) {
                    const reader = new FileReader();
                    reader.onload = (event) => setPreview(event.target?.result as string);
                    reader.readAsDataURL(file);
                }
                text = await recognizeImageText(file);
            }

            if (!allowMultiple) setExtractedText(text);
            return parseEducationData(text);
        } catch (caught) {
            const message = caught instanceof Error ? caught.message : 'Failed to process file.';
            console.error('Certificate extraction error:', caught);
            if (!allowMultiple) setError(message);
            throw caught;
        } finally {
            if (!allowMultiple) setIsProcessing(false);
        }
    };

    const handleBatchProcessing = async (validFiles: File[]) => {
        const results: ExtractedEducation[] = [];
        for (let i = 0; i < validFiles.length; i += 1) {
            try {
                setProgress(Math.round((i / validFiles.length) * 100));
                results.push(await processFile(validFiles[i]));
            } catch (caught) {
                console.error(`Error processing ${validFiles[i].name}:`, caught);
            }
        }
        return results;
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const validFiles = Array.from(files).filter((file) => {
            const valid = file.type.startsWith('image/') || file.type === 'application/pdf';
            if (!valid) setError(`Skipping ${file.name} - only image files and PDFs are supported`);
            return valid;
        });

        if (validFiles.length === 0) {
            setError('Please upload at least one image file (PNG, JPG, etc.) or PDF');
            return;
        }

        setIsProcessing(true);
        setError(null);
        setProgress(0);

        try {
            if (allowMultiple && onBatchDataExtracted) {
                const results = await handleBatchProcessing(validFiles);
                if (results.length > 0) onBatchDataExtracted(results);
            } else {
                onDataExtracted(await processFile(validFiles[0]));
            }
        } finally {
            setProgress(100);
            setIsProcessing(false);
        }
    };

    const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            setError('Please upload an image file (PNG, JPG, etc.) or PDF');
            return;
        }

        processFile(file)
            .then((data) => onDataExtracted(data))
            .catch((caught) => console.error('Drop processing error:', caught));
    };

    const handleDragOver = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
        event.preventDefault();
    }, []);

    return (
        <div className="space-y-4">
            <button
                type="button"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => globalThis.document.getElementById(`certificate-upload-${index}`)?.click()}
                disabled={isProcessing}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t.certificate.uploadPrompt}
            >
                <input
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    id={`certificate-upload-${index}`}
                    disabled={isProcessing}
                    multiple={allowMultiple}
                />
                <span className="sr-only">Upload Certificate</span>
                <div className="space-y-2">
                    <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        stroke="currentColor"
                        fill="none"
                        viewBox="0 0 48 48"
                        aria-hidden="true"
                    >
                        <path
                            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                    <div className="text-sm text-gray-600">
                        <span className="font-semibold text-gray-900">{t.certificate.clickToUpload}</span> {t.certificate.dragDrop}
                    </div>
                    <p className="text-xs text-gray-500">
                        {t.certificate.formats}{allowMultiple ? ` ${t.certificate.multipleAllowed}` : ''}
                    </p>
                    <p className="text-xs text-blue-600 font-medium mt-2">📜 {t.certificate.uploadPrompt}</p>
                </div>
            </button>

            {isProcessing && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-600 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-xs text-blue-600 mt-1 text-center">
                        {t.certificate.processing} {progress}%
                    </p>
                </div>
            )}

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                    {error}
                </div>
            )}

            {!allowMultiple && preview && (
                <div className="mt-4">
                    <Image
                        src={preview}
                        alt="Certificate preview"
                        width={640}
                        height={360}
                        unoptimized
                        className="max-h-48 w-auto rounded-lg mx-auto shadow-sm"
                    />
                </div>
            )}

            {!allowMultiple && extractedText && (
                <details className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <summary className="text-sm font-medium text-gray-900 cursor-pointer">
                        {t.certificate.viewExtracted}
                    </summary>
                    <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap font-mono p-2 bg-white rounded border border-gray-200 max-h-40 overflow-y-auto">
                        {extractedText}
                    </pre>
                </details>
            )}
        </div>
    );
}
