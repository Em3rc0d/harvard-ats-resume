# ATS v2 Engineering Record

This directory is the durable engineering record for the ATS v2 evolution.

## Documentation discipline

Every implementation iteration records three views:

### BEFORE
- problem being solved
- observed current behavior
- invariants that must remain true
- scope and explicit non-goals
- known risks

### DURING
- decisions taken
- alternatives rejected
- code/contracts changed
- fixtures/tests added
- deviations from plan

### AFTER
- resulting behavior
- files/contracts changed
- remaining debt
- gate status
- next authorized iteration

## Migration sequence

1. PR-ATS2-00 — Prototype Freeze & Characterization
2. PR-ATS2-00B — Trust Containment
3. PR-ATS2-01 — Platform Health
4. PR-ATS2-02 — Domain Foundation

## Core invariant

The system may reorganize, summarize, clarify and prioritize candidate-provided career information. It must not silently create facts.
