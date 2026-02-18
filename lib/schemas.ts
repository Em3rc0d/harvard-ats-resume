import { z } from 'zod';

// Personal Information Schema
export const personalInfoSchema = z.object({
  fullName: z.string().min(2, 'Full name is required').max(100),
  location: z.string().min(2, 'Location is required').max(100),
  email: z.string().email('Invalid email address'),
  linkedin: z.string().url('Invalid LinkedIn URL').or(z.literal('')).optional(),
  github: z.string().url('Invalid GitHub URL').or(z.literal('')).optional(),
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

// Complete Resume Request Schema
export const resumeRequestSchema = z.object({
  personalInfo: personalInfoSchema,
  summary: z.string().min(20, 'Summary must be at least 20 characters').max(2000),
  experience: z.array(workExperienceSchema).min(1, 'At least one work experience is required'),
  education: z.array(educationSchema).min(1, 'At least one education entry is required'),
  skills: skillsSchema,
  jobDescription: z.string().optional().nullable(),
});

// Types
export type PersonalInfo = z.infer<typeof personalInfoSchema>;
export type WorkExperience = z.infer<typeof workExperienceSchema>;
export type Education = z.infer<typeof educationSchema>;
export type Skills = z.infer<typeof skillsSchema>;
export type ResumeRequest = z.infer<typeof resumeRequestSchema>;

// API Response Schema
export const resumeResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    formattedResume: z.string(),
    atsScore: z.number().min(0).max(100),
    matchedKeywords: z.array(z.string()),
    missingKeywords: z.array(z.string()),
    suggestions: z.array(z.string()),
  }).optional(),
  error: z.string().optional(),
});

export type ResumeResponse = z.infer<typeof resumeResponseSchema>;
