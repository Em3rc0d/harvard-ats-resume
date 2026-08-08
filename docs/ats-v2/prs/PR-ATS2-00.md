# PR-ATS2-00 — Prototype Freeze & Characterization

## Objective

Freeze and document the current v1 prototype before changing functional behavior.

Baseline commit:
`198b182e89124224be426ed22b915bec77da1bb6`

Working branch:
`develop`

## BEFORE

Known visible capabilities:
- manual resume wizard
- CV upload
- certificate OCR
- voice input
- field optimization
- Gemini resume generation
- ATS v1 heuristic scoring
- results preview
- PDF export
- language selector
- rate limiting

Known architectural boundaries:
- UI built with Next.js/React
- Zod schema at API boundary
- Gemini integration in `lib/gemini.ts`
- ATS heuristic in `lib/ats-scoring.ts`
- direct browser-to-n8n integrations in upload/optimization flows
- PDF output via jsPDF

## Scope

- freeze the baseline SHA
- inventory current product behavior
- record characterization fixtures
- document known contradictions without fixing them
- define Gate G0 evidence

## Non-goals

- no functional changes
- no trust containment fixes
- no Next.js upgrade
- no Gemini SDK migration
- no scoring redesign
- no domain model implementation
- no persistence
- no n8n refactor

## DURING

PR-00 is documentation/characterization only. Findings are recorded as baseline evidence; they are not fixed in this PR.

## Gate G0 — REPRODUCIBLE_BASELINE

Required evidence:
- clean checkout
- dependency install succeeds
- typecheck result recorded
- build result recorded
- application starts
- primary manual flow reachable
- current behavior represented by characterization fixtures

Execution details and full evidence are recorded in:
[EXECUTION_EVIDENCE.md](../baseline/EXECUTION_EVIDENCE.md)

Current status:
`PASS — A fully clean checkout (with no corrupt node_modules cache) successfully builds, lints, typechecks, and runs.`

## AFTER

When G0 is fully evidenced, the next authorized iteration is:
`PR-ATS2-00B — Trust Containment`.
