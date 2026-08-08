# PR-ATS2-01 — Platform Health

## Objective

Establish foundational CI/QA, streamline dependencies, and resolve contradictions regarding multilingual UI support to prepare the platform for the core ATS v2 domain migration.

## BEFORE

- Package scripts were inconsistent and `next` was floated (`^14.2.0`), risking unverified upstream breakage.
- No automated CI pipeline existed for regression testing on GitHub.
- Environment variable documentation in `.env.example` was missing several `NEXT_PUBLIC_N8N_*` keys required for webhook integrations.
- Legacy SonarQube scripts (`sonar-pipeline.ps1`, `run-pipeline.bat`, `sonar-project.properties`) cluttered the root directory.
- The UI language selector advertised French (`fr`), Portuguese (`pt`), and Spanish (`es`) support, despite the ATS matching engine being characterized primarily for English (creating a product contract contradiction).

## DURING

- **Scripts & Dependencies**: Added `"typecheck": "tsc --noEmit"` to `package.json`. Updated `@google/generative-ai` to the latest stable `^0.24.1` and locked Next.js to exactly `14.2.35`.
- **CI Automation**: Created `.github/workflows/ci.yml` to run `npm ci`, `npm run lint`, `npm run typecheck`, and `npm run build` on PRs and pushes to `develop` and `main`.
- **Environment Contract**: Synced `.env.example` with `.env` to clearly document the required n8n webhook URLs.
- **Legacy Cleanup**: Deleted unused `sonar-pipeline.ps1`, `run-pipeline.bat`, and `sonar-project.properties`.
- **i18n Cleanup**: Removed `fr`, `pt`, and `es` from `lib/translations.ts` and the UI `LanguageProvider`, and completely deleted the unused `LanguageSwitcher.tsx` component. English is now the definitive single source of truth for the product interface, aligning it with the matching engine.

## AFTER

The platform rests on a stable, verified, and automated foundation. The multilingual contradiction has been resolved by restricting the UI to English. The environment contract is fully documented, and continuous integration ensures baseline regressions are blocked before merging.

## Gate Status
`G0 REPRODUCIBLE_BASELINE — PASS` (Inherited)
`G1 TRUST_CONTAINMENT — PASS` (Inherited)
`G2 PLATFORM_HEALTH — PASS`
