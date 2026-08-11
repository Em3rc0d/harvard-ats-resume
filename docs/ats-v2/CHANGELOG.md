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
- Added `ClaimLedger` and canonical `ResumeClaim` registration.
- Required the API generation path to establish the ATS v2 truth context before Gemini can run.

### AFTER
Every accepted generation request crosses the candidate-truth boundary before probabilistic generation. Job requirements cannot enter candidate evidence through the legacy adapter.

Audit clarification: this gate established logical provenance over the accepted legacy DTO; it did not yet establish source-document-level verification. PR-ATS2-07 corrects the legacy truth class so DTO values are not mislabeled as independently verified facts.

Gate wording:
`G4 EVIDENCE_CLAIM_LEDGER — PASS (BOUNDARY), TRUSTED IMPORT NOT YET`

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
- Added `JD_REQUIREMENT_LEAKAGE` classification for covered generated candidate content supported only by the Job Description.
- Added `REJECTED`, `NEEDS_USER_CONFIRMATION`, and `APPROVED` grounding states.
- Blocked detected ungrounded output with HTTP 422.
- Added evidence-first confirmation guidance: users must add a proposed fact to candidate input only when true and regenerate; the AI proposal is never automatically promoted into CareerEvidence.

### AFTER
Probabilistic output is treated as a proposal until the deterministic gate approves the classes of facts it knows how to inspect.

Audit clarification: this gate did not prove complete semantic grounding. PR-ATS2-07 adds conservative narrative-claim checks and behavioral regression tests; future semantic entailment remains a separate layer.

Gate wording:
`G6 GROUNDED_GENERATION — PASS (FOUNDATION), COMPLETE SEMANTIC GROUNDING NOT CLAIMED`

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
ATS v2 has an executable first-pass Job Match path independent from the old keyword score. Matching remains inference and cannot create candidate truth.

Audit clarification: the initial G7 implementation extracted `minimumYears` without enforcing it, could lose requirement-section context, and treated missing work authorization too strongly. PR-ATS2-07 corrects those behaviors and adds executable regression tests.

Gate wording:
`G7 JOB_MATCH_V2 — PASS (FOUNDATION), CALIBRATED MATCH RELIABILITY NOT YET CLAIMED`

Merged PR: `#5`.

## PR-ATS2-07 — Audit Hardening

### BEFORE
A post-G7 audit identified several places where implementation existed but the documented trust guarantee was stronger than the executable behavior:
- legacy DTO values were labeled `VERIFIED_FACT` even though source-level verification was not retained;
- upload versus manual provenance was collapsed;
- CI compiled the system but did not run behavioral tests;
- narrative hallucinations could escape entity/number grounding checks;
- requirement-section headings did not propagate necessity to bullets;
- uncatalogued explicit requirements could be silently omitted;
- `minimumYears` was extracted but not enforced by matching;
- missing work-authorization evidence could become a blocker;
- configured rate limit and user-facing copy disagreed.

### DURING
- Added `CANDIDATE_ASSERTED` and stopped promoting legacy DTO data to `VERIFIED_FACT`.
- Preserved manual-form versus resume-upload `CareerSource` origin.
- Added candidate location assertion projection.
- Added conservative narrative, education, and language grounding checks.
- Added line-level Job Description leakage rejection for unsupported narrative claims.
- Carried REQUIRED/PREFERRED section context into child job requirements.
- Preserved uncatalogued explicit requirements as `OTHER`.
- Enforced `minimumYears` conservatively against linked parseable candidate date ranges.
- Changed absent work-authorization evidence to `UNKNOWN` rather than `BLOCKER`.
- Corrected rate-limit copy to 50 requests/hour.
- Added executable ATS v2 behavior tests without introducing a new test dependency.
- Updated CI to run `npm test` between typecheck and build.

### VALIDATION
GitHub Actions run `31454540397` passed:
- `npm ci`
- lint
- typecheck
- seven ATS v2 behavioral regression tests
- build

### AFTER
The audited foundations now have executable regression coverage for the specific failure modes found in the audit. This still does not claim source-document trusted import, complete semantic entailment, or statistically calibrated Job Match accuracy.

Gate wording:
`G7H AUDIT_HARDENING — PASS`

## PR-ATS2-08 — Trusted Import & Source Provenance

### BEFORE
Resume uploads were sent directly from browser code to a `NEXT_PUBLIC_N8N_RESUME_URL` webhook. The extractor returned a legacy DTO without a durable document receipt, source locator, importer version, or field-level review lineage. Upload extraction and candidate edits therefore collapsed into the same logical source.

### DURING
- Added a typed `ResumeImportProvider` boundary and server-side `N8nResumeImportProvider`.
- Added `/api/import-resume`; browser code now uploads only to the application server.
- Replaced the public resume webhook configuration with server-only `N8N_RESUME_URL`.
- Added upload validation for PDF/DOC/DOCX, MIME/extension consistency, non-empty files, and a 10 MB size limit.
- Added SHA-256 source receipts containing original file name, MIME type, byte size, capture time, importer, and importer version.
- Added evidence locators that distinguish source-document locations from extractor-output field locations and preserve optional confidence.
- Removed Job Description from the import output contract entirely.
- Carried `sourceContext` separately from candidate facts into generation so provenance is not sent to Gemini.
- Extended `CareerSource` with source-document receipt metadata.
- Extended `CareerEvidence` with locator, confidence, and candidate-review lineage.
- Preserved unchanged imported fields as `RESUME_UPLOAD` / `CANDIDATE_CONFIRMED` evidence.
- Preserved the original extraction when a user edits a field, while the resulting assertion is supported by separate `MANUAL_REVIEW` / `CANDIDATE_EDITED` evidence.
- Marked candidate-added values as `MANUAL_REVIEW` / `CANDIDATE_ADDED`.
- Forced imported assertions to remain `CANDIDATE_ASSERTED`; import extraction cannot promote them to `VERIFIED_FACT`.
- Added behavioral regressions for receipt hashing, JD exclusion, MIME rejection, unchanged provenance, edited provenance, added provenance, and absence of browser webhook access.

### VALIDATION
The first remote CI attempt correctly caught a `BlobPart` type incompatibility in the Node upload adapter. The upload buffer conversion was corrected and the entire pipeline was rerun.

GitHub Actions run `31456827117` on corrected head `4bf3e3778257618bf6c2ba57c03ee135f23cb71d` passed:
- `npm ci`
- lint
- typecheck
- behavior tests
- build
- Vercel

### AFTER
Resume import is now a server-side provenance boundary. The system can distinguish uploaded-source evidence from candidate edits/additions and retain a cryptographic receipt for the original document. This does not claim independent real-world verification of career claims.

Gate wording:
`G8 TRUSTED_IMPORT — PASS (SOURCE PROVENANCE), INDEPENDENT VERIFICATION NOT CLAIMED`

## PR-ATS2-09 — Semantic Grounding & Entailment Evaluation

### BEFORE
Deterministic grounding protected explicit facts, but wording could still preserve nouns/entities while escalating responsibility, ownership, design authority, architecture authority, scope, or impact.

### DURING
- Added `SemanticEntailmentEvaluator` after deterministic grounding and before scoring/output.
- Evaluated high-risk wording only against existing candidate `CareerAssertion`s.
- Added EN/ES adversarial coverage for responsibility, ownership, design, architecture, scope/scale, and impact-strength escalation.
- Preserved deterministic grounding as the authoritative hard blocker.
- Blocked suspect semantic inflation with HTTP 422 and candidate-confirmation guidance.

### AFTER
High-risk semantic drift has an executable conservative guard. This does not claim universal natural-language entailment or zero hallucinations.

Gate wording:
`G9 SEMANTIC_GROUNDING_EVALUATED — PASS (HIGH-RISK SEMANTIC DRIFT), UNIVERSAL ENTAILMENT NOT CLAIMED`

Merged PR: `#10`.

## PR-ATS2-10 — Job Match Benchmarking & Calibration

### BEFORE
Job Match v2 was functional and explainable, but its reliability had not been measured against an explicit labeled benchmark.

### DURING
- Built an initial 32-case EN controlled corpus and measured a 70% exact-status baseline with two false MATCH outcomes and 17 total mismatches.
- Corrected only failures demonstrated by the benchmark: short-skill extraction, skill-tenure double counting, responsibility-authority false positives, degree-level matching, language/location matching, and related scoring distortion.
- Expanded the corpus to 42 cases with 10 Spanish cases.
- Corrected the Spanish `ingeniería` ambiguity discovered by the expanded corpus.
- Preserved the distinction between controlled engineering calibration and real-world statistical validation.

### AFTER
The final controlled corpus produced 42/42 correct cases, 40/40 correct status checks, zero false MATCH, and zero false GAP within the labeled EN/ES corpus.

Gate wording:
`G10 CONTROLLED_MATCH_CALIBRATION — PASS (42-CASE EN/ES LABELED CORPUS), REAL-WORLD CALIBRATION NOT YET CLAIMED`

Merged PR: `#11`.

## PR-ATS2-11 — Runtime Resume Composition & Versioning

### BEFORE
`ResumeVersion` and `ResumeManifest` existed as domain structures, but successful generated resume text was not materialized into them in the production request path.

### DURING
- Added `ResumeCompositionService` after deterministic and semantic grounding.
- Bound exact approved rendered resume text to SHA-256 content identity.
- Bound targeted versions to a SHA-256 snapshot of the target Job Description.
- Added deterministic version identity from content + target snapshot.
- Added generation provider/model/contract metadata and MatchReport reference to `ResumeVersion`.
- Registered material generated lines as `ResumeClaim`s only when they can be traced to existing candidate assertions.
- Preserved multi-assertion provenance through `ResumeManifest` and existing `INV-006` validation.
- Made untraceable approved wording fail closed with HTTP 422 rather than emitting a version.
- Exposed `resumeVersion`, `resumeManifest`, `resumeClaims`, and explicit `EPHEMERAL_RUNTIME` persistence status in successful API responses.
- Added six dedicated versioning regressions, including deterministic identity, target-sensitive identity, multi-assertion provenance, no-contact-line summary preservation, and untraceable-wording refusal.

### VALIDATION
The first CI attempt exposed an old roundtrip fixture that did not satisfy the strengthened `ResumeVersion` contract. The fixture was migrated; the production contract was not weakened.

A post-green review then hardened presentation-line detection and added a regression for resumes without a contact line.

Final executable validation on head `7d4d918f820ee73a51fb4185f2bb590b43c31bcb`, GitHub Actions run `31536867968`:
- `npm ci` PASS
- lint PASS
- typecheck PASS
- behavior tests PASS (`32/32`)
- G10 benchmark remained PASS (`42/42` controlled cases)
- build PASS
- Vercel preview READY

### AFTER
A successful generated resume is now a content-addressed runtime `ResumeVersion` with complete generated-claim provenance back to candidate assertions. Durable persistence is deliberately not claimed.

Gate wording:
`G11 RUNTIME_RESUME_VERSIONING — PASS (CONTENT-ADDRESSED + FULL CLAIM PROVENANCE), PERSISTENCE NOT YET CLAIMED`

## Current Migration Position

```text
G0  REPRODUCIBLE_BASELINE          PASS
G1  TRUST_CONTAINMENT              PASS
G2  PLATFORM_HEALTH                PASS / ACCEPTED SECURITY DEBT
G3  DOMAIN_FOUNDATION              PASS
G4  CANDIDATE_TRUTH_BOUNDARY       PASS
G5  STRUCTURED_AI                  PASS
G6  GROUNDING_FOUNDATION           PASS + AUDIT HARDENED
G7  JOB_MATCH_FOUNDATION           PASS + AUDIT HARDENED
G7H AUDIT_HARDENING                PASS
G8  TRUSTED_IMPORT                 PASS / SOURCE PROVENANCE
    INDEPENDENT_VERIFICATION       NOT CLAIMED
G9  SEMANTIC_GROUNDING_EVALUATED   PASS / HIGH-RISK SEMANTIC DRIFT
    UNIVERSAL_ENTAILMENT           NOT CLAIMED
G10 CONTROLLED_MATCH_CALIBRATION   PASS / 42-CASE EN/ES CORPUS
    REAL_WORLD_CALIBRATION         NOT CLAIMED
G11 RUNTIME_RESUME_VERSIONING      PASS / CONTENT-ADDRESSED PROVENANCE
    DURABLE_PERSISTENCE            NOT YET
```

The next architectural priority is durable persistence / Career Vault, followed by explainability UX and legacy-score migration, privacy/security hardening, observability, real-world calibration, and pilot validation. The legacy keyword `atsScore` remains intentionally visible until the product UI is migrated to separate Resume Quality, Parseability, and Job Match concepts.
