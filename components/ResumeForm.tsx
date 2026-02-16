'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resumeRequestSchema, ResumeRequest } from '@/lib/schemas';
import { useState, useCallback } from 'react';
import VoiceInput from './VoiceInput';

interface ResumeFormProps {
  onSubmit: (data: ResumeRequest) => Promise<void>;
  isLoading: boolean;
}

export default function ResumeForm({ onSubmit, isLoading }: ResumeFormProps) {
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
    defaultValues: {
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
  const [hardSkills, setHardSkills] = useState<string[]>([]);
  const [softSkills, setSoftSkills] = useState<string[]>([]);

  const addHardSkill = () => {
    if (hardSkillsInput.trim()) {
      const newSkills = [...hardSkills, hardSkillsInput.trim()];
      setHardSkills(newSkills);
      setHardSkillsInput('');
    }
  };

  const addSoftSkill = () => {
    if (softSkillsInput.trim()) {
      const newSkills = [...softSkills, softSkillsInput.trim()];
      setSoftSkills(newSkills);
      setSoftSkillsInput('');
    }
  };

  const removeHardSkill = (index: number) => {
    setHardSkills(hardSkills.filter((_, i) => i !== index));
  };

  const removeSoftSkill = (index: number) => {
    setSoftSkills(softSkills.filter((_, i) => i !== index));
  };

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

  return (
    <form onSubmit={onFormSubmit} className="max-w-4xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between mb-4">
          {sections.map((section, index) => (
            <div key={index} className="flex items-center flex-1">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full font-bold transition-all ${index <= currentSection
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-300 text-gray-600'
                  }`}
              >
                {index + 1}
              </div>
              {index < sections.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 ${index < currentSection ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                />
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-lg font-semibold text-gray-700">
          {sections[currentSection]}
        </p>
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
            <p className="text-sm text-gray-500 mt-1">
              AI will enhance this to be more impactful and ATS-optimized
            </p>
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
                  className="float-right text-red-600 hover:text-red-800 font-bold"
                >
                  ✕ Remove
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
            className="w-full py-2 px-4 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-medium"
          >
            + Add Experience
          </button>
        </div>
      )}

      {/* Section 3: Education */}
      {currentSection === 3 && (
        <div className="card space-y-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Education</h2>

          {educationFields.map((field, index) => (
            <div key={field.id} className="p-4 border-2 border-gray-200 rounded-lg space-y-4">
              {educationFields.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeEducation(index)}
                  className="float-right text-red-600 hover:text-red-800 font-bold"
                >
                  ✕ Remove
                </button>
              )}

              <h3 className="font-bold text-lg">Education #{index + 1}</h3>

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
            className="w-full py-2 px-4 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-medium"
          >
            + Add Education
          </button>
        </div>
      )}

      {/* Section 4: Skills */}
      {currentSection === 4 && (
        <div className="card space-y-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Skills</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Technical/Hard Skills * (at least one required)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={hardSkillsInput}
                onChange={(e) => setHardSkillsInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addHardSkill())}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="React, Python, AWS, etc."
              />
              <button
                type="button"
                onClick={addHardSkill}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {hardSkills.map((skill, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-2"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeHardSkill(index)}
                    className="text-blue-600 hover:text-blue-800 font-bold"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            {hardSkills.length === 0 && (
              <p className="text-red-500 text-sm mt-1">At least one hard skill is required</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Soft Skills (Optional)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={softSkillsInput}
                onChange={(e) => setSoftSkillsInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSoftSkill())}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Leadership, Communication, etc."
              />
              <button
                type="button"
                onClick={addSoftSkill}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {softSkills.map((skill, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm flex items-center gap-2"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSoftSkill(index)}
                    className="text-green-600 hover:text-green-800 font-bold"
                  >
                    ✕
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
            className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
          >
            ← Previous
          </button>
        )}

        {currentSection < sections.length - 1 ? (
          <button
            type="button"
            onClick={nextSection}
            disabled={isLoading}
            className="ml-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
          >
            Next →
          </button>
        ) : (
          <button
            type="submit"
            disabled={isLoading || hardSkills.length === 0}
            className="ml-auto px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating Resume...
              </span>
            ) : (
              '🎯 Generate ATS-Optimized Resume'
            )}
          </button>
        )}
      </div>
    </form>
  );
}
