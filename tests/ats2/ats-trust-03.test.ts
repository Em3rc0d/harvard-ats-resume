import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResumeRequest } from '../../lib/schemas';
import {
  AIProviderFailure,
  aiProviderFailureHttpStatus,
  classifyAIProviderError,
} from '../../lib/application/ai/AIProviderFailure';
import {
  PRODUCT_EVALUATION_VERSION,
  evaluateProductResume,
} from '../../lib/application/product/ProductEvaluationService';
import { deriveTrustedAdvice } from '../../lib/application/product/TrustedAdviceService';

function earlyCareerFixture(jobDescription = ''): ResumeRequest {
  return {
    personalInfo: { fullName: 'Candidate One', location: 'Lima, Peru', email: 'one@example.com', linkedin: '', github: '' },
    summary: 'Estudiante de ingeniería de sistemas con experiencia en Quality Assurance y pruebas funcionales de software. Posee habilidades técnicas y busca seguir desarrollándose en ingeniería de software.',
    experience: [{
      company: 'Software Provider', role: 'QA Trainee', startDate: 'Mar. 2025', endDate: 'Sep. 2025',
      description: 'Ejecutar pruebas funcionales, manuales y de regresión en soluciones empresariales.', technologies: [],
    }],
    education: [{ institution: 'National University', degree: 'Systems Engineering', startDate: 'Mar. 2022', endDate: 'Actualidad', honors: 'Academic distinction' }],
    skills: { hardSkills: ['C++', 'Java', 'Python', 'SQL Server', 'Power BI'], softSkills: ['Trabajo en equipo', 'Comunicación efectiva'] },
    projects: [{ name: 'Predictive Risk Project', description: 'Desarrollo de un modelo supervisado para clasificar riesgo crediticio. Aplicación de preprocesamiento, validación cruzada y optimización de hiperparámetros.', technologies: ['Python'], link: '' }],
    certifications: [{ name: 'Python Intermediate', issuer: 'Engineering University', date: 'Sep. 2024' }],
    languages: [{ language: 'Español', proficiency: 'Nativo' }, { language: 'Inglés', proficiency: 'B2' }, { language: 'Chino mandarín', proficiency: 'Intermedio' }],
    jobDescription,
  };
}

function experiencedFixture(): ResumeRequest {
  return {
    personalInfo: { fullName: 'Candidate Two', location: 'Lima, Peru', email: 'two@example.com', linkedin: '', github: '' },
    summary: 'Estudiante de ingeniería con experiencia práctica en desarrollo backend, integración frontend y despliegue de aplicaciones full-stack.',
    experience: [{
      company: 'Technology Company', role: 'Backend Developer', startDate: 'Feb. 2025', endDate: 'Actualidad',
      description: 'Desarrollo y optimización de APIs REST con Spring Boot, aplicando arquitectura por capas y buenas prácticas de seguridad.', technologies: ['Spring Boot', 'MongoDB'],
    }],
    education: [{ institution: 'National University', degree: 'Systems and Informatics Engineering', startDate: 'Mar. 2022', endDate: 'Actualidad', honors: 'Academic distinction' }],
    skills: { hardSkills: ['Java', 'Node.js', 'Express', 'Angular', 'React', 'Spring Boot', 'PostgreSQL', 'Docker'], softSkills: ['Scrum'] },
    projects: [{ name: 'Inventory System', description: 'Diseño y desarrollo full-stack de un sistema para gestionar ventas, productos, facturas, usuarios y proveedores.', technologies: ['Node.js', 'MongoDB'], link: '' }],
    certifications: [{ name: 'Full-Stack Development', issuer: 'Learning Platform', date: '2024' }],
    languages: [{ language: 'Español', proficiency: 'nativo' }, { language: 'Inglés', proficiency: 'intermedio' }],
    jobDescription: '',
  };
}

function rendered(candidate: ResumeRequest): string {
  return `${candidate.personalInfo.fullName.toUpperCase()}\n${candidate.personalInfo.location} | ${candidate.personalInfo.email}\n\nPROFESSIONAL SUMMARY\n${candidate.summary}\n\nEXPERIENCE\n${candidate.experience[0]?.company} — ${candidate.experience[0]?.role}\n${candidate.experience[0]?.startDate} – ${candidate.experience[0]?.endDate}\n${candidate.experience[0]?.description}\n\nPROJECTS\n${candidate.projects?.[0]?.name}\n${candidate.projects?.[0]?.description}\n\nEDUCATION\n${candidate.education[0]?.institution} — ${candidate.education[0]?.degree}\n\nSKILLS\nTechnical Skills: ${candidate.skills.hardSkills.join(', ')}\n\nLANGUAGES\n${candidate.languages?.map((language) => `${language.language} — ${language.proficiency}`).join('\n')}`;
}

test('product evaluation v2 does not require hardcoded action verbs or penalize visual wrapping', () => {
  const candidate = earlyCareerFixture();
  const result = evaluateProductResume(candidate, rendered(candidate));

  assert.equal(result.resumeQuality.version, PRODUCT_EVALUATION_VERSION);
  assert.equal(PRODUCT_EVALUATION_VERSION, 'ats2-product-evaluation-v2');
  assert.equal(result.resumeQuality.checks.some((check) => check.id === 'quality-action-language'), false);
  assert.equal(result.atsParseability.checks.some((check) => check.id === 'parse-line-density'), false);
  assert.equal(result.resumeQuality.checks.find((check) => check.id === 'quality-substantive-evidence')?.status, 'PASS');
  assert.equal(result.resumeQuality.checks.find((check) => check.id === 'quality-semantic-density')?.status, 'PASS');
});

test('two structurally different real-CV fixture shapes are evaluated by the same general rules', () => {
  const first = earlyCareerFixture();
  const second = experiencedFixture();
  const firstResult = evaluateProductResume(first, rendered(first));
  const secondResult = evaluateProductResume(second, rendered(second));

  assert.ok(firstResult.resumeQuality.score >= 0 && firstResult.resumeQuality.score <= 100);
  assert.ok(secondResult.resumeQuality.score >= 0 && secondResult.resumeQuality.score <= 100);
  assert.equal(firstResult.resumeQuality.checks.map((check) => check.id).join('|'), secondResult.resumeQuality.checks.map((check) => check.id).join('|'));
});

test('no target job means trusted advice emits no keyword or alignment advice', () => {
  const candidate = earlyCareerFixture('');
  const evaluation = evaluateProductResume(candidate, rendered(candidate));
  const advice = deriveTrustedAdvice(candidate, evaluation, { now: new Date('2026-08-19T12:00:00Z') });
  const text = advice.map((entry) => `${entry.message} ${entry.rationale}`).join(' ');

  assert.doesNotMatch(text, /keyword|alignment with the job|job description/i);
});

test('missing quantified outcomes never produces invented metric examples', () => {
  const candidate = earlyCareerFixture();
  const evaluation = evaluateProductResume(candidate, rendered(candidate));
  const advice = deriveTrustedAdvice(candidate, evaluation, { now: new Date('2026-08-19T12:00:00Z') });
  const outcome = advice.find((entry) => entry.id === 'evidence-verified-outcomes');

  assert.ok(outcome);
  assert.match(outcome!.message, /optional/i);
  assert.match(outcome!.rationale, /does not invent/i);
  assert.doesNotMatch(`${outcome!.message} ${outcome!.rationale}`, /40%|increased performance|e\.g\./i);
});

test('source-backed historical dates are not questioned merely because they are in the past', () => {
  const candidate = earlyCareerFixture();
  const evaluation = evaluateProductResume(candidate, rendered(candidate));
  const advice = deriveTrustedAdvice(candidate, evaluation, { now: new Date('2026-08-19T12:00:00Z') });

  assert.equal(advice.some((entry) => entry.category === 'TEMPORAL'), false);
});

test('deterministic temporal advice appears only when documented start is after end', () => {
  const candidate = earlyCareerFixture();
  candidate.experience[0] = { ...candidate.experience[0]!, startDate: 'Oct. 2025', endDate: 'Sep. 2025' };
  const evaluation = evaluateProductResume(candidate, rendered(candidate));
  const advice = deriveTrustedAdvice(candidate, evaluation, { now: new Date('2026-08-19T12:00:00Z') });
  const temporal = advice.find((entry) => entry.category === 'TEMPORAL');

  assert.ok(temporal);
  assert.match(temporal!.rationale, /not inferring which date is correct/i);
});

test('targeting advice requires target context and never converts requirements into candidate truth', () => {
  const candidate = earlyCareerFixture('Requirements: Kubernetes');
  const evaluation = evaluateProductResume(candidate, rendered(candidate));
  const advice = deriveTrustedAdvice(candidate, evaluation, {
    now: new Date('2026-08-19T12:00:00Z'),
    jobMatch: {
      score: 40,
      requirements: [{ statement: 'Kubernetes', necessity: 'REQUIRED', status: 'GAP' }],
    },
  });
  const targeting = advice.find((entry) => entry.category === 'TARGETING');

  assert.ok(targeting);
  assert.match(targeting!.rationale, /market truth, not candidate truth/i);
  assert.match(targeting!.rationale, /only if.*genuinely yours/i);
});

test('Gemini free-tier quota exhaustion is normalized separately from transient rate limiting', () => {
  const error = Object.assign(new Error('{"error":{"code":429,"message":"You exceeded your current quota. Quota exceeded for metric generate_content_free_tier_requests. RESOURCE_EXHAUSTED. quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier. Please retry in 8.5s."}}'), { status: 429 });
  const failure = classifyAIProviderError(error, 'google-gemini');

  assert.equal(failure.kind, 'QUOTA_EXHAUSTED');
  assert.equal(failure.retryable, false);
  assert.equal(failure.retryAfterSeconds, 9);
  assert.equal(aiProviderFailureHttpStatus(failure), 503);
});

test('generic provider 429 is retryable rate limiting', () => {
  const failure = classifyAIProviderError(Object.assign(new Error('Rate limit exceeded. Retry after 3 seconds.'), { status: 429 }), 'provider');
  assert.equal(failure.kind, 'RATE_LIMITED');
  assert.equal(failure.retryable, true);
  assert.equal(failure.retryAfterSeconds, 3);
});

test('provider auth, timeout, outage and invalid responses use one failure contract', () => {
  const auth = classifyAIProviderError(Object.assign(new Error('Invalid API key'), { status: 401 }), 'provider');
  const timeout = classifyAIProviderError(new Error('Request timed out'), 'provider');
  const outage = classifyAIProviderError(Object.assign(new Error('Service unavailable'), { status: 503 }), 'provider');
  const invalid = classifyAIProviderError(new Error('Provider returned invalid JSON'), 'provider');

  assert.equal(auth.kind, 'AUTHENTICATION_FAILED');
  assert.equal(timeout.kind, 'REQUEST_TIMEOUT');
  assert.equal(outage.kind, 'PROVIDER_UNAVAILABLE');
  assert.equal(invalid.kind, 'INVALID_PROVIDER_RESPONSE');
  assert.ok(auth instanceof AIProviderFailure);
  assert.equal(timeout.toView().contractVersion, 'ats2-ai-provider-failure-v1');
});

test('native resume import uses the bounded low-latency Gemini extraction profile', () => {
  const importer = readFileSync(join(process.cwd(), 'lib/infrastructure/import/NativeResumeImportProvider.ts'), 'utf8');

  assert.match(importer, /GEMINI_IMPORT_MODEL = 'gemini-2\.5-flash-lite'/);
  assert.match(importer, /thinkingConfig:\s*\{\s*thinkingBudget:\s*0\s*\}/);
  assert.match(importer, /reconcileCandidateToSource\(candidate, document\)/);
  assert.match(importer, /abortSignal:\s*controller\.signal/);
});

test('trusted advice owns the visible suggestion channel and Gemini no longer emits suggestions', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/generate-resume/route.ts'), 'utf8');
  const provider = readFileSync(join(process.cwd(), 'lib/infrastructure/ai/GeminiResumeProvider.ts'), 'utf8');
  const providerContract = readFileSync(join(process.cwd(), 'lib/application/ai/AIResumeProvider.ts'), 'utf8');

  assert.match(route, /deriveTrustedAdvice/);
  assert.match(route, /suggestions:\s*trustedAdvice\.slice/);
  assert.doesNotMatch(route, /generateSuggestions\(/);
  assert.doesNotMatch(route, /geminiResult\.suggestions/);
  assert.doesNotMatch(provider, /suggestions:\s*\{/);
  assert.doesNotMatch(providerContract, /suggestions:/);
  assert.match(provider, /Do not return suggestions or career advice/);
});

test('import and generation expose the same typed provider failure contract', () => {
  const importRoute = readFileSync(join(process.cwd(), 'app/api/import-resume/route.ts'), 'utf8');
  const generationRoute = readFileSync(join(process.cwd(), 'app/api/generate-resume/route.ts'), 'utf8');

  assert.match(importRoute, /classifyAIProviderError/);
  assert.match(importRoute, /provider:\s*providerFailure\.toView\(\)/);
  assert.match(generationRoute, /provider:\s*providerFailure\.toView\(\)/);
  assert.match(generationRoute, /aiProviderFailureHttpStatus/);
  assert.match(generationRoute, /aiProviderFailureMessage/);
});
