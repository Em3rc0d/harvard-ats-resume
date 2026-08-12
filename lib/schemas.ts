import { z } from 'zod';

const PROFILE_URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

export function normalizeProfileUrlInput(value: unknown, expectedHost: string): unknown {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return '';

  const candidate = PROFILE_URL_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    const normalizedExpectedHost = expectedHost.toLowerCase();
    const isAllowedHost =
      hostname === normalizedExpectedHost || hostname === `www.${normalizedExpectedHost}`;
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';

    if (!isAllowedHost || !isHttp || parsed.username || parsed.password) {
      return trimmed;
    }

    parsed.protocol = 'https:';
    parsed.hostname = normalizedExpectedHost;
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function profileUrlSchema(expectedHost: string, message: string) {
  return z.preprocess(
    (value) => normalizeProfileUrlInput(value, expectedHost),
    z.union([
      z.literal(''),
      z.string().url(message).refine((value) => {
        try {
          const parsed = new URL(value);
          return parsed.hostname.toLowerCase() === expectedHost.toLowerCase();
        } catch {
          return false;
        }
      }, message),
    ]),
  ).optional();
}

// Personal Information Schema
export const personalInfoSchema = z.object({
  fullName: z.string().min(2, 'Full name is required').max(100),
  location: z.string().min(2, 'Location is required').max(100),
  email: z.string().email('Invalid email address'),
  linkedin: profileUrlSchema('linkedin.com', 'Invalid LinkedIn URL'),
  github: profileUrlSchema('github.com', 'Invalid GitHub URL'),
});

// Work Experience Schema
export const workExperienceSchema = z.object({
  company: z.string().min(1, 'Company name is required'),
  role: z.string().min(1, 'Role is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  technologies: z.array(z.string()).default([]),
});

// Education Schema
export const educationSchema = z.object({
  institution: z.string().min(1, 'Institution name is required'),
  degree: z.string().min(1, 'Degree is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
});

// Skills Schema
export const skillsSchema = z.object({
  hardSkills: z.array(z.string()).min(1, 'At least one hard skill is required'),
  softSkills: z.array(z.string()).default([]),
});

// Project Schema
export const projectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().min(10, 'Description is required'),
  technologies: z.array(z.string()).default([]),
  link: z.string().url('Invalid URL').optional().or(z.literal('')),
});

// Certification Schema
export const certificationSchema = z.object({
  name: z.string().min(1, 'Certification name is required'),
  issuer: z.string().min(1, 'Issuer is required'),
  date: z.string().min(1, 'Date is required'),
});

// Language Schema
export const languageSchema = z.object({
  language: z.string().min(1, 'Language is required'),
  proficiency: z.string().min(1, 'Proficiency is required'),
});

// Complete Resume Request Schema
export const resumeRequestSchema = z.object({
  personalInfo: personalInfoSchema,
  summary: z.string().min(20, 'Summary must be at least 20 characters').max(2000),
  experience: z.array(workExperienceSchema).min(1, 'At least one work experience is required'),
  education: z.array(educationSchema).min(1, 'At least one education entry is required'),
  skills: skillsSchema,
  projects: z.array(projectSchema).default([]).optional(),
  certifications: z.array(certificationSchema).default([]).optional(),
  languages: z.array(languageSchema).default([]).optional(),
  jobDescription: z.string().optional().nullable(),
});

// Types
export type PersonalInfo = z.infer<typeof personalInfoSchema>;
export type WorkExperience = z.infer<typeof workExperienceSchema>;
export type Education = z.infer<typeof educationSchema>;
export type Skills = z.infer<typeof skillsSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Certification = z.infer<typeof certificationSchema>;
export type Language = z.infer<typeof languageSchema>;
export type ResumeRequest = z.infer<typeof resumeRequestSchema>;

const jobMatchRequirementResponseSchema = z.object({
  id: z.string(),
  statement: z.string(),
  kind: z.enum([
    'SKILL',
    'EXPERIENCE',
    'RESPONSIBILITY',
    'EDUCATION',
    'CERTIFICATION',
    'LANGUAGE',
    'LOCATION',
    'WORK_AUTHORIZATION',
    'OTHER',
  ]),
  necessity: z.enum(['REQUIRED', 'PREFERRED', 'UNKNOWN']),
  canonicalConcept: z.string().optional(),
  minimumYears: z.number().nonnegative().optional(),
  status: z.enum(['MATCH', 'POTENTIAL_MATCH', 'GAP', 'UNKNOWN', 'BLOCKER']),
  rationale: z.string(),
  assertionIds: z.array(z.string()),
});

export const jobMatchResponseSchema = z.object({
  score: z.number().min(0).max(100),
  language: z.enum(['EN', 'ES', 'UNKNOWN']),
  breakdown: z.object({
    required: z.object({ matched: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
    preferred: z.object({ matched: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
    unknown: z.object({ matched: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
    gaps: z.number().int().nonnegative(),
    blockers: z.number().int().nonnegative(),
  }),
  requirements: z.array(jobMatchRequirementResponseSchema),
});

// API Response Schema
export const resumeResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    formattedResume: z.string(),
    atsScore: z.number().min(0).max(100),
    matchedKeywords: z.array(z.string()),
    missingKeywords: z.array(z.string()),
    suggestions: z.array(z.string()),
    jobMatch: jobMatchResponseSchema.optional(),
  }).optional(),
  error: z.string().optional(),
});

export type JobMatchResponse = z.infer<typeof jobMatchResponseSchema>;
export type ResumeResponse = z.infer<typeof resumeResponseSchema>;
