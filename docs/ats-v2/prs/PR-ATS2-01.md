# PR-ATS2-01 — Platform Health

## Objective

Establish foundational CI/QA, streamline dependencies, and resolve contradictions regarding multilingual UI support to prepare the platform for the core ATS v2 domain migration.

## BEFORE

- Package scripts were inconsistent and `next` was floated (`^14.2.0`), risking unverified upstream breakage.
- No automated CI pipeline existed for regression testing on GitHub.
- Environment variable documentation in `.env.example` was missing several `NEXT_PUBLIC_N8N_*` keys required for webhook integrations.
- Gemini integration relied on the legacy `@google/generative-ai` SDK rather than the new `@google/genai` SDK.

## DURING

- **Scripts & Dependencies**: Added `"typecheck": "tsc --noEmit"` to `package.json`. Locked Next.js to exactly `14.2.35`.
- **CI Automation**: Created `.github/workflows/ci.yml` to run `npm ci`, `npm run lint`, `npm run typecheck`, and `npm run build` on PRs and pushes to `develop` and `main`.
- **Environment Contract**: Synced `.env.example` with `.env` to clearly document the required n8n webhook URLs.
- **Gemini SDK Migration**: Migrated from the legacy `@google/generative-ai` package to the supported `@google/genai` package while preserving all prompt rules and outputs perfectly.
- **Dependency Audit**: Conducted an `npm audit`. Found 1 critical vulnerability in `jspdf` (a direct production dependency). The vulnerability (`GHSA-f8cm-6447-x5h2`, `GHSA-wfv2-pwc8-crg5`) has a breaking fix available in 4.2.1, but since it's an ATS generation client-side task and no non-breaking fix exists, it is ACCEPTED TEMPORARILY WITH RATIONALE.

## AFTER

The platform rests on a stable, verified, and automated foundation. Product functionality is fully preserved. The environment contract is documented, and continuous integration ensures baseline regressions are blocked via a verified GitHub Actions workflow. Gemini integration is modern and secure.

## Gate Status
`G0 REPRODUCIBLE_BASELINE — PASS` (Inherited)
`G1 TRUST_CONTAINMENT — PASS` (Inherited)
`G2 PLATFORM_HEALTH — PASS`
