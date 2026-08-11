# PR-ATS2-04 — Structured AI Gateway

## Objective

Demote Gemini from an ad-hoc text author/parser boundary to a typed ATS v2 provider that returns schema-validated structured output.

## BEFORE

`lib/gemini.ts` concatenated system/user content into one prompt, duplicated the job description inside candidate JSON, requested delimiter-based text, parsed the result with regex/split heuristics, and used `Promise.race` for a local timeout.

## DURING

- Added application-level `AIResumeProvider` and `ResumeGenerationProposal` contracts.
- Added `GeminiResumeProvider` under infrastructure.
- Uses `systemInstruction` for model invariants.
- Uses `responseMimeType: application/json` plus `responseJsonSchema`.
- Runtime-validates decoded output with Zod before accepting it.
- Candidate JSON and job description are separated; the JD is sent exactly once as requirements-only data.
- Treats instructions embedded inside candidate/JD text as untrusted data.
- Uses an `AbortController` client timeout rather than delimiter parsing / `Promise.race`.
- Preserves the legacy `generateResumeWithGemini` function contract as a compatibility adapter.

## Invariants

- `INV-010`: only schema-valid model output may cross the AI provider boundary.
- `INV-011`: job-description data is requirements-only and must not be represented as candidate fact by the provider instructions.
- `INV-012`: AI provider output is a proposal; it is not yet authoritative candidate truth.

## Gate

`G5 STRUCTURED_AI`

PASS requires:
- clean `npm ci`
- lint PASS
- typecheck PASS
- build PASS
- no regex/delimiter parser in the Gemini generation path
- JSON schema response contract configured
- Zod runtime validation before output acceptance
- system instruction separated from user content
- no intentional API/UI response contract change
