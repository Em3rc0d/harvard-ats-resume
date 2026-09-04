# CV Engine — Zero-Based Rebuild

CV Engine is being rebuilt from the accumulated product, trust, market, system and release specifications into one coherent implementation.

This branch family is **no longer documentation-only**. The source-of-truth documentation has already authorized implementation, and the current rebuild contains the B0/B0.5/B1 application foundation.

## Product direction

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

The durable asset is the Career Model / Career Evidence. A resume is a versioned projection of defensible evidence for a context.

## Non-negotiable truth architecture

```text
Career Evidence = candidate authority
Job Snapshot    = market truth
Career Target   = intent, not capability
Assessment      = derived analysis
ResumeVersion   = deterministic projection
AI output       = bounded proposal
```

The Job Description must never create candidate truth. Missing evidence stays missing. Unsupported skills, employers, metrics, dates, responsibilities, credentials, projects, seniority or provenance must never be promoted into Career Evidence.

## Current rebuild status

The canonical construction ledger is:

- `docs/build/BUILD-GRAPH.md`

Closure policy is:

- `docs/build/CLOSURE-PROTOCOL.md`

Do not infer build completion from this README, historical PR documents or archived implementation notes.

## Current implemented foundation

The rebuild currently includes:

- Next.js / TypeScript construction baseline;
- Supabase Auth session boundary;
- first-run trust disclosure and consent receipt;
- AI access mode selection;
- transient browser-memory BYOK storage foundation;
- PostgreSQL/Supabase Career Vault schema;
- owner-scoped RLS definitions;
- revisioned Career Evidence persistence model;
- manual Career Evidence create/list/revise/delete path;
- optimistic revision conflict protection;
- construction CI.

Later product nodes remain blocked until their predecessors are closed according to the canonical graph.

## First-run boundary

```text
OPEN CV ENGINE
      ↓
Trust / privacy / AI disclosure
      ↓
Explicit acknowledgement
      ↓
Authenticated account/session
      ↓
Choose AI access
      ├─ CV Engine Gemini access
      ├─ Bring Your Own Gemini Key
      └─ Continue without cloud AI
      ↓
Career Evidence
```

Provider choice never changes truth authority.

## AI and secret boundaries

- the CV Engine-owned Gemini key is server-side only;
- a BYOK Gemini key is transient secret material, not durable product state;
- BYOK is memory-only in the browser by default and request-scoped on the server when provider calls are implemented;
- BYOK must not be written to browser storage, Redis, databases, logs, analytics, telemetry or URLs;
- production BYOK requires HTTPS outside the explicit localhost development exception;
- Ollama never receives a Gemini credential;
- cloud AI outage must not destroy the deterministic trusted core.

## Engineering doctrine

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

Meaningful failures become fixtures, fault cases or regression tests.

## Rebuild authority order

When documents disagree, resolve them in this order:

1. `REBUILD-CONTRACT.md`
2. `docs/build/CLOSURE-PROTOCOL.md`
3. `docs/build/BUILD-GRAPH.md` for construction status only
4. `docs/vnext/`
5. current product/truth contracts under `docs/ats-v2/baseline/`
6. market architecture under `docs/market-v0.1/`
7. system contracts under `docs/system/`
8. release acceptance documents under `docs/release/`
9. historical PR docs / execution evidence
10. `sources/` and `archive/` material

Contradictions are not resolved by guessing.

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

## Definition of done

CV Engine vNext is done only when a new user can complete the core product path through an exported, provenance-backed ResumeVersion on a clean runtime, including safe failure/degradation paths, without hidden developer intervention, and the B8 release evidence supports every production claim.
