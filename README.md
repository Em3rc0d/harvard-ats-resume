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

## vNext first-run boundary

The rebuild adds a trust + AI-access layer before normal product use:

```text
OPEN CV ENGINE
      ↓
Disclaimer / privacy / AI disclosure
      ↓
Explicit acknowledgement
      ↓
Choose AI access
      ├─ CV Engine Gemini access
      ├─ Bring Your Own Gemini Key
      └─ Continue without cloud AI
      ↓
Career Evidence / product flow
```

Cloud-enabled AI routing is:

```text
Gemini = primary provider
        ↓ recoverable failure
Ollama = fallback provider
        ↓
application-owned validation
```

Provider success never becomes truth by itself. Exact Gemini model assignments are pending the user's model list and benchmark matrix.

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

## AI/secret boundaries

- the CV Engine-owned Gemini key is server-side only;
- a BYOK Gemini key is transient secret material, not durable product state;
- BYOK is memory-only in the browser by default and request-scoped on the server;
- BYOK is never intentionally written to browser storage, Redis, databases, logs, analytics, telemetry, or URLs;
- production BYOK requires HTTPS;
- Ollama never receives the Gemini credential;
- cloud AI outage must not destroy the deterministic trusted core.

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

### `docs/vnext/`
Authoritative additions for the zero-based rebuild: first-run trust/AI access, Gemini-primary/Ollama-fallback provider routing, and BYOK secret handling. These override conflicting historical implementation assumptions.

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
2. `docs/vnext/`
3. Current product/truth contracts under `docs/ats-v2/baseline/`
4. Market architecture under `docs/market-v0.1/`
5. System contracts under `docs/system/`
6. Release acceptance documents under `docs/release/`
7. Historical PR docs / execution evidence
8. `sources/` and `archive/` material

Contradictions are not resolved by guessing. They must be documented as a design decision before implementation.

## Rebuild sequence

```text
B0   Repository + typed contracts
B0.5 First-run trust + AI access foundation
B1   Career Evidence core + durability
B2   Career Target + Job truth
B3   Evidence-backed Assessment
B4   Deterministic ResumeVersion
B5   Resume import convenience
B6   Gemini-primary / Ollama-fallback AI assistance
B7   Opportunity Space / market extension
B8   Release hardening
```

## Rebuild rule

The next implementation starts from an empty application branch/repository tree and consumes this documentation as specification.

We will not copy implementation files merely because they already exist. We may reuse proven ideas, fixtures, contracts, schemas, or algorithms only after deliberately re-deriving their place in the new architecture.

The goal is not to reproduce the old code faster.

The goal is to build **one coherent CV Engine from the specification**, with the trust boundaries, provider strategy, cost/security controls, market direction, tests, and release behavior designed in from the first commit.
