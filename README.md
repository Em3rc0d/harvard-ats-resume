# CV Engine

**Career Opportunity Intelligence with evidence-bound AI and guardrails.**

CV Engine is not a keyword-stuffing ATS resume builder. It separates candidate truth, market truth, derived fit, and generated presentation so a job description cannot silently become a career fact.

> **Core principle:** evidence before persuasion.

## Current release status

This repository is in **release-candidate hardening**. The codebase has a production build and a broad behavioral test suite, but release readiness is gated by end-to-end dogfood of the real user flows documented in `docs/release/RELEASE_SURFACE_AUDIT_v1.md`.

Do not treat a green build alone as proof that the product is released.

## Product model

```text
Career Evidence / Career Vault
            ↓
        Career Target
            ↓
       Job Snapshot
            ↓
     Job Intelligence
            ↓
        Job Match
            ↓
 Opportunity Assessment
            ↓
 Apply / Prepare / Skip context
            ↓
   constrained resume generation
            ↓
 deterministic grounding
            ↓
 semantic grounding
            ↓
 claim provenance / composition
            ↓
 durable ResumeVersion
```

The system maintains these boundaries:

- **Candidate evidence** describes what the candidate can support.
- **Job descriptions** are external market requirements, never candidate evidence.
- **Career Target** records intent/preferences, never capability.
- **Job Match** is evidence-backed requirement analysis, not hiring probability.
- **Opportunity Assessment** is decision support derived from existing evidence and job truth.
- **Resume generation** may rewrite presentation, but cannot authorize new candidate facts.
- **ResumeVersion** is emitted only after grounding and claim provenance succeed.

## Trust invariants

1. No source match → no imported fact.
2. Missing evidence → remain missing; do not invent it.
3. Job requirement ≠ candidate fact.
4. Career preference ≠ candidate capability.
5. No assertion support → no trusted ResumeClaim.
6. Guardrail failure → safe stop; no trusted ResumeVersion is emitted.
7. Unsupported parser/model leaves may be omitted while supported source-backed evidence survives.
8. Durable Career Vault operations fail closed; they are not silently downgraded to in-memory persistence.

## Public product flow

The current public UI uses one audited flow:

```text
START
  ├─ Import PDF/DOCX
  │      ↓
  │  Imported Resume Review
  │      ↓
  └─ Manual Career Evidence
         ↓
      Career Target
         ↓
 Specific Job + Opportunity Assessment
         or
 General Resume
         ↓
 Trusted Generation
         ↓
 Guardrails / Provenance
         ↓
 Results + durable ResumeVersion
```

Opportunity Space is a separate comparison surface that evaluates several job descriptions against one stable CareerSnapshot and one Career Target.

## Resume import

Supported resume formats:

- PDF with machine-readable text
- DOCX
- maximum 10 MB

Import pipeline:

```text
file validation
  ↓
server-side document text extraction
  ↓
Gemini structured extraction proposal
  ↓
source reconciliation
  ↓
only source-backed fields retained
  ↓
source receipt + evidence map
  ↓
Candidate Review
```

Gemini is a parser proposal source here, not the authority for candidate truth. If one proposed field cannot be found in the source, that field is removed rather than promoted as trusted evidence.

## Career evidence editor

The editor contains candidate evidence only:

- personal information
- optional professional summary
- work evidence
- education evidence
- skills
- projects
- certifications
- languages

The product does **not** require a candidate to invent a summary, employer, education record, or metric just to satisfy a traditional resume template. Identity plus at least one material career-evidence dimension is required.

## Job targeting and opportunity intelligence

For a targeted resume, the user defines:

- target role
- preferred seniority
- location preference
- work model
- complete job description

Target preference and Job Match are evaluated separately. A targeted resume cannot be built from the canonical UI until the current job/target combination has a current Opportunity Assessment.

Opportunity Space supports 2–10 jobs. Inputs are frozen while durable assessments are being written so results cannot be composed from a UI state that changed mid-run.

## Resume generation and provenance

Generation uses Gemini for constrained rewriting, then passes through deterministic and semantic safety layers before persistence:

```text
Gemini proposal
  ↓
text normalization
  ↓
deterministic grounding
  ↓
semantic grounding
  ↓
resume composition
  ↓
claim-to-CareerAssertion provenance
  ↓
Career Vault persistence
  ↓
ResumeVersion
```

The rendered resume is not allowed to become the authority from which career truth is inferred.

## Certificate / education helper

Certificate images may be OCR'd in the browser. Certificate PDFs cross a server-owned PDF text extraction boundary. Missing extraction fields stay empty; presentation strings such as “Degree not found” are never stored as candidate facts.

## API surfaces

Primary public routes include:

- `POST /api/import-resume` — trusted PDF/DOCX intake
- `POST /api/extract-certificate-text` — bounded PDF certificate text extraction
- `POST /api/optimize-content` — fact-preserving inline wording assistance
- `POST /api/assess-opportunity` — target-aware opportunity assessment
- `POST /api/opportunity-space` — durable multi-opportunity composition
- `POST /api/generate-resume` — trusted resume generation + provenance + durability

Additional market-observation routes implement the controlled market architecture and are intentionally separate from candidate truth.

## Rate limiting and durability

Public API requests use endpoint-scoped, non-reversible request identities. The default public API budget is currently **50 requests per hour per scoped request identity**.

Local development defaults to in-memory rate limiting to avoid stale Redis/DNS dependencies during field tests. Production uses Redis automatically when credentials exist. This fallback policy applies to rate limiting only; Career Vault durability remains fail-closed.

## Environment

Copy `.env.example` and configure the server-side integrations required for the flows you exercise.

At minimum, model-backed resume import/generation requires:

```env
GEMINI_API_KEY=...
```

Durable Career Vault / market history requires the configured Upstash Redis credentials described in `.env.example`.

Optional bounded timeouts include:

```env
RESUME_IMPORT_TIMEOUT_MS=90000
RESUME_GENERATION_TIMEOUT_MS=120000
```

## Development

```bash
npm ci
npm run dev
```

The development server currently runs Next.js with Webpack because PDF.js runtime isolation is explicitly tested against that boundary.

## Verification

Before merging release changes, run:

```bash
npm audit --audit-level=moderate
npm run lint
npm run typecheck
npm test
npm run build
node scripts/verify-pdfjs-server-bundle.mjs
```

CI performs those gates. The PDF.js bundle check verifies that the server runtime keeps the native PDF.js dynamic import boundary intact instead of allowing Webpack to corrupt the module namespace.

## Release evidence

See:

- `docs/release/RELEASE_SURFACE_AUDIT_v1.md` — page/button/state audit and release gate
- `docs/ats-v2/` — ATS v2 trust/provenance work
- market architecture documentation in the repository for Career Opportunity Intelligence / MarketObservation work

## What CV Engine does not claim

CV Engine does not claim to:

- predict whether a company will hire the candidate;
- turn missing job requirements into candidate experience;
- invent metrics to make bullets sound stronger;
- infer credentials, seniority, ownership, impact, or technologies without evidence;
- guarantee that a resume will “beat” an ATS;
- treat an AI model response as a trusted career record by itself.

The product is designed to help a person decide and present more clearly **without corrupting the evidence that decision depends on**.
