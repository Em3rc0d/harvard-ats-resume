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
The product requires the user to provide factual missing data. No system fabrication occurs.

Gate status:
`G1 TRUST_CONTAINMENT — PASS`
