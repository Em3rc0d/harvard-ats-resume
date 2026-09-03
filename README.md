# CV Engine — Zero-Based Rebuild

CV Engine is being rebuilt from the accumulated product, trust, market, system and release specifications into one coherent implementation.

This branch family is **no longer documentation-only**. The source-of-truth documentation has authorized implementation through the current construction graph.

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

The missing product principle is now explicit:

> CV Engine must convert defensible career truth into the strongest professional presentation possible for a context, while preserving the ability to demonstrate why every resulting claim remains defensible.

In compact form:

```text
TRUTH → POSITIONING → PRESENTATION → PROOF
```

## Non-negotiable truth architecture

```text
Career Evidence       = candidate authority / what is true
Job Snapshot          = market truth
Career Target         = intent, not capability
Assessment            = derived analysis
PresentationPlan      = contextual selection / ordering / emphasis
PresentationRevision  = how verified truth is expressed
ResumeVersion         = deterministic compiled projection
AI output             = bounded proposal
```

The Job Description must never create candidate truth. Missing evidence stays missing. Unsupported skills, employers, metrics, dates, responsibilities, credentials, projects, seniority or provenance must never be promoted into Career Evidence or silently introduced through presentation optimization.

P1 presentation authority:

- `docs/vnext/05-TRUTH-PRESERVING-PRESENTATION.md`

## Current rebuild status

The canonical construction ledger is:

- `docs/build/BUILD-GRAPH.md`

Closure policy is:

- `docs/build/CLOSURE-PROTOCOL.md`

Do not infer build completion from this README, historical PR documents or archived implementation notes.

The active product node is **P1 — Truth-Preserving Professional Presentation**. B0 through B7 remain closed; B8 final certification and CVENGINE_V1_0_0 are release-blocked until P1 closes.

## Current implemented foundation

The rebuild already includes the trusted foundation needed by P1:

- Next.js / TypeScript application baseline;
- Supabase Auth session boundary;
- first-run trust disclosure and consent receipt;
- AI access mode selection;
- transient browser-memory BYOK handling;
- PostgreSQL/Supabase Career Vault;
- owner-scoped RLS;
- revisioned Career Evidence;
- target/job truth separation;
- evidence-backed assessments;
- deterministic B4 ResumeVersion baseline;
- trusted resume import convenience;
- Gemini-primary/Ollama-fallback bounded AI runtime;
- `INLINE_WORDING_OPTIMIZATION` bounded proposal capability;
- Opportunity Space foundation;
- B8 release-hardening implementation awaiting final certification.

P1 does not replace that foundation. It turns it into the product experience we actually want.

## P1 product path

```text
Career Evidence
      ↓
Career Target / Job context
      ↓
Presentation Plan
      ↓
strongest supported wording / selection / ordering
      ↓
truth-preserving validation
      ↓
source vs proposal vs diff
      ↓
explicit user approval
      ↓
immutable approved PresentationRevision
      ↓
deterministic ResumeVersion
      ↓
DOCX / PDF / TXT / provenance JSON
```

If AI is unavailable or a proposal cannot be justified, CV Engine degrades to deterministic/manual source-preserving presentation instead of weakening truth guarantees.

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
- BYOK is memory-only in the browser by default and request-scoped on the server;
- BYOK must not be written to browser storage, Redis, databases, logs, analytics, telemetry or URLs;
- production BYOK requires HTTPS outside the explicit localhost development exception;
- Ollama never receives a Gemini credential;
- cloud AI outage must not destroy the deterministic trusted core;
- AI may propose presentation but may not approve it, create candidate truth or compile the final ResumeVersion.

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
B0   Repository + typed contracts                         CLOSED
B0.5 First-run trust + AI access foundation              CLOSED
B1   Career Evidence core + durability                    CLOSED
B2   Career Target + Job truth                            CLOSED
B3   Evidence-backed Assessment                           CLOSED
B4   Deterministic ResumeVersion baseline                 CLOSED
B5   Resume import convenience                            CLOSED
B6   Gemini-primary / Ollama-fallback AI assistance      CLOSED
B7   Opportunity Space / market extension                 CLOSED
P1   Truth-Preserving Professional Presentation           ACTIVE
B8   Release hardening / final certification              BLOCKED_BY_P1
```

## Definition of done

CV Engine vNext is done only when a new user can turn verified career history into the strongest supported professional presentation for a chosen context, review and approve meaningful presentation changes, export a deterministic provenance-backed ResumeVersion as DOCX/PDF/TXT plus provenance JSON on a clean runtime, and the release evidence supports every production claim.
