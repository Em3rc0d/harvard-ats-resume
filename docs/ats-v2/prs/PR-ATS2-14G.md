# PR-ATS2-14G — Trust-First Imported Review UX

## BEFORE

### Problem
ATS v2 had already evolved into a provenance-aware career evidence system, but the primary UI still exposed the legacy resume-builder workflow:

`Upload → 9-step form → Generate → Results`

That caused several product/architecture mismatches:

- native import provenance was largely invisible to the candidate;
- imported technologies were present in data but not visible in the Experience review step;
- Job Description appeared as a final keyword-optimization step instead of separate Job Truth;
- grounding and semantic-grounding blocks were flattened into generic generation errors;
- upload copy promised drag-and-drop although the component had no drop handlers;
- the imported happy path required unnecessary navigation through every manual form section.

### Invariants
- imported facts remain `CANDIDATE_ASSERTED`, never automatically `VERIFIED_FACT`;
- Job Description never becomes candidate evidence;
- deterministic grounding remains authoritative;
- semantic grounding remains downstream of deterministic grounding;
- resume composition still requires complete CareerAssertion traceability;
- Career Vault durability claims remain fail-closed;
- manual edits of imported values retain the existing candidate-review provenance path.

### Non-goals
- date normalization/domain migration;
- normalized language proficiency enum;
- stable IDs for experience/education/project entities;
- certificate provenance redesign;
- authentication/Career Vault ownership;
- persistence concurrency hardening;
- removal of all legacy manual-form internals.

## DURING

### Product decision
Imported and manual workflows are now intentionally different.

Imported happy path:

`Upload → Career Review → Target Job → Trusted Generate → Results`

Manual path:

`Start manually → ResumeForm → Trusted Generate → Results`

Candidates who import a resume can still enter the manual editor, and the original `sourceContext` remains attached so changed fields continue to be distinguishable from unchanged imported evidence by `LegacyResumeAdapter`.

### Career Review
The new review surface exposes:

- source filename;
- partial source SHA-256;
- total source-backed field count;
- personal data;
- summary;
- experience and imported technologies;
- education;
- hard/soft skills;
- projects;
- certifications;
- languages.

This is explanatory UI only. It does not mutate truth classes or provenance.

### Target Job
Job targeting is now a separate UI surface after candidate evidence review. The copy explicitly states that missing requirements remain missing and Job Description content cannot become candidate evidence.

### Guardrail UX
Structured grounding and semantic-grounding response payloads are now surfaced as a candidate-review action. The product explains why generation stopped and can show proposed facts/claims that require stronger underlying candidate evidence.

### Upload UX
The resume upload surface now implements `dragover`, `dragleave`, and `drop` handling. Long-running import communication describes the conceptual pipeline without claiming a fake percentage or a fixed short duration.

## AFTER

### Resulting workflow

```text
Resume source
    ↓
Trusted native import
    ↓
Source-bound evidence validation
    ↓
Career Review
    ↓
Target Job? ───── no ───→ General Resume
    │
    yes
    ↓
Job Truth
    ↓
Trusted generation pipeline
    ↓
Grounding / Semantic Guard / Composition / Career Vault
    ↓
Explainable Results
```

### Regression coverage
Six new behavior tests cover:

1. provenance-aware imported review model;
2. imported flow order (`Career Review → Target`);
3. Job Description truth-boundary copy;
4. visibility of imported Experience technologies;
5. actual drag-and-drop handlers;
6. actionable deterministic/semantic grounding UX.

Expected behavior-suite total at this PR head: **76 tests**.

### Remaining debt
The UI still uses the legacy `ResumeRequest` DTO and manual `ResumeForm` internally. A later data/domain gate should evaluate typed dates, normalized language proficiency, stable entity identifiers, and a native Career Draft contract that structurally separates candidate data from target-job data.
