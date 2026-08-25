import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { assemblePdfTextItems } from '../../lib/infrastructure/import/NativeResumeImportProvider';
import { splitResumeIntoSections } from '../../lib/infrastructure/import/OllamaResumeImportV3Provider';

test('ATS-SYS-03E INC-01 preserves PDF text-item end-of-line boundaries', () => {
  const text = assemblePdfTextItems([
    { str: 'PERSONA TEST', hasEOL: true },
    { str: 'EXPERIENCIA PROFESIONAL', hasEOL: true },
    { str: 'Example Corp — Developer', hasEOL: true },
    { str: '2024 - Actualidad', hasEOL: true },
  ]);

  assert.equal(
    text,
    [
      'PERSONA TEST',
      'EXPERIENCIA PROFESIONAL',
      'Example Corp — Developer',
      '2024 - Actualidad',
    ].join('\n'),
  );
});

test('ATS-SYS-03E INC-01 real-world heading aliases cannot be swallowed by experience or education', () => {
  const text = [
    'PERSONA TEST',
    'persona@example.test',
    'RESUMEN PROFESIONAL',
    'Perfil explícito.',
    'EXPERIENCIA PROFESIONAL',
    'Example Corp',
    'Developer',
    '2024 - Actualidad',
    'Built APIs.',
    'PRODUCTOS PROPIOS',
    'Product One',
    'Source-backed product description.',
    'PROYECTOS DE INGENIERÍA SELECCIONADOS',
    'Project One',
    'Source-backed engineering description.',
    'STACK TÉCNICO',
    'Java, Spring Boot, PostgreSQL',
    'EDUCACIÓN',
    'Example University',
    'Ingeniería de Sistemas',
    '2022 - Actualidad',
    'CERTIFICACIONES Y CURSOS',
    'Course One — Example Institute — 2025',
  ].join('\n');

  const sectioned = splitResumeIntoSections({
    format: 'DOCX',
    pages: [{ text }],
    text,
  });

  assert.ok(sectioned.sections.has('experience'));
  assert.ok(sectioned.sections.has('projects'));
  assert.ok(sectioned.sections.has('skills'));
  assert.ok(sectioned.sections.has('education'));
  assert.ok(sectioned.sections.has('certifications'));

  assert.doesNotMatch(
    sectioned.sections.get('experience') ?? '',
    /PRODUCTOS PROPIOS|PROYECTOS DE INGENIERÍA SELECCIONADOS|STACK TÉCNICO/,
  );

  assert.doesNotMatch(
    sectioned.sections.get('education') ?? '',
    /CERTIFICACIONES Y CURSOS/,
  );
});

test('ATS-SYS-03E INC-01 missing/structural truth is not mislabeled as invented candidate truth', () => {
  const program = `
    import {
      classifyAcceptedTruthIssues,
      isUnsafeAcceptedTruthClassification,
    } from './scripts/system-real-world-corpus-classification.mjs';

    console.log(JSON.stringify({
      success: classifyAcceptedTruthIssues([]),
      structural: classifyAcceptedTruthIssues(['EXPERIENCE_COUNT_MISMATCH']),
      incomplete: classifyAcceptedTruthIssues(['REQUIRED_SOURCE_TRUTH_MISSING']),
      unsupported: classifyAcceptedTruthIssues(['FORBIDDEN_CANDIDATE_TRUTH_PRESENT']),
      structuralUnsafe: isUnsafeAcceptedTruthClassification('STRUCTURAL_TRUTH_MISMATCH'),
      unsupportedUnsafe: isUnsafeAcceptedTruthClassification('UNSUPPORTED_TRUTH_ACCEPTED'),
    }));
  `;

  const result = JSON.parse(execFileSync(
    process.execPath,
    ['--input-type=module', '--eval', program],
    { encoding: 'utf8' },
  ));

  assert.deepEqual(result, {
    success: 'SUCCESS_TRUTH_SAFE',
    structural: 'STRUCTURAL_TRUTH_MISMATCH',
    incomplete: 'ROBUSTNESS_FAILURE_INCOMPLETE_ACCEPTANCE',
    unsupported: 'UNSUPPORTED_TRUTH_ACCEPTED',
    structuralUnsafe: false,
    unsupportedUnsafe: true,
  });
});
