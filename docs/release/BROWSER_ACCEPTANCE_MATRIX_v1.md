# CV Engine — Browser Acceptance Matrix v1

Status: **RELEASE GATE**

This matrix complements `RELEASE_SURFACE_AUDIT_v1.md`. The surface audit proves architecture and source-level contracts; this matrix requires a real Chromium browser against `next dev --webpack` to exercise user-visible transitions.

## Release rule

A primary product surface is not considered release-safe merely because it compiles, renders in source, or has a handler. The interaction must execute in a browser without an unhandled page error, dead transition, stale lock, or silent mutation of candidate evidence.

## START / global shell

- [x] START renders.
- [x] CV Engine home/reset is reachable from a deep stage.
- [x] EN → ES → EN changes live product copy.
- [x] `<html lang>` tracks the selected locale.
- [x] No browser `pageerror` is tolerated during the acceptance flows.

## Resume upload

- [x] Start from my CV opens Upload.
- [x] Cancel returns to START.
- [x] A typed `/api/import-resume` failure renders inline with `errorCode` and `stage`.
- [x] Expected API failure must not throw into the Next.js development overlay.
- [x] A successful import transitions to Imported Review.
- [x] Imported Review exposes the source file receipt.
- [x] Use another resume resets the flow.

Backend companion gates remain responsible for real PDF/DOCX parsing, source reconciliation, timeout classification, evidence mapping, MIME/size boundaries, and PDF.js Node runtime integrity.

## Career Evidence editor

### Navigation
- [x] Cancel from Personal returns to START.
- [x] Next / Previous work across sections.
- [x] Personal → Summary → Experience → Education → Skills → Projects → Certifications → Languages.
- [x] Continue to target only proceeds when readiness is satisfied.

### Personal
- [x] Name, email and location accept and preserve edits.

### Summary
- [x] Safe Optimize success applies returned wording.
- [x] Safe Optimize failure renders inline.
- [x] Failed optimization does not mutate existing candidate evidence.

### Experience
- [x] Add Work experience.
- [x] Remove Work experience.

### Education / certificate helper
- [x] Server-owned certificate PDF extraction can quick-fill a source-backed education record.
- [x] Remove source-filled Education.
- [x] Add Education manually.
- [x] Remove manual Education.

### Skills
- [x] Hard-skill editor accepts comma-separated evidence and normalizes duplicates.

### Projects
- [x] Add Projects.
- [x] Remove Projects.

### Certifications
- [x] Add Certifications.
- [x] Remove Certifications.

### Languages
- [x] Add Languages.
- [x] Remove Languages.

Voice input remains capability-dependent and is covered by its source/runtime fallback contract rather than assuming browser speech APIs exist in CI.

## Target — General Resume

- [x] General Resume can be selected.
- [x] A ready evidence state enables Generate trusted resume.
- [x] Back to career review returns to evidence without losing the career state.

## Target — Specific Job

- [x] Specific Job accepts role and Job Description.
- [x] Durable assessment locks mutable target controls while running.
- [x] Back is locked while a durable write is running.
- [x] Assessment failure renders inline.
- [x] Controls unlock after failure.
- [x] Target and Job Description survive a failed assessment.

Backend companion gates remain responsible for actual Job Intelligence, MatchReport, CareerTarget identity and durable assessment integrity.

## Opportunity Space

- [x] Compare multiple opportunities opens the surface.
- [x] Starts with two opportunity inputs.
- [x] Add opportunity works.
- [x] Remove opportunity works.
- [x] Build Opportunity Space locks target, jobs, add/remove and back controls during durable work.
- [x] Failure renders inline.
- [x] Controls unlock after failure.
- [x] Entered target/job text survives a failed sequence.
- [x] Back to one job returns to Target.

Backend companion gates remain responsible for multi-assessment durability, stable CareerSnapshot binding, OpportunitySpace identity and ordering semantics.

## Generation guardrails

- [x] A grounding 422 renders as a product state rather than an exception.
- [x] Proposed unsupported claim is visible to the user.
- [x] Edit my career evidence returns to the evidence editor.
- [x] Guardrail path produces no browser page error.

Semantic grounding, composition and persistence failure classes remain separately covered by behavior contracts; the public recovery controls are source-audited and share the same top-level recovery surface.

## Results

- [x] Successful generation renders Resume Quality.
- [x] Successful generation renders ATS Parseability.
- [x] Durable Career Vault status is visible.
- [x] Current version integrity is visible.
- [x] Print invokes the browser print path.
- [x] Download PDF emits an actual browser download with a candidate-safe filename.
- [x] Create New resets to START.
- [x] Result actions produce no browser page error.

Backend companion gates remain responsible for ResumeVersion content addressing, claim provenance, rendered-content integrity and durable Career Vault reload verification.

## What this gate intentionally does not fake

The browser suite mocks selected API responses to deterministically exercise success, guardrail, loading, locking and error states. It is **not** a substitute for server behavior tests or field dogfood with a real CV and real configured external services.

Release confidence therefore requires both layers:

1. **Server/domain gates** — source reconciliation, truth/semantic grounding, provenance, persistence, market durability, PDF runtime and production build.
2. **Browser acceptance gates** — real clicks, real state transitions, error presentation, lock/unlock behavior, export/print/reset, and zero unhandled page errors.

A real user CV remains the final field acceptance artifact for the import → evidence → target → generation golden path.
