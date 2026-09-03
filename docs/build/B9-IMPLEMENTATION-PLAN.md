# CV Engine — B9 Presentation Engine Implementation Plan v1.0

Status: **EXECUTION PLAN — CONTRACT ALREADY SIGNED**

Authority: `docs/build/B9-PRESENTATION-ENGINE-CONTRACT.md`

## 1. Construction strategy

B9 is built as downstream presentation infrastructure. No B1–B4 truth invariant is weakened.

Construction order:

```text
B9.1 PresentationRevision domain + persistence
  ↓
B9.2 Fact-preservation validator + AI wording wiring
  ↓
B9.3 Before/after review + approval UX
  ↓
B9.4 ResumePlan + editorial composition
  ↓
B9.5 Canonical ResumeArtifact + DOCX/PDF/TXT/provenance renderers
  ↓
B9.6 Full certification + private real-CV dogfood
```

Each subnode must pass inherited gates before the next subnode becomes authoritative.

## 2. B9.1 — PresentationRevision domain + persistence

### Domain

Create:

- `src/domain/presentation/PresentationRevision.ts`
- `src/application/presentation/PresentationRevisionRepository.ts`
- static contract tests
- physical DB tests

### Persistence

Add `presentation_revisions` with immutable source/proposal identity and constrained status transition.

Required columns:

```text
id
owner_user_id
evidence_id
evidence_revision
source_text_sha256
proposed_text
proposed_text_sha256
capability
provider
model
provider_request_id
validator_version
validation_result jsonb
status PROPOSED|APPROVED|REJECTED
created_at
resolved_at
```

Required FK:

```text
(evidence_id, evidence_revision, owner_user_id)
→ career_evidence_revisions(evidence_id, revision_number, owner_user_id)
```

Direct authenticated writes are denied. Mutations occur through owner-bound SECURITY DEFINER RPCs with safe `search_path=''`.

RPCs:

```text
cv_engine_record_presentation_proposal(...)
cv_engine_resolve_presentation_revision(p_revision_id, p_decision)
```

`record` must verify:

- authenticated owner;
- source evidence revision exists and is `VERIFIED`;
- source hash matches exact canonical source text;
- proposal hash matches exact proposal text;
- validation result is accepted by the server contract before durable proposal creation;
- provider provenance contains no secret.

`resolve` permits only:

```text
PROPOSED → APPROVED
PROPOSED → REJECTED
```

Terminal rows are immutable.

## 3. B9.2 — Fact-preservation validator + AI wiring

### AI path

Physically wire B6 capability `INLINE_WORDING_OPTIMIZATION` from Career Evidence UI.

Input envelope contains only:

```text
evidence ID
revision
kind
canonical text
bounded presentation objective
```

The provider never receives unrelated Career Vault content for a single-item rewrite.

### Validator layers

Validation is application-owned and conservative.

#### Layer A — deterministic protected-token checks

Reject at minimum:

- number introduced;
- number changed;
- percentage/currency introduced or changed;
- date/year introduced or changed;
- negation polarity change;
- URL/email/phone mutation when present;
- new obvious technology/product token not present in source;
- prohibited strengthening verbs/titles when unsupported by source.

#### Layer B — structured fact comparison

Bounded model assistance may extract candidate propositions from source/proposal into a typed structure, but model output remains untrusted.

Application compares source vs proposal propositions and rejects when proposal introduces unsupported factual dimensions.

#### Layer C — user review

A passing validator result does not auto-approve wording. The user remains final presentation approver.

Validator output:

```text
PASS
or
REJECT + [reason codes]
```

No opaque numeric truth score.

## 4. B9.3 — Approval UX

Career Evidence cards gain `Improve wording` only when:

- current evidence revision is VERIFIED;
- AI mode supports the capability.

No-cloud mode exposes source-preserving resume construction without a misleading AI button.

Review surface shows:

```text
Original
Proposed
Validation result
Provider/model provenance
Approve
Reject
Try another proposal
Use original wording
```

Approval is never default-selected.

Reload must restore durable approved/rejected decisions.

Editing Career Evidence creates a new evidence revision and does not silently rebind prior PresentationRevision records.

## 5. B9.4 — ResumePlan + editorial composition

### New domain

```text
ResumePlan
- id
- ownerUserId
- mode GENERAL|TARGETED
- jobSnapshotId?
- opportunityAssessmentId?
- plannerVersion
- semanticKey
- sections[]
- sourceReceipts[]
- createdAt
```

Each selected item records:

```text
evidenceId
evidenceRevision
evidenceTextSha256
presentationRevisionId?  # null means source wording
presentationTextSha256
section
ordinal
```

### Planner responsibilities

- choose eligible content;
- prefer approved presentation wording when source binding matches;
- preserve deterministic fallback to canonical evidence text;
- section assignment;
- ordering;
- targeted relevance filtering from deterministic assessment;
- professional-summary composition only from source-backed facts;
- density/page policy.

### Initial deterministic section order

```text
PROFILE
EXPERIENCE
PROJECTS
EDUCATION
CERTIFICATIONS
SKILLS
LANGUAGES
```

Sections with no selected content are omitted.

### Early-career density policy

Target one page where safely achievable through selection/conciseness. Never distort truth to satisfy page count.

## 6. B9.5 — Canonical ResumeArtifact + renderers

### Canonical artifact

Create an immutable application-owned model independent of output format:

```text
ResumeArtifact
- identity / owner / mode
- source ResumePlan
- profile/header
- ordered semantic sections
- provenance manifest
- artifact semantic hash
- renderer contract version
```

All formats consume this exact model.

### DOCX renderer

Use a pure Node renderer suitable for Vercel serverless.

Policy:

- one column;
- conservative margins;
- semantic headings;
- standard readable font family;
- selectable text;
- hyperlinks preserved;
- no tables for primary reading order unless proven ATS-safe by fixtures;
- no text boxes for critical content.

### PDF renderer

Use a pure Node text PDF renderer suitable for Vercel serverless; do not depend on desktop LibreOffice or a hidden browser runtime.

Policy:

- same canonical artifact as DOCX;
- selectable text;
- deterministic wrapping/page breaks;
- standard embedded/core fonts;
- no rasterized body.

### TXT and provenance

TXT remains a semantic fallback.

Provenance JSON adds:

- exact evidence revisions;
- chosen PresentationRevision IDs;
- source/proposal hashes;
- planner/renderer versions;
- targeted Job/Assessment binding where applicable.

## 7. API surface

Planned API boundaries:

```text
POST /api/presentation/evidence/:id/proposals
GET  /api/presentation/evidence/:id/proposals
POST /api/presentation/revisions/:id/resolve

POST /api/resume-plans
GET  /api/resume-plans
GET  /api/resume-plans/:id

POST /api/resume-artifacts
GET  /api/resume-artifacts
GET  /api/resume-artifacts/:id
GET  /api/resume-artifacts/:id/export?format=docx|pdf|text|json
```

Every durable route is authenticated and owner-bound.

## 8. Account lifecycle integration

B9 durable state must be included in account export/delete before B9 can close:

```text
presentation_revisions
resume_plans
resume_artifacts
artifact/plan claim receipts
```

Deletion order must respect FK dependencies and delete user-owned B9 state before `auth.users`.

## 9. Security gates

Required physical gates:

- RLS own-user select;
- cross-user IDOR denial;
- anonymous RPC denial;
- direct table write denial;
- immutable stable fields;
- terminal transition denial;
- source revision mismatch denial;
- source hash mismatch denial;
- proposal hash mismatch denial;
- stale source revision never silently rebound;
- provider secret canary absent from DB/logs/provenance.

## 10. Rendering acceptance fixtures

Public repository fixtures must be synthetic.

At minimum:

1. early-career developer, one-page target;
2. experienced engineer, two-page allowed;
3. CV with long URLs/contact data;
4. CV with unicode/Spanish accents;
5. CV with multiple certifications/projects;
6. targeted resume with explicit GAP/UNKNOWN items that must not leak into candidate claims;
7. no-cloud artifact with source wording only.

Private real-CV dogfood uses user-owned material outside the public repository.

## 11. Golden comparison rule

A golden fixture is not evaluated by asking an LLM "is this better?".

Acceptance combines:

- truth-preservation invariants;
- deterministic structural expectations;
- expected content inclusion/omission;
- expected section order;
- expected page-count envelope where applicable;
- readable/valid DOCX;
- text-selectable/readable PDF;
- provenance completeness;
- human product review for professional usefulness.

## 12. CI progression

Add a dedicated B9 workflow after the first executable subnode exists.

Expected progression:

```text
B9.1 domain + migration + DB gates
B9.2 validator + AI fixture gates
B9.3 UI contract + browser component behavior
B9.4 planning fixtures
B9.5 binary artifact structural/readback tests
B9.6 production browser E2E + private dogfood receipt
```

All inherited B0–B8 gates remain required.

## 13. Production cutover rule

Do not change Production merely because a B9 subnode compiles.

Promotion requires a candidate containing the complete B9 golden path. Final documentation commits that change the release SHA must themselves rerun exact-head CI and identified-runtime smoke.

## 14. Definition of implementation start

Implementation may begin when this plan and the B9 contract are committed together with the canonical graph showing B9 as the active blocker.

That condition is satisfied on branch `build/cv-engine-vnext-b9-presentation-engine` once this document is committed.
