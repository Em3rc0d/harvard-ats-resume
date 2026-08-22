import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personalInfoSchema, resumeRequestSchema } from '../../lib/schemas';

test('P04-class sparse candidate preserves unknown geographic location without inventing candidate truth', () => {
  const parsed = resumeRequestSchema.parse({
    personalInfo: {
      fullName: 'PERSONA FOUR',
      location: '',
      email: 'p04@example.test',
      linkedin: '',
      github: '',
    },
    summary: '',
    experience: [],
    education: [],
    skills: {
      hardSkills: ['Python', 'SQL', 'Git'],
      softSkills: [],
    },
    projects: [],
    certifications: [],
    languages: [
      {
        language: 'English',
        proficiency: 'Professional',
      },
    ],
    jobDescription: 'Data Support Analyst. Required: SQL and Git. Preferred: Python.',
  });

  assert.equal(parsed.personalInfo.location, '');
  assert.deepEqual(parsed.skills.hardSkills, ['Python', 'SQL', 'Git']);
});

test('candidate location remains validated when a location is actually provided', () => {
  assert.throws(() => personalInfoSchema.parse({
    fullName: 'Candidate Name',
    location: 'X',
    email: 'candidate@example.test',
    linkedin: '',
    github: '',
  }), /Location must be empty when unknown or at least 2 characters when provided/);
});
