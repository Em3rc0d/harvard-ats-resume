# CV Engine — Rebuild Source of Truth

**Branch purpose:** documentation-only baseline for rebuilding CV Engine from zero.

This branch intentionally contains **no application source code, no package manifests, no Docker runtime, no CI workflows, and no deployment configuration**. It exists to separate what CV Engine *must be* from how the previous implementation happened to implement it.

The previous implementation remains preserved in Git history and release/agent branches. It is evidence and a learning source, **not the codebase to continue patching**.

## Executive direction

```text
AI Resume Builder
        ↓
ATS Optimizer
        ↓
Application Intelligence       ← BEACHHEAD
        ↓
Opportunity Intelligence
        ↓
Career Opportunity Intelligence ← HARBOR
```

The product is not fundamentally a resume editor. The durable asset is the Career Model / Career Evidence. A resume is a versioned projection of defensible evidence for a context.

## Non-negotiable truth architecture

```text
Career Evidence = authority
Claims          = evidence-backed
Job Snapshot    = market truth
Career Target   = user intent, not capability
Assessment      = derived analysis
ResumeVersion   = deterministic projection
AI              = bounded assistant
```

The Job Description must never create candidate truth. Missing evidence remains missing. Unsupported skills, employers, metrics, dates, responsibilities, credentials, projects, seniority, or provenance must never be promoted into Career Evidence.

## Engineering doctrine inherited from the first implementation

```text
BENCHMARK → EVIDENCE → ARCHITECTURE
```

Never:

```text
ARCHITECTURE → HOPE → PATCH
```

Evidence language:

```text
UNKNOWN != PASS
DOCUMENTED != VERIFIED
CI GREEN != PRODUCT READY
OBSERVED != SUPPORTED
```

Meaningful failures should become fixtures, fault cases, or regression tests. But the rebuild must avoid turning characterization into endless micro-patching. Architecture should eliminate classes of failure.

## Documentation map

### `docs/ats-v2/`
The ATS v2 product/trust evolution, product contract, PR design records, trust UX work, execution evidence, and characterization fixtures.

### `docs/market-v0.1/`
The market architecture from Career Target through Opportunity Space, controlled market observation, market/job projections, persistence, refresh, candidate retrieval, and selected-candidate analysis.

### `docs/system/`
System characterization, runtime identity, capability contracts, failure taxonomy, degradation behavior, personas, E2E expectations, runtime envelope, import/capacity evidence, and release gates.

### `docs/release/`
Browser acceptance and release-surface audit documentation.

### `sources/`
Long-form design/review documents captured during the project. These are preserved as historical source material and should be reconciled against the authoritative rebuild contract rather than silently treated as current truth.

### `archive/current-implementation/`
README/Quick Start from the previous implementation. These describe the old runtime and are retained only as historical context. They are **not implementation instructions for the rebuild**.

## Rebuild authority order

When documents disagree, resolve them in this order:

1. `REBUILD-CONTRACT.md`
2. Current product/truth contracts under `docs/ats-v2/baseline/`
3. Market architecture under `docs/market-v0.1/`
4. System contracts under `docs/system/`
5. Release acceptance documents under `docs/release/`
6. Historical PR docs / execution evidence
7. `sources/` and `archive/` material

Contradictions are not resolved by guessing. They must be documented as a design decision before implementation.

## Rebuild rule

The next implementation starts from an empty application branch/repository tree and consumes this documentation as specification.

We will not copy implementation files merely because they already exist. We may reuse proven ideas, fixtures, contracts, schemas, or algorithms only after deliberately re-deriving their place in the new architecture.

The goal is not to reproduce the old code faster.

The goal is to build **one coherent CV Engine from the specification**, with the trust boundaries, market direction, tests, and release behavior designed in from the first commit.
