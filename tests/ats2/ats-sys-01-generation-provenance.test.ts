import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DETERMINISTIC_RESUME_CONTRACT_VERSION,
  DETERMINISTIC_RESUME_MODEL,
  DETERMINISTIC_RESUME_PROVIDER,
  generateResumeDraft,
} from '../../lib/local-ai';

const minimalCandidate = {
  personalInfo: {
    fullName: 'Persona Provenance',
    email: 'provenance@example.test',
    phone: '',
    location: 'Remote',
    linkedin: '',
    github: '',
  },
  summary: 'Backend developer working with Python services.',
  experience: [],
  education: [],
  skills: { hardSkills: ['Python'], softSkills: [] },
  projects: [],
  certifications: [],
  languages: [],
  jobDescription: '',
};

test('ATS-SYS-01 deterministic resume draft emits truthful generation provenance', async () => {
  const result = await generateResumeDraft(minimalCandidate);
  assert.equal(result.success, true);
  assert.deepEqual(result.generation, {
    provider: DETERMINISTIC_RESUME_PROVIDER,
    model: DETERMINISTIC_RESUME_MODEL,
    contractVersion: DETERMINISTIC_RESUME_CONTRACT_VERSION,
  });
});

test('ATS-SYS-01 generation route persists actual composer metadata rather than retired Ollama resume metadata', () => {
  const route = readFileSync('app/api/generate-resume/route.ts', 'utf8');
  assert.match(route, /generation:\s*localAIResult\.generation/);
  assert.doesNotMatch(route, /OLLAMA_RESUME_(?:PROVIDER|MODEL|CONTRACT_VERSION)/);
});
