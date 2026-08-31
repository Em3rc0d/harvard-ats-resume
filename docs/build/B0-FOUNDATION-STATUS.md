# B0 — Foundation Status

Status: **CLOSED**

This is an implementation evidence record, not a new architecture layer.

## Baseline

Documentation source-of-truth parent:

```text
b1bb83fde37df9970b5aaafe476b6e43bd71f183
```

Original implementation branch:

```text
build/cv-engine-vnext-b0
```

B0 is inherited by later rebuild branches as long as the construction verification remains green.

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

## Verification

Canonical command:

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

Exact-head evidence inherited from the B1 rebuild head:

```text
head_sha   89418e21faf7192126df1dfe60822ed1828ad773
workflow   CV Engine vNext Construction
run        33098087218
conclusion success
```

That run executes the same B0 verification chain on the later branch state, proving the B0 foundation still holds after B0.5/B1 additions.

## Closure declaration

```text
CLEAN_APP_BASELINE   PASS
LOCKFILE             PASS
TYPECHECK            PASS
LINT                 PASS
UNIT_TEST            PASS
NEXT_BUILD           PASS
CI_EXACT_HEAD        PASS
NO_LEGACY_COPY       PASS
B0                   CLOSED
```

Reopen B0 only if later evidence breaks one of these predicates.
