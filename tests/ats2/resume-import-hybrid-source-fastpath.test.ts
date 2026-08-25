import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractSourceExactEducation,
  extractSourceExactExperience,
  extractSourceExactLanguages,
  extractSourceExactPersonalInfo,
  extractSourceExactProjects,
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

test('single conventional experience records are copied source-exact in English and Spanish', () => {
  assert.deepEqual(
    extractSourceExactExperience([
      'EXPERIENCE',
      'Northstar Lab — Software Developer Intern',
      'Jun 2025 - Dec 2025',
      'Built internal TypeScript and React interfaces for operational workflows.',
      'Technologies: TypeScript, React, PostgreSQL',
    ].join('\n')),
    {
      items: [{
        company: 'Northstar Lab',
        role: 'Software Developer Intern',
        startDate: 'Jun 2025',
        endDate: 'Dec 2025',
        description: 'Built internal TypeScript and React interfaces for operational workflows.',
        technologies: ['TypeScript', 'React', 'PostgreSQL'],
      }],
    },
  );

  assert.deepEqual(
    extractSourceExactExperience([
      'EXPERIENCIA',
      'Laboratorio Andino — Practicante de Desarrollo',
      'Ene 2025 - Dic 2025',
      'Implementó endpoints REST y pruebas automatizadas para servicios internos.',
      'Tecnologías: Java, Spring Boot, PostgreSQL, Git',
    ].join('\n')),
    {
      items: [{
        company: 'Laboratorio Andino',
        role: 'Practicante de Desarrollo',
        startDate: 'Ene 2025',
        endDate: 'Dic 2025',
        description: 'Implementó endpoints REST y pruebas automatizadas para servicios internos.',
        technologies: ['Java', 'Spring Boot', 'PostgreSQL', 'Git'],
      }],
    },
  );
});

test('experience fast path declines multi-record or ambiguous layouts instead of merging facts', () => {
  assert.equal(
    extractSourceExactExperience([
      'EXPERIENCE',
      'Company A — Developer',
      '2024 - 2025',
      'Built APIs.',
      'Technologies: TypeScript',
      'Company B — Engineer',
      '2025 - Present',
      'Maintained services.',
      'Technologies: Go',
    ].join('\n')),
    undefined,
  );

  assert.equal(
    extractSourceExactExperience([
      'EXPERIENCE',
      'Northstar Lab',
      'Software Developer Intern',
      'Jun 2025 - Dec 2025',
      'Built internal interfaces.',
    ].join('\n')),
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

test('single conventional project records are copied source-exact without inventing a link', () => {
  assert.deepEqual(
    extractSourceExactProjects([
      'PROJECTS',
      'QueueBoard',
      'Built a small task board for student teams.',
      'Technologies: TypeScript, React',
    ].join('\n')),
    {
      items: [{
        name: 'QueueBoard',
        description: 'Built a small task board for student teams.',
        technologies: ['TypeScript', 'React'],
        link: '',
      }],
    },
  );

  assert.deepEqual(
    extractSourceExactProjects([
      'PROYECTOS',
      'Inventario Demo',
      'API para registrar productos y movimientos de inventario.',
      'Tecnologías: Java, Spring Boot',
    ].join('\n')),
    {
      items: [{
        name: 'Inventario Demo',
        description: 'API para registrar productos y movimientos de inventario.',
        technologies: ['Java', 'Spring Boot'],
        link: '',
      }],
    },
  );
});

test('project fast path declines multi-record or malformed layouts rather than combining projects', () => {
  assert.equal(
    extractSourceExactProjects([
      'PROJECTS',
      'Project One',
      'First description.',
      'Technologies: TypeScript',
      'Project Two',
      'Second description.',
      'Technologies: Python',
    ].join('\n')),
    undefined,
  );

  assert.equal(
    extractSourceExactProjects('PROJECTS\nQueueBoard\nBuilt a task board.'),
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
  const error = new ResumeImportSectionTimeoutError(90_000, 'skills');
  assert.equal(error.timeoutMs, 90_000);
  assert.equal(error.section, 'skills');
  assert.match(error.message, /skills/);
});

test('import API persists section-specific timeout evidence without changing the safe user-facing contract', () => {
  const route = readFileSync('app/api/import-resume/route.ts', 'utf8');
  assert.match(route, /ResumeImportSectionTimeoutError/);
  assert.match(route, /section: error\.section/);
  assert.match(route, /section: failure\.section/);
  assert.match(route, /failure\.section \? \{ section: failure\.section \} : \{\}/);
  assert.match(route, /errorCode: 'RESUME_IMPORT_TIMEOUT'/);
});

test('hybrid importer keeps bounded AI for ambiguous skills so P10 local-AI fault proof remains meaningful', () => {
  const source = readFileSync('lib/infrastructure/import/OllamaResumeImportV3Provider.ts', 'utf8');
  assert.match(source, /label: 'skills'/);
  assert.match(source, /sourceExactExperience \? 'SOURCE_EXACT' : 'AI'/);
  assert.match(source, /sourceExactProjects \? 'SOURCE_EXACT' : 'AI'/);
  assert.match(source, /sourceExactPersonalInfo \? 'SOURCE_EXACT' : 'AI'/);
  assert.match(source, /native-text-ollama-v3\.4-structure-preserving-segmentation/);
});
