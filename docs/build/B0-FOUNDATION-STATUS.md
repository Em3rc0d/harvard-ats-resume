# B0 — Foundation Status

Status: **CANDIDATE — exact-head CI required**

This is an implementation evidence record, not a new architecture layer.

## Baseline

Documentation source-of-truth parent:

```text
b1bb83fde37df9970b5aaafe476b6e43bd71f183
```

Implementation branch:

```text
build/cv-engine-vnext-b0
```

## B0 contents

- Next.js 16.3.3 Active-LTS security line;
- React 19.2;
- Node 22 contract;
- strict TypeScript;
- ESLint flat configuration;
- Vitest;
- npm dependency lockfile;
- minimal App Router surface;
- no copied legacy application code;
- first executable domain/truth contracts;
- construction CI.

## First invariants encoded

```text
Candidate truth authority = Career Evidence
Market truth authority    = Job Snapshot
Job Description           != Career Evidence source
ResumeClaim               requires evidence references
trusted ResumeVersion     requires deterministic composer
AI provider attempts      are bounded by capability policy
```

## B0 verification command

```text
npm ci
npm run verify
```

Where `verify` is:

```text
typecheck
→ lint
→ unit tests
→ Next production build
```

## Closure condition

B0 closes only when GitHub Actions reports all verification steps PASS on the exact post-lock branch head containing this record.

After B0 closure, construction moves to B0.5/B1; broad architecture design remains closed.
