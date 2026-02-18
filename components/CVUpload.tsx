'use client';

import { useState } from 'react';
import { ResumeRequest } from '@/lib/schemas';
import { useLanguage } from '@/components/LanguageProvider';
import { Upload } from 'lucide-react';

interface CVUploadProps {
    onDataExtracted: (data: ResumeRequest) => void;
    onCancel: () => void;
}

export default function CVUpload({ onDataExtracted, onCancel }: Readonly<CVUploadProps>) {
    const { t } = useLanguage();
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const n8nUrl = process.env.NEXT_PUBLIC_N8N_RESUME_URL;
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!n8nUrl) {
            setError('System configuration error: Upload URL is missing.');
            return;
        }

        setIsUploading(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);

        console.log(`[CVUpload] Uploading to: ${n8nUrl} with method: POST`);

        try {
            const response = await fetch(
                n8nUrl,
                {
                    method: 'POST',
                    body: formData,
                }
            );

            if (!response.ok) {
                throw new Error('Failed to upload file');
            }

            const rawResponse = await response.json();

            // n8n often returns an array of items, we only need the first one
            const result = Array.isArray(rawResponse) ? rawResponse[0] : rawResponse;

            // Check if n8n returned a "Workflow was started" message instead of data
            if (result.message === 'Workflow was started' && !result.personalInfo) {
                const errorMsg = 'The n8n webhook returned "Workflow was started" instead of the resume data. Please configure your n8n workflow to "Respond to Webhook" with the data.';
                console.error(errorMsg);
                setError(errorMsg);
                setIsUploading(false);
                return;
            }

            // Map the result to our schema
            // Note: This mapping assumes the webhook returns data in a structure somewhat compatible
            // or that we can map it. Since we don't know the exact response structure,
            // we'll try to map common fields and provide defaults.
            // Empty strings are used as fallbacks to ensure Zod schema compliance for optional fields,
            // allowing the user to fill them in the UI if the extraction was incomplete.
            const mappedData: ResumeRequest = {
                personalInfo: {
                    fullName: result.personalInfo?.fullName || '',
                    email: result.personalInfo?.email || '',
                    location: result.personalInfo?.location || '',
                    linkedin: result.personalInfo?.linkedin || '',
                    github: result.personalInfo?.github || '',
                },
                summary: result.summary || '',
                experience: Array.isArray(result.experience) ? result.experience.map((exp: any) => ({
                    company: exp.company || '',
                    role: exp.role || '',
                    startDate: exp.startDate || '',
                    endDate: exp.endDate || '',
                    description: exp.description || '',
                    technologies: Array.isArray(exp.technologies) ? exp.technologies : [],
                })) : [],
                education: Array.isArray(result.education) ? result.education.map((edu: any) => ({
                    institution: edu.institution || '',
                    degree: edu.degree || '',
                    startDate: edu.startDate || '',
                    endDate: edu.endDate || '',
                })) : [],
                skills: {
                    hardSkills: Array.isArray(result.skills?.hardSkills) ? result.skills.hardSkills : [],
                    softSkills: Array.isArray(result.skills?.softSkills) ? result.skills.softSkills : [],
                },
                jobDescription: result.jobDescription || '',
            };

            onDataExtracted(mappedData);

        } catch (err) {
            console.error('Upload error:', err);
            setError('Failed to extract information from CV. Please try again or fill manually.');
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
                        accept=".pdf,.doc,.docx"
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
