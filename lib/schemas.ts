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
    const isAllowedHost = hostname === normalizedExpectedHost || hostname === `www.${normalizedExpectedHost}`;
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';

    if (!isAllowedHost || !isHttp || parsed.username || parsed.password) return trimmed;

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
          return parsed.protocol === 'https:' &&
            parsed.hostname.toLowerCase() === expectedHost.toLowerCase() &&
            !parsed.username && !parsed.password;
        } catch {
          return false;
        }
      }, message),
    ]),
  ).optional();
}

const optionalEvidenceString = (max: number) => z.string().max(max).default('');

export const personalInfoSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(100),
  location: z.string().trim().min(2, 'Location is required').max(100),
  email: z.string().trim().email('Invalid email address'),
  linkedin: profileUrlSchema('linkedin.com', 'Invalid LinkedIn URL'),
  github: profileUrlSchema('github.com', 'Invalid GitHub URL'),
});

/**
 * A work record may be incomplete because source reconciliation deliberately
 * removes leaves that cannot be proved from the uploaded document. We preserve
 * the remaining source-backed record instead of asking the candidate to invent
 * a missing date or description merely to satisfy a form shape.
 */
export const workExperienceSchema = z.object({
  company: optionalEvidenceString(250),
  role: optionalEvidenceString(250),
  startDate: optionalEvidenceString(100),
  endDate: optionalEvidenceString(100),
  description: optionalEvidenceString(5000),
  technologies: z.array(z.string().trim().min(1).max(200)).default([]),
}).superRefine((value, context) => {
  if (!value.company.trim() && !value.role.trim() && !value.description.trim() && value.technologies.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['company'],
      message: 'Work experience needs at least one material source-backed field.',
    });
  }
});

export const educationSchema = z.object({
  institution: optionalEvidenceString(300),
  degree: optionalEvidenceString(300),
  startDate: optionalEvidenceString(100),
  endDate: optionalEvidenceString(100),
}).superRefine((value, context) => {
  if (!value.institution.trim() && !value.degree.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['institution'],
      message: 'Education needs an institution or degree.',
    });
  }
});

export const skillsSchema = z.object({
  hardSkills: z.array(z.string().trim().min(1).max(200)).default([]),
  softSkills: z.array(z.string().trim().min(1).max(200)).default([]),
});

export const projectSchema = z.object({
  name: optionalEvidenceString(300),
  description: optionalEvidenceString(5000),
  technologies: z.array(z.string().trim().min(1).max(200)).default([]),
  link: z.union([z.literal(''), z.string().url('Invalid URL')]).default(''),
}).superRefine((value, context) => {
  if (!value.name.trim() && !value.description.trim() && value.technologies.length === 0 && !value.link.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['name'],
      message: 'Project needs at least one material source-backed field.',
    });
  }
});

export const certificationSchema = z.object({
  name: optionalEvidenceString(300),
  issuer: optionalEvidenceString(300),
  date: optionalEvidenceString(100),
}).superRefine((value, context) => {
  if (!value.name.trim() && !value.issuer.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['name'],
      message: 'Certification needs a name or issuer.',
    });
  }
});

export const languageSchema = z.object({
  language: z.string().trim().min(1, 'Language is required').max(200),
  proficiency: optionalEvidenceString(200),
});

const resumeRequestBaseSchema = z.object({
  personalInfo: personalInfoSchema,
  summary: optionalEvidenceString(2000),
  experience: z.array(workExperienceSchema).default([]),
  education: z.array(educationSchema).default([]),
  skills: skillsSchema,
  projects: z.array(projectSchema).default([]).optional(),
  certifications: z.array(certificationSchema).default([]).optional(),
  languages: z.array(languageSchema).default([]).optional(),
  jobDescription: z.string().optional().nullable(),
});

type ResumeEvidenceShape = z.infer<typeof resumeRequestBaseSchema>;

export function hasMaterialCareerEvidence(data: ResumeEvidenceShape): boolean {
  return Boolean(
    data.summary.trim() ||
    data.experience.length > 0 ||
    data.education.length > 0 ||
    data.skills.hardSkills.length > 0 ||
    data.skills.softSkills.length > 0 ||
    (data.projects?.length ?? 0) > 0 ||
    (data.certifications?.length ?? 0) > 0 ||
    (data.languages?.length ?? 0) > 0
  );
}

// Candidate shape is flexible; candidate truth is not. We require at least one
// material evidence dimension, but never require the user to invent a summary,
// employer, degree or credential that their career does not contain.
export const resumeRequestSchema = resumeRequestBaseSchema.superRefine((data, context) => {
  if (!hasMaterialCareerEvidence(data)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['careerEvidence'],
      message: 'Add at least one material career evidence item before continuing.',
    });
  }
});

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
