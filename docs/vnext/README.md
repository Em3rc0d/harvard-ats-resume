# CV Engine vNext — Authoritative Rebuild Contracts

This directory contains the authoritative product, AI, security and production-foundation contracts for the zero-based rebuild.

## Status

```text
PRODUCT / TRUTH ARCHITECTURE     CLOSED WITH AUTHORITY CORRECTION 11
AI / BYOK ARCHITECTURE           CLOSED
PF0 PRODUCTION FOUNDATION        CLOSED
ZERO-BASED IMPLEMENTATION        AUTHORIZED
PRODUCT COHERENCE IMPLEMENTATION AUTHORIZED BY CONTRACT 12
PRODUCTION READY CLAIM           REQUIRES NEW EXACT-SHA + REAL-CV RELEASE EVIDENCE
```

The documentation phase previously reached its stop condition. Broad conceptual redesign remains prohibited unless executable evidence demonstrates a genuinely missing boundary.

Real-user resume dogfood demonstrated such a boundary: candidate-provided assertions had become over-constrained as if lack of external verification made them unusable for normal resume improvement. `11-CANDIDATE-SOURCE-AUTHORITY-AND-AI-TRANSFORMATION.md` is therefore an authorized truth-boundary correction, not an informal redesign.

`12-CV-IMPROVEMENT-IMPLEMENTATION-CONTRACT.md` closes the ten implementation nodes required by Contract 11 and authorizes a narrow additive implementation in dependency order. Random symptom patches and unnecessary backend rewrites remain prohibited.

## Authority set

1. `00-FIRST-RUN-TRUST-AND-AI-ACCESS.md`
   - disclaimer/consent boundary;
   - platform Gemini vs BYOK vs no-cloud;
   - AI never gates the trusted deterministic core.

2. `01-AI-PROVIDER-ROUTING.md`
   - provider-agnostic gateway;
   - Gemini primary;
   - Ollama fallback when available/qualified;
   - same validation contract across providers.

3. `02-BYOK-SECRET-HANDLING.md`
   - transient request/session secret;
   - no intentional persistence;
   - HTTPS outside localhost;
   - canary leakage tests.

4. `03-GEMINI-MODEL-MATRIX.md`
   - initial model routing baseline;
   - high-volume default: Gemini 3.5 Flash Lite;
   - quality escalation: Gemini 3.7 Flash;
   - reserves: Gemini 3.6 Flash / Gemini 3.1 Flash Lite;
   - free-tier snapshot is not a production SLA.

5. `04-BUILD-READINESS-AUDIT.md`
   - **PF0 CLOSED — IMPLEMENTATION AUTHORIZED**;
   - final GO/NO-GO boundary for construction.

6. `05-IDENTITY-AND-SESSION-CONTRACT.md`
   - Supabase Auth;
   - authenticated durable Career Vaults;
   - single-user B2C ownership;
   - application authorization + PostgreSQL RLS;
   - account export/deletion.

7. `06-DATA-PERSISTENCE-AND-LIFECYCLE.md`
   - Supabase PostgreSQL as durable authority;
   - revisioned Career Evidence;
   - immutable historical snapshots/ResumeVersions;
   - ephemeral private source-file processing;
   - Redis is operational, not truth authority.

8. `07-RUNTIME-TOPOLOGY-AND-DEPLOYMENT-CONTRACT.md`
   - Next.js 16 / Vercel commercial runtime;
   - Supabase Auth/Postgres/temp Storage;
   - Gemini primary;
   - Ollama local/remote fallback when qualified;
   - deterministic/manual degradation when unavailable.

9. `08-AI-QUOTA-COST-AND-ABUSE-POLICY.md`
   - capability-owned attempt budgets;
   - daily/platform cost guards;
   - quality escalation scarcity;
   - PostgreSQL usage accounting;
   - BYOK remains bounded.

10. `09-SECURITY-OBSERVABILITY-PRIVACY-BASELINE.md`
    - data classification;
    - metadata-first observability;
    - CSP/security headers;
    - secret redaction/canary;
    - private upload boundary;
    - processor inventory/incident baseline.

11. `10-ULTRAPREMIUM-UI-MOTION-QUALITY-BAR.md`
    - $45K visual/product quality bar;
    - $22K motion/fluidity bar;
    - applies after functionality/UX/accessibility/responsiveness are correct.

12. `11-CANDIDATE-SOURCE-AUTHORITY-AND-AI-TRANSFORMATION.md`
    - **Believe the user's source. Distrust the AI's additions.**
    - candidate-authored source is authoritative candidate assertion;
    - lack of external verification does not make a claim false or unusable;
    - AI transformations require provenance/fact-preservation validation;
    - unsupported AI additions are blocked, not candidate-provided claims;
    - Truth Graph is a provenance/safety ledger, not a background-check tribunal;
    - core product path is upload → improve → validate → deliver.

13. `12-CV-IMPROVEMENT-IMPLEMENTATION-CONTRACT.md`
    - closes all ten pre-code implementation nodes from Contract 11;
    - preserves current CareerEvidence/TruthClass storage semantics without destructive renames;
    - introduces a full-document semantic model above mechanical source lines;
    - separates powerful Resume Editor from strict Fact Guardian;
    - requires provider structured outputs and section/entity-level recovery;
    - defines the task-first Improve CV UX;
    - freezes an additive `ResumeImprovementRun` authority and lifecycle;
    - makes real-CV quality acceptance a release gate;
    - defines I1→I10 implementation order and exact-SHA re-certification.

## Governing architecture

```text
Candidate source assertion = candidate authority
Candidate confirmation     = additional candidate review state
External verification      = optional future provenance enhancement
Job Snapshot               = market truth
Career Target              = intent
Assessment                 = derived analysis
AI transformation          = proposed presentation
Fact Guardian              = source-preservation gate
Resume Improvement Run     = immutable transformation lineage
Resume Artifact            = accepted projection
```

The previous shorthand `Career Evidence = candidate authority` remains structurally useful, but Contract 11 clarifies ingestion semantics: candidate-authored CV/source material may become candidate-authoritative assertions without first proving the candidate's biography externally.

Hard distinction:

```text
Not externally verified != false
Candidate-provided assertion != unsupported AI addition
UNVERIFIED/NEEDS_REVIEW/VERIFIED != external verification classes
```

```text
PostgreSQL = durable authority
Gemini     = primary remote AI
Ollama     = resilience fallback when available
Redis      = optional operational accelerator
```

## Historical build order

```text
B0    empty implementation / typed contracts / CI
B0.5  first-run trust + identity + AI access
B1    Career Evidence + durable ownership
B2    Career Target + Job truth
B3    Assessment
B4    deterministic ResumeVersion + export
B5    import convenience
B6    AI gateway implementation + qualification
B7    Opportunity Space / market extension
B8    production evidence / release qualification
B9    presentation / artifact / production browser closure
```

## Product-coherence implementation order

Contract 12 authorizes only this dependency-ordered path unless executable evidence proves a dependency conflict:

```text
I1  Source-authority policy helpers + regression contracts
 ↓
I2  CandidateResumeDocument semantic domain
 ↓
I3  Structured semantic-understanding capability
 ↓
I4  Resume Improvement Run persistence + RLS/lifecycle
 ↓
I5  Holistic Resume Editor capability
 ↓
I6  Fact Guardian + repair/recovery
 ↓
I7  Resume artifact adapter for improvement result
 ↓
I8  Primary Improve CV UX
 ↓
I9  Real-CV golden harness + quality rubric
 ↓
I10 Production E2E + release re-certification
```

No Market Intelligence, scraping, job discovery, external verification or global-navigation rewrite is required to complete this path.

## Current working rule

```text
TRUTH AUTHORITY CORRECTION → CLOSED
IMPLEMENTATION GRAPH        → CLOSED
BUILD                        → AUTHORIZED I1→I10
RANDOM RE-CODING             → PROHIBITED
UNNECESSARY BACKEND REWRITE  → PROHIBITED
```

Provider routing improves availability. Truth contracts decide source authority and transformation acceptance. Production foundation decides ownership, durability, security and deployability.

The primary product principle remains:

> **Believe the user's source. Distrust the AI's additions.**

And the primary product outcome is:

> **Upload a CV, receive a materially improved source-faithful CV, and download it without operating CV Engine's internal ontology.**
