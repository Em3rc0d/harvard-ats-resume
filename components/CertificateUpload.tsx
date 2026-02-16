'use client';

import { useState, useCallback, useEffect } from 'react';
import { createWorker } from 'tesseract.js';

// PDF.js will be loaded dynamically on client side only
let pdfjsLib: any = null;

interface ExtractedEducation {
    degree: string;
    institution: string;
    graduationDate: string;
    gpa?: string;
    honors?: string;
}

interface CertificateUploadProps {
    onDataExtracted: (data: ExtractedEducation) => void;
    onBatchDataExtracted?: (data: ExtractedEducation[]) => void; // NEW: For batch upload
    index?: number; // Add index to make each instance unique
    allowMultiple?: boolean; // NEW: Allow multiple file selection
}

export default function CertificateUpload({
    onDataExtracted,
    onBatchDataExtracted,
    index = 0,
    allowMultiple = false
}: CertificateUploadProps) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [preview, setPreview] = useState<string | null>(null);
    const [extractedText, setExtractedText] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    // Load PDF.js dynamically on client side only
    useEffect(() => {
        if (typeof window !== 'undefined' && !pdfjsLib) {
            import('pdfjs-dist').then((pdfjs) => {
                pdfjsLib = pdfjs;
                pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
            });
        }
    }, []);

    const parseEducationData = (text: string): ExtractedEducation => {
        // Common patterns for education certificates
        const degreePatterns = [
            /(?:awarded\s+to|conferred\s+upon|certify\s+that)\s+.*?(?:degree|diploma|certificate)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
            /(?:Bachelor|Master|Doctor|Associate)(?:'s)?\s+of\s+[A-Z][a-z]+/i,
            /(?:B\.?A\.?|B\.?S\.?|M\.?A\.?|M\.?S\.?|Ph\.?D\.?|M\.?B\.?A\.?)\s+(?:in\s+)?[A-Z][a-z]+/i
        ];

        const institutionPatterns = [
            /(?:University|College|Institute|School)\s+of\s+[A-Z][a-z]+/i,
            /[A-Z][a-z]+\s+(?:University|College|Institute|School)/i
        ];

        const datePatterns = [
            /(?:awarded|given|dated)\s+(?:on\s+)?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i,
            /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{4})/i
        ];

        const gpaPatterns = [
            /GPA[:\s]+(\d\.\d{1,2})/i,
            /Grade Point Average[:\s]+(\d\.\d{1,2})/i
        ];

        const honorsPatterns = [
            /(?:Summa|Magna)?\s+Cum\s+Laude/i,
            /with\s+(?:highest\s+)?distinction/i,
            /Dean's\s+List/i
        ];

        let degree = '';
        let institution = '';
        let graduationDate = '';
        let gpa = '';
        let honors = '';

        // Extract degree
        for (const pattern of degreePatterns) {
            const match = text.match(pattern);
            if (match) {
                degree = match[0].trim(); // Use full match for degree type
                break;
            }
        }

        // Extract institution
        for (const pattern of institutionPatterns) {
            const match = text.match(pattern);
            if (match) {
                institution = match[0].trim();
                break;
            }
        }

        // Extract date
        for (const pattern of datePatterns) {
            const match = text.match(pattern);
            if (match) {
                graduationDate = match[1] || match[0];
                break;
            }
        }

        // Extract GPA
        const gpaMatch = text.match(gpaPatterns[0]) || text.match(gpaPatterns[1]);
        if (gpaMatch) {
            gpa = gpaMatch[1];
        }

        // Extract honors
        const honorsMatch = text.match(honorsPatterns[0]);
        if (honorsMatch) {
            honors = honorsMatch[1];
        }

        return {
            degree: degree || 'Degree not found',
            institution: institution || 'Institution not found',
            graduationDate: graduationDate || 'Date not found',
            gpa: gpa || undefined,
            honors: honors || undefined,
        };
    };

    const convertPdfToImage = async (file: File): Promise<Blob> => {
        if (!pdfjsLib) {
            throw new Error('PDF library not loaded yet. Please try again in a moment.');
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1); // Get first page

        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
            throw new Error('Could not get canvas context');
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
            canvasContext: context,
            viewport: viewport,
            canvas: canvas,
        }).promise;

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to convert PDF to image'));
                }
            }, 'image/png');
        });
    };

    const processImage = async (file: File): Promise<ExtractedEducation> => {
        setIsProcessing(true);
        if (!allowMultiple) {
            setProgress(0);
            setError(null);
        }

        try {
            let fileToProcess: File | Blob = file;

            // If it's a PDF, convert to image first
            if (file.type === 'application/pdf') {
                if (!allowMultiple) setProgress(10);
                fileToProcess = await convertPdfToImage(file);
                if (!allowMultiple) setProgress(20);
            }

            // Create preview only if it's a single file upload or the first one
            if (!allowMultiple) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    setPreview(e.target?.result as string);
                };
                reader.readAsDataURL(file);
            }

            // Initialize Tesseract worker
            const worker = await createWorker('eng', 1, {
                logger: (m) => {
                    if (m.status === 'recognizing text' && !allowMultiple) {
                        // Adjust progress based on whether we converted PDF
                        const baseProgress = file.type === 'application/pdf' ? 20 : 0;
                        setProgress(baseProgress + Math.round(m.progress * 80));
                    }
                },
            });

            // Perform OCR
            const { data: { text } } = await worker.recognize(fileToProcess);
            await worker.terminate();

            if (!allowMultiple) {
                setExtractedText(text);
                setIsProcessing(false);
            }

            return parseEducationData(text);
        } catch (err) {
            console.error('OCR Error:', err);
            if (!allowMultiple) {
                setError('Failed to process file. Please try again.');
                setIsProcessing(false);
            }
            throw err;
        }
    };

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // Validate all files are images or PDFs
        const validFiles: File[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const isImage = file.type.startsWith('image/');
            const isPdf = file.type === 'application/pdf';

            if (isImage || isPdf) {
                validFiles.push(file);
            } else {
                setError(`Skipping ${file.name} - only image files and PDFs are supported`);
            }
        }

        if (validFiles.length === 0) {
            setError('Please upload at least one image file (PNG, JPG, etc.) or PDF');
            return;
        }

        // If multiple files (allowMultiple=true) and batch callback exists
        if (allowMultiple && onBatchDataExtracted) {
            setIsProcessing(true);
            setError(null);
            setProgress(0);

            const results: ExtractedEducation[] = [];

            for (let i = 0; i < validFiles.length; i++) {
                try {
                    setProgress(Math.round((i / validFiles.length) * 100));
                    const educationData = await processImage(validFiles[i]);
                    results.push(educationData);
                } catch (err) {
                    console.error(`Error processing ${validFiles[i].name}:`, err);
                }
            }

            setProgress(100);
            setIsProcessing(false);

            if (results.length > 0) {
                onBatchDataExtracted(results);
            }
        } else {
            // Single file processing
            try {
                const educationData = await processImage(validFiles[0]);
                onDataExtracted(educationData);
            } catch (err) {
                // Error handled in processImage
            }
        }
    }, [allowMultiple, onBatchDataExtracted, onDataExtracted]);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) {
            const isImage = file.type.startsWith('image/');
            const isPdf = file.type === 'application/pdf';

            if (!isImage && !isPdf) {
                setError('Please upload an image file (PNG, JPG, etc.) or PDF');
                return;
            }
            processImage(file).then(data => onDataExtracted(data));
        }
    }, [onDataExtracted]);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    }, []);

    return (
        <div className="space-y-4">
            {/* Upload Area */}
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer bg-gray-50"
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
                <label htmlFor={`certificate-upload-${index}`} className="cursor-pointer">
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
                            <span className="font-semibold text-gray-900">Click to upload</span> or drag and drop
                        </div>
                        <p className="text-xs text-gray-500">
                            PNG, JPG, GIF, PDF up to 10MB{allowMultiple ? ' (multiple files allowed)' : ''}
                        </p>
                        <p className="text-xs text-blue-600 font-medium mt-2">
                            📜 Upload your {allowMultiple ? 'certificates' : 'diploma or certificate'} to auto-fill education details
                        </p>
                    </div>
                </label>
            </div>

            {/* Processing Status */}
            {isProcessing && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                        <div className="flex-1">
                            <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-600 transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <p className="text-xs text-blue-600 mt-1 text-center">
                                Processing... {progress}%
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                    {error}
                </div>
            )}

            {/* Preview & Results (Single file only) */}
            {!allowMultiple && preview && (
                <div className="mt-4">
                    <img src={preview} alt="Certificate preview" className="max-h-48 rounded-lg mx-auto shadow-sm" />
                </div>
            )}

            {/* Extracted Text (Single file only) */}
            {!allowMultiple && extractedText && (
                <details className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <summary className="text-sm font-medium text-gray-900 cursor-pointer">
                        View Extracted Text
                    </summary>
                    <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap font-mono p-2 bg-white rounded border border-gray-200 max-h-40 overflow-y-auto">
                        {extractedText}
                    </pre>
                </details>
            )}
        </div>
    );
}
