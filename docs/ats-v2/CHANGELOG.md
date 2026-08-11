# ATS v2 Migration Changelog

## PR-ATS2-00 — Prototype Freeze & Characterization

### BEFORE
Repository prototype existed without a durable ATS v2 migration record.

### DURING
- baseline SHA frozen at `198b182e89124224be426ed22b915bec77da1bb6`
- current product contract documented
- characterization cases defined
- executable baseline evidence created
- tests/checks executed (`npm ci` passed after `node_modules` cleanup; `npx tsc --noEmit`, `npm run build`, `npm run lint`, `npm run dev` all passed)
- failures discovered: Initial executable-resolution failures were isolated to the local pre-existing node_modules state. A clean dependency reconstruction restored a fully working baseline without repository changes. The exact initiating cause was not established.
- scope/non-goals recorded
- G0 evidence requirements formalized

### AFTER
No production behavior is intentionally changed by PR-ATS2-00.

Gate status:
`G0 REPRODUCIBLE_BASELINE — PASS`

Next authorized iteration after G0:
`PR-ATS2-00B — Trust Containment`.

## PR-ATS2-00B — Trust Containment

### BEFORE
The ATS v1 prototype contained logic that violated strict factual reporting:
- Gemini prompt instructed the LLM to invent metrics and projects.
- CV import fabricated missing dates or assumed `currentYear`.
- Certificate parsing assumed a 4-year degree to fabricate a start date.


### DURING
- Removed `INVENT` directives from `lib/gemini.ts` and replaced with strict non-fabrication rules.
- Modified `components/CVUpload.tsx` to stop guessing missing dates.
- Modified `components/ResumeForm.tsx` to stop inferring a 4-year degree start date.

### AFTER
All identified deterministic fabrication paths and explicit LLM
fabrication instructions in the scoped flows were removed.

This gate does not claim that a probabilistic LLM can never hallucinate.
A stronger guarantee requires the later GroundingValidator architecture.

Gate wording:
`G1 TRUST_CONTAINMENT — PASS`

Scope:
- explicit metric-invention instruction removed
- explicit project-invention instruction removed
- CV date synthesis removed
- certificate start-date inference removed
- unsupported placeholders prohibited from Improved Resume

## PR-ATS2-01 — Platform Health

### BEFORE
- Package scripts were inconsistent, next was floated (`^14.2.0`), and ESLint was unconfigured.
- No CI pipeline existed for automated PR regression testing.
- `.env.example` lacked required webhook secrets for integrations.
- Gemini integration relied on the legacy `@google/generative-ai` SDK.

### DURING
- Updated `package.json` to lock `next` to `14.2.35`, add a `typecheck` script, and install ESLint correctly.
- Configured GitHub Actions `.github/workflows/ci.yml`.
- Synced `.env.example` to document `NEXT_PUBLIC_N8N_*` keys.
- Migrated from `@google/generative-ai` to `@google/genai` while preserving prompt rules.
- Conducted an `npm audit` and documented a critical vulnerability in `jspdf` (ACCEPTED TEMPORARILY WITH RATIONALE).

### AFTER
The repository is stabilized with automated CI/QA tests, clean dependency boundaries, fully documented environment variables, and modern Gemini SDK integration. Product functionality is fully preserved.

Gate wording:
`G2 PLATFORM_HEALTH — PASS`

## PR-ATS2-02 — Domain Foundation

### BEFORE
ATS v2 lacked an explicit domain model separating candidate truth, job truth, match inference, and resume wording.

### DURING
- Added `lib/domain` as a dependency-free modular-monolith domain foundation.
- Modeled candidate truth through `CareerSource`, `CareerEvidence`, and provenance-bearing `CareerAssertion`.
- Modeled job truth through `JobDescription` and `JobRequirement`, independent from candidate assertions.
- Modeled `RequirementMatch` as an inference bridge that cannot create candidate facts.
- Separated `CareerAssertion` from `ResumeClaim`.
- Added `ResumeVersion` and `ResumeManifest` provenance records.
- Added deterministic invariants and a roundtrip fixture.

### AFTER
The ATS v2 domain language is explicit and compile-checked. No existing UI, Gemini, n8n, PDF, scoring, persistence, RAG, vector database, or distributed-systems behavior is intentionally changed.

Gate wording:
`G3 DOMAIN_FOUNDATION — PASS`
