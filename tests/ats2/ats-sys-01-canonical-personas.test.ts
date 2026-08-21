import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../system/fixtures/canonical-personas.v0.1.json';

const extractionPersonas = ['P01', 'P03', 'P04', 'P09'] as const;

test('ATS-SYS-01 canonical personas are synthetic, versioned, and required', () => {
  assert.equal(manifest.version, 'ats-sys-01-personas-v0.1');
  assert.equal(manifest.synthetic, true);

  for (const personaId of [...extractionPersonas, 'P10'] as const) {
    const persona = manifest.personas[personaId];
    assert.ok(persona, `${personaId} must exist`);
    assert.equal(persona.status, 'REQUIRED');
  }
});

test('ATS-SYS-01 extraction personas declare source truth and forbidden truth independently', () => {
  for (const personaId of extractionPersonas) {
    const persona = manifest.personas[personaId];
    assert.ok('sourceDocument' in persona);
    assert.ok('expectedTruth' in persona);
    assert.match(persona.sourceDocument.fileName, /^P\d{2}-.+\.docx$/);
    assert.ok(persona.sourceDocument.lines.length > 0);
    assert.ok(persona.expectedTruth.requiredStrings.length > 0);
    assert.ok(persona.expectedTruth.forbiddenStrings.length > 0);

    const source = persona.sourceDocument.lines.join('\n').normalize('NFKC').toLowerCase();
    for (const forbidden of persona.expectedTruth.forbiddenStrings) {
      assert.equal(
        source.includes(forbidden.normalize('NFKC').toLowerCase()),
        false,
        `${personaId} forbidden truth must not already exist in candidate source: ${forbidden}`,
      );
    }
  }
});

test('ATS-SYS-01 adversarial JD contains market-only claims that are forbidden as candidate truth', () => {
  const persona = manifest.personas.P09;
  const source = persona.sourceDocument.lines.join('\n').normalize('NFKC').toLowerCase();
  const job = persona.jobDescription.normalize('NFKC').toLowerCase();

  for (const forbidden of persona.expectedTruth.forbiddenStrings) {
    const token = forbidden.normalize('NFKC').toLowerCase();
    assert.equal(source.includes(token), false, `${forbidden} must not be candidate evidence`);
    assert.equal(job.includes(token), true, `${forbidden} must be present in the adversarial market input`);
  }
});

test('ATS-SYS-01 P10 encodes degradation expectations instead of generic outage expectations', () => {
  const scenarios = manifest.personas.P10.faultScenarios;
  assert.deepEqual(
    scenarios.map((scenario) => scenario.id),
    ['local-ai-down', 'durable-redis-down'],
  );

  const aiDown = scenarios[0];
  assert.equal(aiDown.failureClass, 'MODEL');
  assert.equal(aiDown.expectedHealth, 'DEGRADED');
  assert.equal(aiDown.expectedHttpStatus, 200);
  assert.equal(aiDown.trustedCoreAvailable, true);

  const redisDown = scenarios[1];
  assert.equal(redisDown.failureClass, 'DURABILITY');
  assert.equal(redisDown.expectedHealth, 'UNAVAILABLE');
  assert.equal(redisDown.expectedHttpStatus, 503);
  assert.equal(redisDown.trustedCoreAvailable, false);
});
