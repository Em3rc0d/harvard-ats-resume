# CV Engine — Contract Sign-off v1.1

Status: **SIGNED**

This document records engineering sign-off on the zero-based rebuild contracts. It freezes the intended product/truth/security/persistence/runtime semantics while preserving the distinction between a signed contract and a closed implementation node.

## Sign-off principle

I sign a contract only when its responsibilities, authority boundaries, failure semantics and release claims are coherent with the rest of the rebuild.

A signed contract is allowed to remain implementation-blocked.

```text
SIGNED CONTRACT != CLOSED BUILD NODE
```

## Product and truth contracts — SIGNED

```text
Career Evidence        candidate authority
Job Snapshot           market truth
Career Target          intent
Assessment             derived analysis
ResumeVersion          deterministic provenance-backed projection
PresentationRevision   approved wording authority bound to exact evidence revision
ResumePlan             editorial selection/order authority
ResumeArtifact         final rendered presentation artifact
AI output              bounded proposal only
```

No downstream node may collapse these boundaries into one generic resume-data authority.

## First-run / trust contract — SIGNED

Signed invariants:

- explicit disclosure before product entry;
- authenticated durable production identity;
- explicit AI access choice;
- no-cloud mode preserves trusted deterministic workflows;
- provider choice cannot mutate truth authority;
- materially changed disclosure requires acknowledgement again.

## BYOK secret contract — SIGNED

Signed invariants:

- raw credential is transient secret material;
- no intentional durable/browser persistence;
- HTTPS required outside loopback development;
- server handling is request-scoped when provider invocation exists;
- Ollama never receives Gemini credentials;
- no raw/partial key in logs, provenance, telemetry or errors;
- provider paths require physical certification before support claims.

## Identity / ownership contract — SIGNED

Signed invariants:

- Supabase Auth identity;
- one owner identity controls each Career Vault;
- application authorization plus PostgreSQL RLS;
- no anonymous durable production Career Vault;
- cross-user IDOR is a release blocker.

## Persistence / lifecycle contract — SIGNED

Signed invariants:

- PostgreSQL is durable authority;
- Redis is not career truth;
- Career Evidence is revisioned;
- historical snapshots/ResumeVersions/approved presentation records are immutable according to their contracts;
- trusted mutations are atomic;
- optimistic concurrency prevents silent overwrite;
- source uploads are ephemeral/private by default;
- export/delete and restore behavior remain release-critical.

## Runtime/deployment contract — SIGNED

Signed target topology:

```text
Next.js / Vercel
Supabase Auth + PostgreSQL + private temporary storage
Gemini primary AI
Ollama qualified fallback where available
Upstash optional operational accelerator
```

A topology contract does not qualify a deployment. Identified-runtime evidence remains mandatory.

## AI quota/cost/abuse contract — SIGNED

Signed invariants:

- capability-owned attempt budgets;
- finite retry chains;
- token/output/deadline bounds;
- platform cost protection cannot depend solely on Redis;
- BYOK remains bounded and is never a generic provider proxy;
- free-tier observations are not production capacity claims.

## Security / observability / privacy contract — SIGNED

Signed invariants:

- metadata-first logs;
- no raw career content/secrets in production logs by default;
- secret canary certification;
- security headers/CSP baseline;
- RLS/IDOR release gates;
- private validated uploads;
- provider/processor inventory;
- incident handling and deletion/export behavior must be evidenced before release.

## B2 contract — SIGNED

Career Target and Job truth remain distinct. Job requirements are deterministic market-side structures and can never create Career Evidence.

## B3 contract — SIGNED

Assessment must expose evidence-backed states and explicit uncertainty. `UNKNOWN` is never silently scored as a pass. Hiring-probability theater is forbidden.

## B4 contract — SIGNED

Trusted ResumeVersion creation is deterministic/application-owned, immutable after creation, provenance-bearing and transactional. B4 source-preserving claims remain valid and are not weakened by B9.

## B5 contract — SIGNED

Import is convenience. Mechanical extraction and deterministic source boundaries precede AI. Unsupported/ambiguous facts are never accepted as candidate truth. Failure degrades to manual Career Evidence entry.

## B6 contract — SIGNED

Gemini is primary, Ollama fallback, both untrusted until the same application-owned validator accepts a bounded result. Retry/deadline/cost chains are finite and provider outage cannot fabricate completion.

## B7 contract — SIGNED

Opportunity Space and market intelligence extend the trusted core without contaminating candidate truth. Market observations retain source/provenance/history and remain distinguishable from candidate evidence and derived recommendations.

## B8 contract — SIGNED AND CLOSED

Production qualification for the prior trusted-core scope required identified-runtime evidence: browser E2E, security regression, fault injection, backup/restore, export/delete, provider runtime and deployment receipts.

Closure receipt: `docs/build/B8-CLOSURE.md`.

## B9 contract — SIGNED, IMPLEMENTATION NOT STARTED

Authority: `docs/build/B9-PRESENTATION-ENGINE-CONTRACT.md`.

B9 exists because real-CV dogfood exposed a valid product-scope gap after B8: proving candidate truth and deterministically projecting it is not the same as converting that truth into the strongest professional presentation the product can safely support.

Signed B9 invariants:

```text
CareerEvidence        = WHAT IS TRUE
PresentationRevision  = HOW AN APPROVED FACT MAY BE EXPRESSED
ResumePlan            = WHAT IS SELECTED / ORDERED / EMPHASIZED
ResumeArtifact        = FINAL RENDERED PRESENTATION
```

B9 additionally signs:

- Career Evidence must never be rewritten merely to improve presentation;
- AI wording is a proposal, never truth authority;
- material wording changes require application-owned validation;
- no proposal is approved by default;
- before/after review must be explicit;
- approved presentation is bound to an exact evidence ID + revision + source hash;
- fabricated/changed metrics, skills, employers, titles, dates, seniority, ownership or scope are rejection conditions;
- Job Truth may influence relevance and emphasis but can never become candidate evidence;
- professional summaries require source provenance for every factual component;
- final assembly remains application-owned/deterministic after approved inputs are chosen;
- v1 final artifacts must include DOCX, PDF, TXT and provenance JSON;
- DOCX/PDF/TXT must derive from the same canonical ResumeArtifact semantics;
- public fixtures must be synthetic; real-CV dogfood/PII must not be committed to the public repository;
- provider failure degrades to source-preserving output rather than false completion;
- the commercial claim `upload CV → improved application-ready CV` is forbidden until B9 is CLOSED.

## Accepted product-scope revision

The explicit product revision accepted after private real-CV comparison is:

> CV Engine must not limit itself to demonstrating what is true about a candidate. It must convert that truth into the best professional presentation it can support without losing the ability to prove that the presentation remains true.

This is a versioned downstream scope extension, not evidence that B1–B8 contracts were invalid.

## Final engineering sign-off

The architecture is coherent enough to construct B9 without reopening upstream truth authority.

The only valid reasons to reopen a signed contract are:

1. executable evidence proves the contract impossible/unsafe/internally inconsistent;
2. a provider/platform fact materially changes;
3. an explicit product-scope revision is accepted and versioned.

Current ledger:

```text
CONTRACTS = SIGNED
B0..B8   = CLOSED
B9       = SIGNED_IMPLEMENTATION_NOT_STARTED
CONSTRUCTION = CONTINUE
RELEASE_READY = NO
PRODUCTION_QUALIFIED = NO
```
