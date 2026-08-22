import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ImportedCandidateDraft } from '../../lib/application/import/ResumeImportProvider';
import {
  reconcileCandidateToSource,
  type ExtractedResumeTextDocument,
} from '../../lib/infrastructure/import/NativeResumeImportProvider';
import {
  recoverSourceExactPreambleIdentity,
} from '../../lib/infrastructure/import/OllamaResumeImportV3Provider';

function omittedPersonalInfo() {
  return {
    fullName: '',
    email: 'p04@example.test',
    location: '',
    linkedin: '',
    github: '',
  };
}

function sparseDocument(): ExtractedResumeTextDocument {
  const text = [
    'PERSONA FOUR',
    'Remote | p04@example.test',
    'SKILLS',
    'Python, SQL, Git',
    'LANGUAGES',
    'English — Professional',
  ].join('\n');
  return {
    format: 'DOCX',
    text,
    pages: [{ text }],
  };
}

test('sparse preamble recovery restores an omitted source-exact identity before reconciliation', () => {
  const recovered = recoverSourceExactPreambleIdentity(
    omittedPersonalInfo(),
    'PERSONA FOUR\nRemote | p04@example.test',
  );

  assert.equal(recovered.fullName, 'PERSONA FOUR');
  assert.equal(recovered.email, 'p04@example.test');

  const candidate: ImportedCandidateDraft = {
    personalInfo: recovered,
    summary: '',
    experience: [],
    education: [],
    skills: { hardSkills: ['Python', 'SQL', 'Git'], softSkills: [] },
    projects: [],
    certifications: [],
    languages: [{ language: 'English', proficiency: 'Professional' }],
  };

  const reconciliation = reconcileCandidateToSource(candidate, sparseDocument());
  assert.equal(reconciliation.candidate.personalInfo.fullName, 'PERSONA FOUR');
  assert.deepEqual(reconciliation.rejectedFieldPaths, []);
  assert.ok(reconciliation.evidenceMap.some((item) =>
    item.fieldPath === 'personalInfo.fullName' && item.excerpt === 'PERSONA FOUR'));
});

test('sparse preamble recovery never overwrites a model-proposed source identity', () => {
  const recovered = recoverSourceExactPreambleIdentity(
    { ...omittedPersonalInfo(), fullName: 'PERSONA FOUR' },
    'PERSONA FOUR\nRemote | p04@example.test',
  );

  assert.equal(recovered.fullName, 'PERSONA FOUR');
});

test('sparse preamble recovery refuses generic or structurally ambiguous headers', () => {
  const generic = recoverSourceExactPreambleIdentity(
    omittedPersonalInfo(),
    'RESUME\np04@example.test',
  );
  assert.equal(generic.fullName, '');

  const nonAdjacentContact = recoverSourceExactPreambleIdentity(
    omittedPersonalInfo(),
    'PERSONA FOUR\nData Support Analyst\np04@example.test',
  );
  assert.equal(nonAdjacentContact.fullName, '');

  const noEmailAnchor = recoverSourceExactPreambleIdentity(
    { ...omittedPersonalInfo(), email: '' },
    'PERSONA FOUR\nRemote',
  );
  assert.equal(noEmailAnchor.fullName, '');
});
