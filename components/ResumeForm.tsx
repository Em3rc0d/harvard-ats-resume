'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resumeRequestSchema, ResumeRequest } from '@/lib/schemas';
import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import VoiceInput from './VoiceInput';

// Dynamic import with SSR disabled to prevent PDF.js server-side errors
const CertificateUpload = dynamic(() => import('./CertificateUpload'), {
  ssr: false,
  loading: () => (
    <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p className="mt-2 text-sm text-gray-500">Loading certificate uploader...</p>
    </div>
  ),
});

interface ResumeFormProps {
  onSubmit: (data: ResumeRequest) => Promise<void>;
  isLoading: boolean;
  initialData?: ResumeRequest;
}

export default function ResumeForm({ onSubmit, isLoading, initialData }: ResumeFormProps) {
  const [currentSection, setCurrentSection] = useState(0);

  const sections = [
    'Personal Info',
    'Summary',
    'Experience',
    'Education',
    'Skills',
    'Job Description (Optional)'
  ];

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    trigger,
    setValue,
    watch,
  } = useForm<ResumeRequest>({
    resolver: zodResolver(resumeRequestSchema),
    defaultValues: initialData || {
      personalInfo: {
        fullName: '',
        location: '',
        email: '',
        linkedin: '',
        github: '',
      },
      summary: '',
      experience: [{
        company: '',
        role: '',
        startDate: '',
        endDate: '',
        description: '',
        technologies: [],
      }],
      education: [{
        institution: '',
        degree: '',
        startDate: '',
        endDate: '',
      }],
      skills: {
        hardSkills: [],
        softSkills: [],
      },
      jobDescription: '',
    },
  });

  const {
    fields: experienceFields,
    append: appendExperience,
    remove: removeExperience,
  } = useFieldArray({
    control,
    name: 'experience',
  });

  const {
    fields: educationFields,
    append: appendEducation,
    remove: removeEducation,
  } = useFieldArray({
    control,
    name: 'education',
  });

  const [hardSkillsInput, setHardSkillsInput] = useState('');
  const [softSkillsInput, setSoftSkillsInput] = useState('');
  const [hardSkills, setHardSkills] = useState<string[]>(initialData?.skills?.hardSkills || []);
  const [softSkills, setSoftSkills] = useState<string[]>(initialData?.skills?.softSkills || []);

  const addHardSkill = () => {
    if (hardSkillsInput.trim()) {
      const newSkills = [...hardSkills, hardSkillsInput.trim()];
      setHardSkills(newSkills);
      setValue('skills.hardSkills', newSkills, { shouldValidate: true });
      setHardSkillsInput('');
    }
  };

  const addSoftSkill = () => {
    if (softSkillsInput.trim()) {
      const newSkills = [...softSkills, softSkillsInput.trim()];
      setSoftSkills(newSkills);
      setValue('skills.softSkills', newSkills, { shouldValidate: true });
      setSoftSkillsInput('');
    }
  };

  const removeHardSkill = (index: number) => {
    const newSkills = hardSkills.filter((_, i) => i !== index);
    setHardSkills(newSkills);
    setValue('skills.hardSkills', newSkills, { shouldValidate: true });
  };

  const removeSoftSkill = (index: number) => {
    const newSkills = softSkills.filter((_, i) => i !== index);
    setSoftSkills(newSkills);
    setValue('skills.softSkills', newSkills, { shouldValidate: true });
  };

  const [optimizingField, setOptimizingField] = useState<string | null>(null);
  const optimizeUrl = process.env.NEXT_PUBLIC_N8N_OPTIMIZE_URL;

  const handleOptimize = async (fieldPath: any) => {
    const currentText = watch(fieldPath);
    if (!currentText || currentText.length < 10) {
      alert('Please write some content first (at least 10 characters) for the AI to optimize.');
      return;
    }

    if (!optimizeUrl) {
      alert('Optimization service is not configured (Missing NEXT_PUBLIC_N8N_OPTIMIZE_URL).');
      return;
    }

    setOptimizingField(fieldPath);
    try {
      // We send the text as 'summary' because the N8N workflow expects this key
      const response = await fetch(optimizeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: currentText }),
      });

      if (!response.ok) {
        throw new Error('Failed to optimize content');
      }

      const rawResponse = await response.json();
      // n8n often returns an array, take the first item
      const result = Array.isArray(rawResponse) ? rawResponse[0] : rawResponse;

      // Handle various response formats from n8n
      const optimizedText = result.output || result.optimizedSummary || result.summary || (typeof result === 'string' ? result : JSON.stringify(result));

      if (optimizedText) {
        setValue(fieldPath, optimizedText, { shouldValidate: true, shouldDirty: true });
      } else {
        throw new Error('Invalid response format');
      }

    } catch (error) {
      console.error('Optimization error:', error);
      alert('Failed to optimize content. Please try again.');
    } finally {
      setOptimizingField(null);
    }
  };

  // Handle batch certificate upload
  const handleBatchCertificates = useCallback((certificates: Array<{
    degree: string;
    institution: string;
    graduationDate: string;
    gpa?: string;
    honors?: string;
  }>) => {
    // Remove the default empty education entry if it exists
    if (educationFields.length === 1 && !educationFields[0].institution) {
      removeEducation(0);
    }

    // Add an education entry for each certificate
    certificates.forEach(cert => {
      const year = cert.graduationDate.match(/\d{4}/)?.[0];
      const gradYear = year ? parseInt(year) : new Date().getFullYear();
      const startYear = gradYear - 4; // Assume 4-year degree

      appendEducation({
        institution: cert.institution,
        degree: cert.degree,
        startDate: startYear.toString(),
        endDate: year || cert.graduationDate,
      });
    });
  }, [educationFields, removeEducation, appendEducation]);

  const nextSection = async () => {
    const fieldsToValidate = getSectionFields(currentSection);
    const isValid = await trigger(fieldsToValidate as any);

    if (isValid && currentSection < sections.length - 1) {
      setCurrentSection(currentSection + 1);
    }
  };

  const prevSection = () => {
    if (currentSection > 0) {
      setCurrentSection(currentSection - 1);
    }
  };

  const getSectionFields = (section: number) => {
    switch (section) {
      case 0: return ['personalInfo'];
      case 1: return ['summary'];
      case 2: return ['experience'];
      case 3: return ['education'];
      case 4: return ['skills'];
      case 5: return ['jobDescription'];
      default: return [];
    }
  };

  const onFormSubmit = handleSubmit((data) => {
    // Add skills arrays to form data
    data.skills.hardSkills = hardSkills;
    data.skills.softSkills = softSkills;
    onSubmit(data);
  });

  const handleVoiceInput = useCallback((field: any, text: string) => {
    const current = watch(field) || '';
    const newText = current + (current && !current.endsWith(' ') ? ' ' : '') + text;
    setValue(field, newText, {
      shouldValidate: true,
      shouldDirty: true
    });
  }, [setValue, watch]);

  const handleCertificateData = useCallback((data: {
    degree: string;
    institution: string;
    graduationDate: string;
    gpa?: string;
    honors?: string;
  }, index: number) => {
    // Auto-populate the education fields with extracted data
    setValue(`education.${index}.institution`, data.institution, { shouldValidate: true });
    setValue(`education.${index}.degree`, data.degree, { shouldValidate: true });

    // Parse graduation date to extract start and end dates
    const year = data.graduationDate.match(/\d{4}/)?.[0];
    if (year) {
      // Assume 4-year degree if only graduation year is found
      const gradYear = parseInt(year);
      setValue(`education.${index}.endDate`, year, { shouldValidate: true });
      setValue(`education.${index}.startDate`, (gradYear - 4).toString(), { shouldValidate: true });
    } else {
      setValue(`education.${index}.endDate`, data.graduationDate, { shouldValidate: true });
    }
  }, [setValue]);

  return (
    <form onSubmit={onFormSubmit} className="max-w-4xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between items-end mb-2">
          <h2 className="text-xl font-bold text-gray-900">{sections[currentSection]}</h2>
          <span className="text-sm font-medium text-gray-500">Step {currentSection + 1} of {sections.length}</span>
        </div>
        <div className="w-full bg-gray-200 h-1 rounded-sm">
          <div
            className="bg-gray-900 h-1 rounded-sm transition-all duration-300 ease-in-out"
            style={{ width: `${((currentSection + 1) / sections.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Section 0: Personal Information */}
      {currentSection === 0 && (
        <div className="card space-y-4">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Personal Information</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name *
            </label>
            <input
              {...register('personalInfo.fullName')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="John Doe"
            />
            {errors.personalInfo?.fullName && (
              <p className="text-red-500 text-sm mt-1">{errors.personalInfo.fullName.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location *
            </label>
            <input
              {...register('personalInfo.location')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Boston, MA"
            />
            {errors.personalInfo?.location && (
              <p className="text-red-500 text-sm mt-1">{errors.personalInfo.location.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              {...register('personalInfo.email')}
              type="email"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="john.doe@example.com"
            />
            {errors.personalInfo?.email && (
              <p className="text-red-500 text-sm mt-1">{errors.personalInfo.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              LinkedIn URL
            </label>
            <input
              {...register('personalInfo.linkedin')}
              type="url"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://linkedin.com/in/johndoe"
            />
            {errors.personalInfo?.linkedin && (
              <p className="text-red-500 text-sm mt-1">{errors.personalInfo.linkedin.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              GitHub URL
            </label>
            <input
              {...register('personalInfo.github')}
              type="url"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://github.com/johndoe"
            />
            {errors.personalInfo?.github && (
              <p className="text-red-500 text-sm mt-1">{errors.personalInfo.github.message}</p>
            )}
          </div>
        </div>
      )}

      {/* Section 1: Professional Summary */}
      {currentSection === 1 && (
        <div className="card space-y-4">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Professional Summary</h2>
          <p className="text-gray-600 mb-4">
            Write a concise 2-3 sentence summary of your professional background and career goals.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Summary *
            </label>
            <div className="relative">
              <textarea
                {...register('summary')}
                rows={5}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pb-10"
                placeholder="Experienced software engineer with 5 years in full-stack development, specializing in React and Node.js. Proven track record of building scalable web applications and leading development teams..."
              />
              <div className="absolute bottom-2 right-2">
                <VoiceInput onTranscript={(text) => handleVoiceInput('summary', text)} />
              </div>
            </div>
            {errors.summary && (
              <p className="text-red-500 text-sm mt-1">{errors.summary.message}</p>
            )}
            <div className="flex justify-between items-center mt-2">
              <p className="text-sm text-gray-500">
                AI will enhance this to be more impactful and ATS-optimized
              </p>
              <button
                type="button"
                onClick={() => handleOptimize('summary')}
                disabled={optimizingField === 'summary'}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-sm text-sm font-medium hover:bg-blue-100 transition-colors border border-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {optimizingField === 'summary' ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-700"></div>
                    Optimizing...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                    Optimize & Improve
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section 2: Work Experience */}
      {currentSection === 2 && (
        <div className="card space-y-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Work Experience</h2>
          <p className="text-gray-600 mb-4">
            Add your work experience. Focus on achievements and quantifiable results.
          </p>

          {experienceFields.map((field, index) => (
            <div key={field.id} className="p-4 border-2 border-gray-200 rounded-lg space-y-4">
              {experienceFields.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeExperience(index)}
                  className="float-right text-red-500 hover:text-red-700 text-sm font-medium"
                >
                  Remove
                </button>
              )}

              <h3 className="font-bold text-lg">Experience #{index + 1}</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company *
                  </label>
                  <input
                    {...register(`experience.${index}.company`)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Google Inc."
                  />
                  {errors.experience?.[index]?.company && (
                    <p className="text-red-500 text-sm mt-1">{errors.experience[index]?.company?.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role *
                  </label>
                  <input
                    {...register(`experience.${index}.role`)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Senior Software Engineer"
                  />
                  {errors.experience?.[index]?.role && (
                    <p className="text-red-500 text-sm mt-1">{errors.experience[index]?.role?.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    {...register(`experience.${index}.startDate`)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Jan 2022"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date *
                  </label>
                  <input
                    {...register(`experience.${index}.endDate`)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Present"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description & Achievements *
                </label>
                <div className="relative">
                  <textarea
                    {...register(`experience.${index}.description`)}
                    rows={5}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 pb-10"
                    placeholder="Led team of 5 engineers. Increased system performance by 40%. Reduced costs by $200K annually through optimization..."
                  />
                  <div className="absolute bottom-2 right-2">
                    <VoiceInput onTranscript={(text) => handleVoiceInput(`experience.${index}.description`, text)} />
                  </div>
                </div>
                {errors.experience?.[index]?.description && (
                  <p className="text-red-500 text-sm mt-1">{errors.experience[index]?.description?.message}</p>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  Include quantifiable metrics when possible
                </p>
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => handleOptimize(`experience.${index}.description`)}
                    disabled={optimizingField === `experience.${index}.description`}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-sm text-sm font-medium hover:bg-blue-100 transition-colors border border-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {optimizingField === `experience.${index}.description` ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-700"></div>
                        Optimizing...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                        Optimize & Improve
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => appendExperience({
              company: '',
              role: '',
              startDate: '',
              endDate: '',
              description: '',
              technologies: [],
            })}
            className="w-full py-2.5 px-4 border border-gray-900 text-gray-900 rounded-sm hover:bg-gray-50 font-medium text-sm transition-colors"
          >
            + Add Experience
          </button>
        </div>
      )}

      {/* Section 3: Education */}
      {currentSection === 3 && (
        <div className="card space-y-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Education</h2>
          <p className="text-gray-600 mb-4">
            Add your educational background. You can manually enter details or upload certificate/diploma images to auto-fill the information.
          </p>

          {/* Batch Upload Section */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-bold text-blue-900 mb-2 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              🚀 Quick Start: Upload All Certificates at Once
            </h3>
            <p className="text-sm text-blue-700 mb-4">
              Select multiple certificate images and we'll automatically create separate education entries for each one!
            </p>
            <CertificateUpload
              onDataExtracted={() => { }}
              onBatchDataExtracted={handleBatchCertificates}
              allowMultiple={true}
              index={-1}
            />
          </div>

          {educationFields.map((field, index) => (
            <div key={field.id} className="p-4 border-2 border-gray-200 rounded-lg space-y-4">
              {educationFields.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeEducation(index)}
                  className="float-right text-red-500 hover:text-red-700 text-sm font-medium"
                >
                  Remove
                </button>
              )}

              <h3 className="font-bold text-lg">Education #{index + 1}</h3>

              {/* Certificate Upload */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  Quick Fill: Upload Certificate #{index + 1}
                </h4>
                <p className="text-xs text-blue-700 mb-3">
                  Upload a diploma or certificate image to automatically fill the fields below
                </p>
                <CertificateUpload onDataExtracted={(data) => handleCertificateData(data, index)} index={index} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Institution *
                </label>
                <input
                  {...register(`education.${index}.institution`)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Harvard University"
                />
                {errors.education?.[index]?.institution && (
                  <p className="text-red-500 text-sm mt-1">{errors.education[index]?.institution?.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Degree *
                </label>
                <input
                  {...register(`education.${index}.degree`)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Bachelor of Science in Computer Science"
                />
                {errors.education?.[index]?.degree && (
                  <p className="text-red-500 text-sm mt-1">{errors.education[index]?.degree?.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    {...register(`education.${index}.startDate`)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="2018"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date *
                  </label>
                  <input
                    {...register(`education.${index}.endDate`)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="2022"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => appendEducation({
              institution: '',
              degree: '',
              startDate: '',
              endDate: '',
            })}
            className="w-full py-2.5 px-4 border border-gray-900 text-gray-900 rounded-sm hover:bg-gray-50 font-medium text-sm transition-colors"
          >
            + Add Education
          </button>
        </div>
      )}

      {/* Section 4: Skills */}
      {currentSection === 4 && (
        <div className="card space-y-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Skills</h2>

          <label className="block text-sm font-medium text-gray-700 mb-2">
            Technical/Hard Skills * (at least one required)
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={hardSkillsInput}
              onChange={(e) => setHardSkillsInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (hardSkillsInput.includes(',')) {
                    const newSkills = hardSkillsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    const updatedSkills = [...hardSkills, ...newSkills];
                    setHardSkills(updatedSkills);
                    setValue('skills.hardSkills', updatedSkills, { shouldValidate: true });
                    setHardSkillsInput('');
                  } else {
                    addHardSkill();
                  }
                }
              }}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="React, Python, AWS (comma separated enabled)"
            />
            <button
              type="button"
              onClick={() => {
                if (hardSkillsInput.includes(',')) {
                  const newSkills = hardSkillsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                  const updatedSkills = [...hardSkills, ...newSkills];
                  setHardSkills(updatedSkills);
                  setValue('skills.hardSkills', updatedSkills, { shouldValidate: true });
                  setHardSkillsInput('');
                } else {
                  addHardSkill();
                }
              }}
              className="px-6 py-2 bg-gray-900 text-white rounded-sm hover:bg-gray-800 font-medium text-sm transition-colors"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {hardSkills.map((skill, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-gray-100 text-gray-800 rounded-sm text-sm flex items-center gap-2 border border-gray-200"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => removeHardSkill(index)}
                  className="text-gray-500 hover:text-gray-800 font-bold"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {hardSkills.length === 0 && (
            <p className="text-red-500 text-sm mt-1">At least one hard skill is required</p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Soft Skills (Optional)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={softSkillsInput}
                onChange={(e) => setSoftSkillsInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (softSkillsInput.includes(',')) {
                      const newSkills = softSkillsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                      const updatedSkills = [...softSkills, ...newSkills];
                      setSoftSkills(updatedSkills);
                      setValue('skills.softSkills', updatedSkills, { shouldValidate: true });
                      setSoftSkillsInput('');
                    } else {
                      addSoftSkill();
                    }
                  }
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Leadership, Communication (comma separated enabled)"
              />
              <button
                type="button"
                onClick={() => {
                  if (softSkillsInput.includes(',')) {
                    const newSkills = softSkillsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    const updatedSkills = [...softSkills, ...newSkills];
                    setSoftSkills(updatedSkills);
                    setValue('skills.softSkills', updatedSkills, { shouldValidate: true });
                    setSoftSkillsInput('');
                  } else {
                    addSoftSkill();
                  }
                }}
                className="px-6 py-2 bg-gray-900 text-white rounded-sm hover:bg-gray-800 font-medium text-sm transition-colors"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {softSkills.map((skill, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-gray-100 text-gray-800 rounded-sm text-sm flex items-center gap-2 border border-gray-200"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSoftSkill(index)}
                    className="text-gray-500 hover:text-gray-800 font-bold"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Section 5: Job Description */}
      {currentSection === 5 && (
        <div className="card space-y-4">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Job Description (Optional but Recommended)</h2>
          <p className="text-gray-600 mb-4">
            Paste the job description you're applying for. This helps optimize your resume for ATS and provides keyword matching analysis.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Job Description
            </label>
            <div className="relative">
              <textarea
                {...register('jobDescription')}
                rows={12}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pb-10"
                placeholder="Paste the job description here..."
              />
              <div className="absolute bottom-2 right-2">
                <VoiceInput onTranscript={(text) => handleVoiceInput('jobDescription', text)} />
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Leave blank if you want a general Harvard-style resume without job-specific optimization
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between gap-4 mt-8">
        {currentSection > 0 && (
          <button
            type="button"
            onClick={prevSection}
            disabled={isLoading}
            className="px-6 py-2.5 border border-gray-300 text-gray-600 rounded-sm hover:bg-gray-50 font-medium disabled:opacity-50 text-sm transition-colors"
          >
            ← Previous
          </button>
        )}

        {currentSection < sections.length - 1 ? (
          <button
            type="button"
            onClick={nextSection}
            disabled={isLoading}
            className="ml-auto px-6 py-2.5 bg-gray-900 text-white rounded-sm hover:bg-gray-800 font-medium disabled:opacity-50 text-sm transition-colors"
          >
            Next →
          </button>
        ) : (
          <button
            type="submit"
            disabled={isLoading || hardSkills.length === 0}
            className="ml-auto px-8 py-2.5 bg-gray-900 text-white rounded-sm hover:bg-gray-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors shadow-sm"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating...
              </span>
            ) : (
              'Generate Resume'
            )}
          </button>
        )}
      </div>
    </form>
  );
}
