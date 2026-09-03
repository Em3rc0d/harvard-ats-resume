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
Career Evidence       candidate authority / what is true
Job Snapshot          market truth
Career Target         intent
Assessment            derived analysis
PresentationPlan      contextual selection / ordering / emphasis
PresentationRevision  how verified truth is expressed
ResumeVersion         deterministic compiled projection
AI output             bounded proposal
```

No downstream node may collapse these boundaries into one generic resume-data authority.

The product must optimize both sides of the core equation:

```text
PROFESSIONAL_STRENGTH
AND
DEFENSIBLE_TRUTH
```

Optimizing one by weakening the other is a product failure.

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
- B6/B8 must physically certify the complete provider path before release.

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
- approved PresentationRevisions referenced by historical ResumeVersions are immutable;
- PresentationRevision is not an alternate Career Evidence authority;
- historical snapshots/ResumeVersions are immutable when committed as historical artifacts;
- trusted mutations are atomic;
- optimistic concurrency prevents silent overwrite;
- source uploads are ephemeral/private by default;
- export/delete and restore evidence are release gates.

## Runtime/deployment contract — SIGNED

Signed target topology:

```text
Next.js 16 / Vercel
Supabase Auth + PostgreSQL + private temporary storage
Gemini primary AI
Ollama qualified fallback where available
Upstash optional operational accelerator
```

A topology contract does not qualify a deployment. B8 must identify the actual runtime and prove the production claims.

## AI quota/cost/abuse contract — SIGNED

Signed invariants:

- capability-owned attempt budgets;
- maximum two Gemini attempts and one Ollama attempt before benchmark-driven revision;
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

Assessment must expose evidence-backed states:

```text
MATCH
POTENTIAL_MATCH
GAP
UNKNOWN
BLOCKER
```

`UNKNOWN` is never silently scored as a pass. Explanations must identify supporting assertions/evidence or explicitly state the absence of support. Hiring probability theater is forbidden.

## B4 contract — SIGNED

Trusted ResumeVersion creation is deterministic/application-owned, immutable after creation, provenance-bearing and transactional.

B4's exact-source-text composition remains a valid safe baseline. It is not the final P1 presentation model.

## B5 contract — SIGNED

Import is convenience. Mechanical extraction and deterministic source boundaries precede AI. Unsupported/ambiguous facts are never accepted as candidate truth. Failure degrades to manual Career Evidence entry.

## B6 contract — SIGNED

Gemini is primary, Ollama fallback, both untrusted until the same application-owned validator accepts the bounded result. Retry/deadline/cost chains are finite and provider outage cannot fabricate completion.

`INLINE_WORDING_OPTIMIZATION` is a bounded proposal capability, not presentation authority.

## B7 contract — SIGNED

Opportunity Space and market intelligence extend the trusted core without contaminating candidate truth. Market observations retain source/provenance/history and remain distinguishable from candidate evidence and derived recommendations.

## P1 contract — SIGNED / IMPLEMENTATION AUTHORIZED

Authority: `docs/vnext/05-TRUTH-PRESERVING-PRESENTATION.md`.

Signed product principle:

> CV Engine must convert defensible career truth into the strongest professional presentation possible for a context, while preserving the ability to demonstrate why every resulting claim remains defensible.

Signed invariants:

- Career Evidence remains the truth authority;
- PresentationPlan owns selection, ordering, grouping and emphasis only;
- PresentationRevision owns expression, not truth;
- a Job Description may influence prioritization/terminology but cannot create candidate facts;
- no unsupported metric, skill, employer, date, title, outcome, scope, ownership or seniority may be introduced;
- presentation may not silently strengthen epistemic force;
- every rendered trusted claim maps to exact verified evidence ID/revision/hash;
- synthesized summary sentences retain multi-evidence provenance;
- AI may propose but may not approve;
- meaningful presentation changes require explicit user approval;
- approved revisions referenced by historical ResumeVersions are immutable;
- final ResumeVersion assembly remains deterministic;
- DOCX/PDF/TXT/provenance JSON must derive from the same semantic ResumeVersion;
- cross-format claim text/order must not silently diverge;
- no-cloud/AI-outage paths degrade to deterministic/manual source-preserving presentation;
- CV Engine does not claim mathematical semantic-equivalence proof for arbitrary natural-language paraphrases;
- CV Engine may claim traceable lineage only when validation, approval and provenance receipts exist.

P1 is release-blocking for CVENGINE_V1_0_0.

## B8 contract — SIGNED

Production qualification requires identified-runtime evidence: browser E2E, security regression, fault injection, backup/restore, export/delete, provider fallback, secret canary, performance/capacity and deployment receipts.

Final B8 certification additionally requires P1 presentation/export regressions and identified-runtime export evidence.

## Final engineering sign-off

The architecture and product contracts are coherent enough to continue construction with P1 as the active product node.

The only valid reasons to reopen a signed contract are:

1. executable evidence proves the contract impossible/unsafe/internally inconsistent;
2. a provider/platform fact materially changes;
3. an explicit product-scope revision is accepted and versioned.

The current P1 addition is an explicit product-scope revision under rule 3. It does not erase prior closure evidence; it adds a new release requirement.

```text
CONTRACTS = SIGNED
ACTIVE_PRODUCT_NODE = P1
CONSTRUCTION = CONTINUE
RELEASE_READY = NO
```
