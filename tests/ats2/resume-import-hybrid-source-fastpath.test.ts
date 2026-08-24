import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractSourceExactEducation,
  extractSourceExactLanguages,
  extractSourceExactPersonalInfo,
  extractSourceExactTechnicalSkills,
  ResumeImportSectionTimeoutError,
} from '../../lib/infrastructure/import/OllamaResumeImportV3Provider';

test('source-exact personal fast path preserves explicit identity/contact facts without promoting Remote into location', () => {
  assert.deepEqual(
    extractSourceExactPersonalInfo('PERSONA TRES\nLima, Perú | p03@example.test'),
    {
      fullName: 'PERSONA TRES',
      email: 'p03@example.test',
      location: 'Lima, Perú',
      linkedin: '',
      github: '',
    },
  );

  assert.deepEqual(
    extractSourceExactPersonalInfo('PERSONA FOUR\nRemote | p04@example.test'),
    {
      fullName: 'PERSONA FOUR',
      email: 'p04@example.test',
      location: '',
      linkedin: '',
      github: '',
    },
  );
});

test('personal fast path declines ambiguous contact material instead of guessing a field', () => {
  assert.equal(
    extractSourceExactPersonalInfo('PERSONA TEST\nLima | p@example.test | +51 999 999 999'),
    undefined,
  );
});

test('explicit technical skill section is copied source-exact while generic SKILLS still requires bounded AI', () => {
  assert.deepEqual(
    extractSourceExactTechnicalSkills('HABILIDADES TÉCNICAS\nJava, Spring Boot, PostgreSQL, Git'),
    {
      hardSkills: ['Java', 'Spring Boot', 'PostgreSQL', 'Git'],
      softSkills: [],
    },
  );

  assert.equal(
    extractSourceExactTechnicalSkills('SKILLS\nLeadership, Communication'),
    undefined,
  );
});

test('explicit language/proficiency pairs are copied without translation or strengthening', () => {
  assert.deepEqual(
    extractSourceExactLanguages('IDIOMAS\nEspañol — Nativo\nInglés — Intermedio'),
    {
      items: [
        { language: 'Español', proficiency: 'Nativo' },
        { language: 'Inglés', proficiency: 'Intermedio' },
      ],
    },
  );

  assert.equal(extractSourceExactLanguages('LANGUAGES\nEnglish'), undefined);
});

test('simple one-record education shape is copied exactly and ambiguous education falls back to AI', () => {
  assert.deepEqual(
    extractSourceExactEducation('EDUCACIÓN\nUniversidad de Ejemplo — Ingeniería de Sistemas\n2022 - Actualidad'),
    {
      items: [{
        institution: 'Universidad de Ejemplo',
        degree: 'Ingeniería de Sistemas',
        startDate: '2022',
        endDate: 'Actualidad',
        honors: '',
      }],
    },
  );

  assert.equal(
    extractSourceExactEducation('EDUCATION\nExample University\nComputer Science\n2022 - 2026'),
    undefined,
  );
});

test('remaining AI timeouts retain the exact section boundary for runtime diagnosis', () => {
  const error = new ResumeImportSectionTimeoutError(90_000, 'work experience records');
  assert.equal(error.timeoutMs, 90_000);
  assert.equal(error.section, 'work experience records');
  assert.match(error.message, /work experience records/);
});

test('hybrid importer still requires bounded AI for ambiguity-heavy records so P10 local-AI fault proof remains meaningful', () => {
  const source = readFileSync('lib/infrastructure/import/OllamaResumeImportV3Provider.ts', 'utf8');
  assert.match(source, /label: 'work experience records'/);
  assert.match(source, /label: 'project records'/);
  assert.match(source, /sourceExactPersonalInfo \? 'SOURCE_EXACT' : 'AI'/);
  assert.match(source, /native-text-ollama-v3\.2-hybrid-source-fastpath/);
});
