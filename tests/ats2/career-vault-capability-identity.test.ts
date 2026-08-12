import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResumeRequest } from '../../lib/schemas';
import { deriveCareerVaultIdentity } from '../../lib/application/career-vault/CareerVaultIdentity';
import { candidateProfileIdFromCareerVaultCapability } from '../../lib/application/career-vault/CareerVaultCapabilityIdentity';

const VAULT_ID = '123e4567-e89b-42d3-a456-426614174000';

const data: ResumeRequest = {
  personalInfo: {
    fullName: 'Identity Test',
    location: 'Lima, Peru',
    email: 'identity@example.com',
    linkedin: '',
    github: '',
  },
  summary: 'Backend engineer.',
  experience: [],
  education: [],
  skills: { hardSkills: ['TypeScript'], softSkills: [] },
  projects: [],
  certifications: [],
  languages: [],
  jobDescription: 'Senior Backend Engineer\nTypeScript is required.',
};

test('capability-only candidate identity matches CareerVault identity derivation', () => {
  const full = deriveCareerVaultIdentity(data, VAULT_ID);
  const capabilityOnly = candidateProfileIdFromCareerVaultCapability(VAULT_ID);
  assert.equal(capabilityOnly, full.candidateProfileId);
});
