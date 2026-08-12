import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personalInfoSchema } from '../../lib/schemas';

function parse(linkedin: string, github: string) {
  return personalInfoSchema.parse({
    fullName: 'Jane Candidate',
    location: 'Lima, Peru',
    email: 'jane@example.com',
    linkedin,
    github,
  });
}

test('profile URL validation canonicalizes common LinkedIn and GitHub URLs without schemes', () => {
  const result = parse('linkedin.com/in/jane-candidate', 'github.com/jane-candidate');

  assert.equal(result.linkedin, 'https://linkedin.com/in/jane-candidate');
  assert.equal(result.github, 'https://github.com/jane-candidate');
});

test('profile URL validation canonicalizes www and http variants to HTTPS trusted hosts', () => {
  const result = parse(
    'http://www.linkedin.com/in/jane-candidate',
    'http://www.github.com/jane-candidate',
  );

  assert.equal(result.linkedin, 'https://linkedin.com/in/jane-candidate');
  assert.equal(result.github, 'https://github.com/jane-candidate');
});

test('profile URL validation keeps optional empty values valid', () => {
  const result = parse('', '');

  assert.equal(result.linkedin, '');
  assert.equal(result.github, '');
});

test('profile URL validation rejects syntactically valid URLs on the wrong host', () => {
  assert.throws(
    () => parse('https://linkedin.com.evil.example/in/jane', 'https://github.com/jane'),
    /Invalid LinkedIn URL/,
  );

  assert.throws(
    () => parse('https://linkedin.com/in/jane', 'https://example.com/github.com/jane'),
    /Invalid GitHub URL/,
  );
});

test('profile URL validation rejects credential-style host confusion', () => {
  assert.throws(
    () => parse('https://evil.example@linkedin.com/in/jane', 'https://github.com/jane'),
    /Invalid LinkedIn URL/,
  );

  assert.throws(
    () => parse('https://linkedin.com/in/jane', 'https://evil.example@github.com/jane'),
    /Invalid GitHub URL/,
  );
});
