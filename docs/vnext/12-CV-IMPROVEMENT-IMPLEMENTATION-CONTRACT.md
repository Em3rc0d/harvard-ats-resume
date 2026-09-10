# CV Engine v1.2 — CV Improvement Implementation Contract

Status: **AUTHORITATIVE IMPLEMENTATION READINESS CONTRACT**  
Depends on: `11-CANDIDATE-SOURCE-AUTHORITY-AND-AI-TRANSFORMATION.md`  
Code status: **NOT YET IMPLEMENTED**  
Build authorization: **AUTHORIZED ONLY AFTER THIS DOCUMENT IS MERGED**

## 0. Purpose

Contract 11 corrected the product truth boundary:

> **Believe the user's source. Distrust the AI's additions.**

This document closes the ten implementation nodes required before re-coding. Its purpose is to make the next implementation narrow, incremental and testable instead of rewriting CV Engine around symptoms.

The target primary product behavior is:

```text
UPLOAD CV
  ↓
UNDERSTAND WHOLE CV
  ↓
IMPROVE WHOLE CV
  ↓
FACT-GUARD AGAINST SOURCE
  ↓
REPAIR UNSUPPORTED ADDITIONS
  ↓
SHOW RESULT
  ↓
DOWNLOAD DOCX / PDF
```

Existing Career Target, Job Truth, Assessment, Market Intelligence, Opportunity Space, Resume Plan, Presentation Revision and Resume Artifact capabilities remain. They do not gate the primary improvement path.

---

# 1. CLOSED NODE — Exact source-authority semantics

## Decision

Do **not** overload the current `verificationStatus` field with source authority.

Current storage has:

```text
source:
  MANUAL
  IMPORTED_RESUME
  IMPORTED_CERTIFICATE
  USER_CONFIRMED
  SYSTEM_DERIVED_DETERMINISTIC

verificationStatus:
  UNVERIFIED
  NEEDS_REVIEW
  VERIFIED
```

These already represent two different concerns imperfectly:

- `source` describes origin;
- `verificationStatus` describes candidate review/defensibility state.

Neither is external verification proof.

### Canonical authority derivation for v1.2

```text
MANUAL                  → USER_ASSERTED
IMPORTED_RESUME         → USER_ASSERTED
IMPORTED_CERTIFICATE    → USER_ASSERTED
USER_CONFIRMED          → USER_ASSERTED
SYSTEM_DERIVED_DETERMINISTIC → DERIVED_NOT_CANDIDATE_AUTHORITY
```

A candidate-controlled upload is an assertion by the candidate because the candidate supplied the source document.

### Verification semantics remain

```text
UNVERIFIED   = candidate assertion not explicitly reviewed in CV Engine
NEEDS_REVIEW = candidate assertion surfaced for candidate attention
VERIFIED     = candidate explicitly marked it defensible / confirmed
```

`VERIFIED` MUST NOT be presented as `EXTERNALLY_VERIFIED`.

External verification, if introduced later, requires its own provenance mechanism. It is out of scope for the primary v1.2 CV improvement path.

### Transformation eligibility

```text
USER_ASSERTED + UNVERIFIED   → eligible for CV improvement
USER_ASSERTED + NEEDS_REVIEW → eligible for CV improvement unless a material conflict exists
USER_ASSERTED + VERIFIED     → eligible for CV improvement
DERIVED_NOT_CANDIDATE_AUTHORITY → cannot independently create a candidate claim
```

### P0 invariant

```text
NOT EXTERNALLY VERIFIED != FALSE
NOT EXTERNALLY VERIFIED != BLOCKED
```

**Node 1: CLOSED.**

---

# 2. CLOSED NODE — Compatibility with CareerEvidence and TruthClass

## Decision

Do not add a new top-level `TruthClass` for `USER_ASSERTED`.

Current truth classes remain valid:

```text
CANDIDATE_FACT
MARKET_FACT
INTENT
DERIVED_ANALYSIS
PRESENTATION
```

`USER_ASSERTED` is an **authority/provenance dimension within `CANDIDATE_FACT`**, not a new truth universe.

### Resulting model

```text
TruthClass = CANDIDATE_FACT
Authority  = USER_ASSERTED
Review     = UNVERIFIED | NEEDS_REVIEW | VERIFIED
Source     = MANUAL | IMPORTED_RESUME | ...
```

No migration is required merely to adopt this semantic correction.

### Existing CareerEvidence remains durable authority

CareerEvidence is not deleted or replaced. The new primary workflow may populate it in the background from candidate-authored source material without forcing claim-by-claim confirmation first.

### Compatibility rule

Existing rows remain valid exactly as stored.

No historical `UNVERIFIED` or `NEEDS_REVIEW` row is rewritten in place.

### Resume-generation gate correction

Any current application/domain code that assumes only `VERIFIED` evidence may drive a general CV must be revised narrowly so that candidate-authored `USER_ASSERTED` source can drive an improvement draft.

That does **not** imply every downstream feature must immediately accept every unreviewed row. Features that explicitly promise externally confirmed evidence may retain stricter requirements.

**Node 2: CLOSED.**

---

# 3. CLOSED NODE — Full-document semantic model

## Decision

Mechanical lines remain provenance leaves. They are not the main semantic model.

Introduce an application/domain-level `CandidateResumeDocument` model whose source is one `ImportReceipt` plus its mechanical proposals.

### Required shape

```text
CandidateResumeDocument
  id
  ownerUserId
  sourceReceiptId
  sourceDocumentSha256
  locale
  identity
    displayName?
    headline?
    location?
    email?
    phone?
    links[]
  profile?
  employment[]
  projects[]
  education[]
  certifications[]
  skillGroups[]
  languages[]
  otherSections[]
  provenanceIndex
```

Each semantic entity must contain source references:

```text
sourceRefs[] = {
  proposalId,
  ordinal,
  sourceLine,
  sourceTextSha256
}
```

No semantic field may exist without at least one source ref unless the field is explicitly classified as derived presentation metadata.

### Entity example

```text
EmploymentEntity
  role
  organization
  startDateText?
  endDateText?
  location?
  summary?
  bullets[]
  technologies[]
  sourceRefs[]
```

The same principle applies to Project, Education, Certification, SkillGroup and Language entities.

### Important constraint

Do not force every line into a CareerEvidence row before the editor can work.

The semantic document is the editor input. CareerEvidence is a durable career knowledge projection that may be populated from it.

### Persistence decision

For v1.2, the semantic document should be persisted as part of a new **Resume Improvement Run** record rather than replacing `import_review_structures` or rewriting B5 history.

Reason:

- v1.1 review structures remain auditable historical receipts;
- a v1.2 semantic document has different meaning and lifecycle;
- a separate additive record avoids corrupting old schemas.

**Node 3: CLOSED.**

---

# 4. CLOSED NODE — Editor vs Guardian capability split

## Decision

Create two explicit AI/application capabilities instead of expanding `RESUME_IMPORT_FRAGMENT` into everything.

### Capability A — `RESUME_HOLISTIC_IMPROVEMENT`

Purpose:

- rewrite the complete CV;
- improve clarity, structure, ATS readability and professional positioning;
- preserve candidate-provided facts;
- optionally tailor emphasis when a job description is explicitly supplied.

Primary quality route:

```text
Gemini quality-capable model
→ fallback quality-capable Gemini model
→ qualified Ollama model if available
```

Do not default this capability to the cheapest classification model merely because it is inexpensive.

Model selection must be benchmarked against the real-CV acceptance harness before freezing the exact route.

### Capability B — `RESUME_FACT_GUARD`

Purpose:

- compare generated draft against candidate-authoritative source;
- classify transformations;
- detect unsupported facts/metrics/dates/roles/skills;
- return machine-readable findings.

The Guardian is a validation capability, not an editor.

### Guardian classes

```text
SOURCE_PRESERVED
SAFE_REPHRASE
SAFE_RESTRUCTURE
SOURCE_OMISSION
POSSIBLE_NEW_CLAIM
UNSUPPORTED_NEW_CLAIM
SOURCE_CONFLICT
```

### Application-owned final authority

Provider output is never sufficient by itself.

```text
Editor provider success
!= accepted resume

Guardian provider success
!= accepted resume

Application reconciliation
= acceptance authority
```

### Reuse

Keep the existing AI gateway, BYOK handling, provider economics, deadlines and provenance. Add capabilities; do not create a second AI stack.

**Node 4: CLOSED.**

---

# 5. CLOSED NODE — Provider structured-output contract

## Decision

Stop relying on prompt-only JSON for machine-critical semantic structures when the provider supports structured output.

### Semantic understanding output

The document-understanding step must use a schema-constrained provider output where supported.

Required top-level output:

```text
{
  locale,
  identity,
  profile,
  employment,
  projects,
  education,
  certifications,
  skillGroups,
  languages,
  otherSections,
  unassignedSourceOrdinals
}
```

Every semantic item references only known source ordinals/IDs.

### Editor output

The holistic editor returns a structured resume document, not arbitrary markdown.

Example sections:

```text
{
  header,
  summary,
  experience[],
  projects[],
  education[],
  certifications[],
  skills[],
  languages[]
}
```

Each generated unit must include source entity/source ref linkage.

### Guardian output

The Guardian returns findings with bounded enums and source/generated spans.

### Validation layers

```text
Provider JSON schema
  ↓
Zod/domain parse
  ↓
referential validation
  ↓
source coverage validation
  ↓
fact guardian
```

### No all-or-nothing prompt parser

One malformed optional field must not automatically destroy every otherwise valid entity.

**Node 5: CLOSED.**

---

# 6. CLOSED NODE — Partial recovery strategy

## Decision

Use **section/entity-level recovery**, not whole-document discard.

### Semantic understanding

If one entity is malformed:

1. retain valid entities;
2. return malformed source refs to `unassignedSourceOrdinals`;
3. retry only unresolved material within the attempt budget;
4. if still unresolved, preserve the original text conservatively.

### Editor

If one rewritten section fails validation:

- keep valid improved sections;
- restore the original source-faithful section for the failing part;
- mark the result `PARTIALLY_IMPROVED`, not failed as a whole.

### Guardian

For `UNSUPPORTED_NEW_CLAIM`:

1. attempt deterministic removal/reversion to source-supported text;
2. re-run bounded guard on repaired unit when budget allows;
3. fall back to original wording for that unit;
4. ask user only if safe conservative recovery is impossible and the unresolved ambiguity materially changes meaning.

### Product statuses

```text
IMPROVED
PARTIALLY_IMPROVED
ORIGINAL_PRESERVED_AI_UNAVAILABLE
FAILED_SOURCE_UNREADABLE
```

Do not label output-validation failure as provider unavailable.

### Failure taxonomy remains distinct

```text
PROVIDER_UNAVAILABLE
PROVIDER_TIMEOUT
PROVIDER_RESPONDED_OUTPUT_INVALID
SEMANTIC_REFERENCE_INVALID
FACT_GUARD_REJECTED
SOURCE_UNREADABLE
```

**Node 6: CLOSED.**

---

# 7. CLOSED NODE — User-facing primary workflow

## Decision

The primary product surface is task-oriented, not bounded-context-oriented.

### Default landing action after authentication

```text
Improve your resume

[Upload PDF/DOCX]
Optional: [Paste job description]
```

### Golden path

```text
1. Upload
2. Analyze + improve automatically
3. Show final improved resume
4. Show concise quality/safety summary
5. Download DOCX / PDF
```

### Default result UI

Show:

```text
Your improved resume is ready

Changes made
- clearer summary
- stronger action wording
- redundant content consolidated
- ATS-friendly section structure

Unsupported new claims: 0

[Download DOCX]
[Download PDF]
[Review changes]
```

### Progressive disclosure

`Review changes` may show source vs improved passages.

`Advanced / Audit` may show:

- source lines;
- hashes;
- provenance;
- semantic entity IDs;
- AI provider/model receipts;
- guardian findings.

### What is removed from the primary flow

The user is not required to operate:

- Career Evidence enums;
- line grouping;
- `NEEDS_REVIEW` mechanics;
- TruthClass terminology;
- ResumePlan IDs;
- PresentationRevision IDs;
- ResumeArtifact internal names;
- Market Intelligence;
- Opportunity Space;
- claim-by-claim verification.

### Navigation direction

The long-term shell should converge toward user goals such as:

```text
Home
My Career
Jobs
Resume
```

However, v1.2 implementation must prioritize the **Improve CV** golden path before a global navigation rewrite. Avoid expanding scope unnecessarily.

**Node 7: CLOSED.**

---

# 8. CLOSED NODE — Migration and backward compatibility

## Decision

Use an additive migration. Do not rewrite existing CareerEvidence, ImportReceipt, ImportReviewStructure, PresentationRevision, ResumePlan or ResumeArtifact rows.

### New durable concept

Introduce a `resume_improvement_runs` authority with an immutable lineage:

```text
ResumeImprovementRun
  id
  ownerUserId
  sourceReceiptId
  sourceSha256
  semanticDocumentJson
  semanticDocumentSha256
  editorProvenanceJson
  generatedDocumentJson
  generatedDocumentSha256
  guardianReportJson
  guardianReportSha256
  status
  targetJobSnapshotId? / targetTextHash?
  createdAt
```

Exact physical normalization may split large JSON payloads into child tables if DB limits/advisors justify it, but the logical authority above is frozen.

### RLS/lifecycle

The new persistence must:

- be owner-scoped by `auth.uid()`;
- be immutable after terminal completion except a bounded state transition if needed;
- participate in account export;
- participate in account deletion;
- never store BYOK keys;
- never store raw uploaded file bytes durably unless separately authorized.

### Existing v1.1 import records

They remain historical and readable.

A v1.1 `import_review_structure` does not automatically become a v1.2 semantic document.

Re-running improvement from an old source creates a new v1.2 improvement run.

### No destructive rename in v1.2

Keep existing `UNVERIFIED/NEEDS_REVIEW/VERIFIED` database enum/check semantics for compatibility. Correct UI/product interpretation first.

**Node 8: CLOSED.**

---

# 9. CLOSED NODE — Real-CV golden acceptance harness

## Decision

A synthetic happy path is insufficient for v1.2 qualification.

The existing private real-world corpus methodology becomes a release input for the new CV-improvement capability.

### Required private golden case

At least one real candidate CV equivalent in complexity to the dogfood CV that triggered Contract 11 must be included outside Git.

It must cover:

- Spanish content;
- professional profile;
- employment;
- multiple engineering projects;
- dense technology lists;
- education;
- certifications;
- languages;
- candidate assertions without external evidence.

### Golden assertions

For each accepted run:

```text
source parses successfully
semantic entities are materially correct
candidate-provided claims remain usable
output is materially improved
unsupported new claims = 0
invented metrics = 0
invented employers/roles/dates = 0
valid DOCX generated
valid PDF generated
source→output provenance is present
```

### Quality comparison

The harness must compare the generated result against a human-reviewed reference outcome using a rubric, not exact wording equality.

Rubric dimensions:

```text
FACTUAL_FIDELITY
ATS_STRUCTURE
CLARITY
CONCISION
PROFESSIONAL_POSITIONING
REDUNDANCY_REDUCTION
READABILITY
DOWNLOAD_VALIDITY
```

Each dimension must have a deterministic or human-reviewed threshold.

### Required negative fixtures

- editor invents a metric → guardian must block/repair;
- editor invents a technology → block/repair;
- malformed structured output → partial recovery;
- provider unavailable → original preserved with truthful status;
- conflicting two-CV role/date sources → precedence/conservative handling;
- image-only/unreadable input → safe refusal.

### Release principle

```text
B9 GREEN + REAL-CV QUALITY FAIL = RELEASE BLOCKED
```

**Node 9: CLOSED.**

---

# 10. CLOSED NODE — Release and re-certification scope

## Decision

Any code implementing this contract changes the primary product behavior and therefore requires full re-certification on the exact Production SHA.

### CI minimum

All existing B1–B9/vNext gates remain required.

Add dedicated v1.2 gates for:

```text
semantic document contracts
editor contracts
fact guardian contracts
partial recovery
source-authority eligibility
resume improvement persistence/RLS
DOCX/PDF generation from improvement run
real-CV private acceptance receipt
```

### Production browser golden path

B9 must be extended or complemented by a new production-browser check:

```text
signup/login
→ upload representative CV
→ receive improved CV
→ guardian reports 0 unsupported claims
→ download DOCX/PDF
→ reload historical result
→ account export includes improvement run
→ account delete removes improvement run
→ post-delete session denied
```

### Exact SHA rule

```text
CI HEAD SHA
=
Production build-info SHA
=
certified browser receipt SHA
```

### Release status vocabulary

Do not call v1.2 `PRODUCT QUALIFIED` unless both are true:

```text
ENGINEERING_CERTIFIED = true
REAL_CV_PRODUCT_QUALITY_ACCEPTED = true
```

### No inheritance

The v1.1 B9 qualification does not qualify v1.2 code.

**Node 10: CLOSED.**

---

# 11. Implementation dependency graph

All design nodes are now closed. Build order is intentionally small and additive:

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

No Market Intelligence, scraping, job discovery, global navigation rewrite or external verification work is required to close this path.

---

# 12. Explicit non-rewrites

The implementation should preserve and reuse:

- Supabase Auth;
- PostgreSQL/RLS ownership model;
- existing CareerEvidence history;
- TruthClass separation;
- ImportReceipt/mechanical extractor provenance;
- AI gateway and BYOK secret handling;
- provider economics/budgets;
- Career Target and Job Truth boundaries;
- Assessment/Opportunity Space;
- ResumeProfile where useful;
- ResumePlan where useful internally;
- PresentationRevision history where compatible;
- ResumeArtifact rendering/export infrastructure;
- account export/delete lifecycle;
- exact-SHA B9 certification model.

Avoid rewriting these unless executable evidence during implementation proves an incompatibility.

---

# 13. Definition of implementation success

The product succeeds when a user can do this:

```text
I upload my current CV.
I do not classify lines.
I do not prove my biography.
I do not understand the Truth Graph.
I do not configure market intelligence.

CV Engine understands my CV,
rewrites it strongly,
checks that the AI did not invent a different career,
and gives me a downloadable improved CV.
```

The internal system may still use the complete architecture underneath.

The user should experience the outcome, not the machinery.

---

# 14. Build authorization

With Nodes 1–10 closed by this document, implementation becomes authorized **after this contract is reviewed, CI-clean and merged to `main`**.

The implementation must follow I1→I10 unless a dependency conflict is proven and documented.

No implementation PR may weaken Contract 11's governing rule:

> **Believe the user's source. Distrust the AI's additions.**

And no implementation PR may claim success unless the resulting product can satisfy:

> **Improve the candidate's story without writing a different story.**
