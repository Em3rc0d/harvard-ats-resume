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
All identified deterministic fabrication paths and explicit LLM fabrication instructions in the scoped flows were removed.

This gate does not claim that a probabilistic LLM can never hallucinate. A stronger guarantee requires the later GroundingValidator architecture.

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
The repository is stabilized with automated CI/QA checks, clean dependency boundaries, documented environment variables, and modern Gemini SDK integration. Product functionality is preserved.

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
- Repaired `package-lock.json` so clean GitHub Actions installation is reproducible.

### AFTER
The ATS v2 domain language is explicit and compile-checked. Candidate truth, job truth, match inference, and resume wording have separate representations.

Gate wording:
`G3 DOMAIN_FOUNDATION — PASS`

Merged PR: `#1`.

## PR-ATS2-03 — Legacy Truth Adapter & Claim Ledger

### BEFORE
The ATS v2 domain existed, but the production generation endpoint still received the legacy `ResumeRequest` without projecting it into candidate evidence and assertions.

### DURING
- Added `LegacyResumeAdapter`.
- Projected the existing request into `CandidateProfile`, `CareerSource`, `CareerEvidence`, and `CareerAssertion`.
- Structurally excluded `jobDescription` from candidate evidence.
- Added `ClaimLedger` and canonical evidence-backed `ResumeClaim` registration.
- Required the API generation path to establish the ATS v2 truth context before Gemini can run.

### AFTER
Every accepted generation request crosses the candidate-truth boundary before probabilistic generation. Job requirements cannot enter candidate evidence through the legacy adapter.

Gate wording:
`G4 EVIDENCE_CLAIM_LEDGER — PASS`

Merged PR: `#2`.

## PR-ATS2-04 — Structured AI Gateway

### BEFORE
Gemini generation used a combined prompt, delimiter-based output, regex parsing, duplicated Job Description content, and a local `Promise.race` timeout.

### DURING
- Added `AIResumeProvider` and `ResumeGenerationProposal` application contracts.
- Added `GeminiResumeProvider` infrastructure adapter.
- Separated system instructions from user content.
- Separated candidate facts from Job Description requirements in model input.
- Switched generation output to JSON schema constrained content.
- Added Zod runtime validation before model output is accepted.
- Replaced delimiter/regex parsing with structured JSON decoding.
- Added abort-based request timeout handling.
- Preserved the legacy `generateResumeWithGemini` API as a compatibility adapter.

### AFTER
Gemini is behind a typed provider boundary. Structurally invalid model output cannot cross the AI gateway.

Gate wording:
`G5 STRUCTURED_AI — PASS`

Merged PR: `#3`.

## PR-ATS2-05 — Deterministic Grounding & Candidate Confirmation

### BEFORE
Schema-valid AI output was still only structurally trustworthy; an LLM could still propose a new candidate fact.

### DURING
- Added deterministic `GroundingValidator` after AI generation and before scoring/output.
- Candidate catalog excludes Job Description data.
- Added validation for unsupported numbers, employers, roles, projects, certifications, skills, and technologies.
- Added `JD_REQUIREMENT_LEAKAGE` classification when generated candidate content is supported only by the Job Description.
- Added `REJECTED`, `NEEDS_USER_CONFIRMATION`, and `APPROVED` grounding states.
- Blocked ungrounded output with HTTP 422.
- Added evidence-first confirmation guidance: users must add a proposed fact to candidate input only when true and regenerate; the AI proposal is never automatically promoted into CareerEvidence.

### AFTER
Probabilistic output is now a proposal until the deterministic factual gate approves it. Job-only facts are blocked from becoming candidate claims.

Gate wording:
`G6 GROUNDED_GENERATION — PASS`

Merged PR: `#4`.

## PR-ATS2-06 — Job Intelligence & Match Engine v2

### BEFORE
The product still depended on the legacy keyword heuristic as its visible matching mechanism and lacked an executable JobRequirement-to-CareerAssertion comparison engine.

### DURING
- Enriched `JobRequirement` with canonical concept, aliases, minimum years, and confidence metadata.
- Added deterministic EN/ES first-pass `JobIntelligenceEngine`.
- Extracted explicit skills and classified experience, responsibility, education, certification, language, location, and work-authorization requirements.
- Classified necessity as `REQUIRED`, `PREFERRED`, or `UNKNOWN` from source wording.
- Added `JobMatchEngine` operating only on existing CareerAssertions.
- Required requirements receive greater match weight than preferred requirements.
- Skill matching uses explicit token boundaries rather than substring matching.
- Added explainable match rationales and assertion references.
- Exposed an independent `jobMatch` response with score, breakdown, requirements, statuses, rationales, and provenance identifiers.
- Kept the legacy `atsScore` temporarily for UI compatibility rather than silently redefining its semantics.

### AFTER
ATS v2 now has an executable and explainable Job Match path independent from the old keyword score. Matching remains inference and cannot create candidate truth.

Gate wording:
`G7 JOB_MATCH_V2 — PASS`

Merged PR: `#5`.

## Current Migration Position

```text
G0 REPRODUCIBLE_BASELINE   PASS
G1 TRUST_CONTAINMENT       PASS
G2 PLATFORM_HEALTH         PASS
G3 DOMAIN_FOUNDATION       PASS
G4 EVIDENCE_CLAIM_LEDGER   PASS
G5 STRUCTURED_AI           PASS
G6 GROUNDED_GENERATION     PASS
G7 JOB_MATCH_V2            PASS
```

The next architectural work should move from truth/matching foundations into trusted import, resume version composition/rendering, privacy/security boundaries, persistence/Career Vault, explainability UX, observability, and pilot validation. The legacy keyword score remains intentionally visible until the product UI is migrated to separate Resume Quality, Parseability, and Job Match concepts.