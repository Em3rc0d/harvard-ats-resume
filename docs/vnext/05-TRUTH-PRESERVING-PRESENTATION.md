# CV Engine — P1 Truth-Preserving Professional Presentation Contract v1.0

Status: **SIGNED / IMPLEMENTATION AUTHORIZED**

## 1. Product principle

CV Engine must not stop at proving what is true about a person.

> CV Engine must convert defensible career truth into the strongest professional presentation possible for a context, while preserving the ability to demonstrate why every resulting claim remains defensible.

The durable asset remains the career.

```text
THE CAREER IS THE ASSET.
THE RESUME IS A PROJECTION.
THE PRESENTATION IS OPTIMIZED.
THE PROOF MUST SURVIVE THE OPTIMIZATION.
```

This contract closes a product gap in the current B4 implementation: exact source-text preservation is safe but too restrictive to produce a genuinely strong professional resume.

## 2. Core separation

```text
CareerEvidence
  = WHAT IS TRUE

PresentationRevision
  = HOW VERIFIED TRUTH IS EXPRESSED

PresentationPlan
  = WHAT IS SELECTED, ORDERED, GROUPED AND EMPHASIZED FOR A CONTEXT

ResumeClaim
  = AN APPROVED PRESENTATION OF ONE OR MORE EVIDENCE SOURCES

ResumeVersion
  = DETERMINISTIC COMPILED ARTIFACT

Provenance
  = WHY THE ARTIFACT IS DEFENSIBLE
```

These authorities may not collapse into one generic resume blob.

Career Evidence remains candidate truth. PresentationRevision is not allowed to become a second truth store.

## 3. Product objective

Presentation optimization should maximize, subject to truth constraints:

1. relevance to the target opportunity;
2. clarity;
3. information density;
4. credibility;
5. professional tone;
6. human scanability;
7. deterministic document consistency;
8. ATS-friendly semantic structure;
9. strength of evidence-backed positioning.

It must never maximize persuasion by weakening truth constraints.

```text
BEST_PRESENTATION =
  argmax(relevance, clarity, density, credibility, scanability, positioning)
  SUBJECT TO truth_preserved == true
```

There is no universal hiring score and no universal ATS compatibility score.

## 4. End-to-end flow

```text
Verified Career Evidence
        ↓
Career / target / job context
        ↓
Evidence selection
        ↓
Presentation Plan
        ↓
Presentation proposal
  ├─ deterministic editorial transform
  ├─ bounded AI proposal
  └─ manual user edit
        ↓
Truth-preserving validation
        ↓
Side-by-side source / proposal / diff
        ↓
Explicit user approval
        ↓
APPROVED PresentationRevision
        ↓
Deterministic ResumeVersion compilation
        ↓
ATS-safe document renderer
        ↓
DOCX / PDF / TXT / provenance JSON
```

If optimization is unavailable, ambiguous or rejected:

```text
fallback = source-preserving canonical presentation
```

The trusted resume path must remain usable without cloud AI.

## 5. What presentation may change

Presentation may change:

- sentence structure;
- grammar;
- active/passive voice;
- concision;
- ordering;
- grouping;
- section placement;
- emphasis;
- terminology when semantically equivalent;
- target-relevant keyword choice when the keyword is already supported by candidate evidence;
- duplication removal;
- summary construction from supported evidence;
- section headings;
- document typography and spacing;
- deterministic layout/template selection.

Presentation may select a subset of verified evidence for a particular ResumeVersion.

Omission is allowed. Fabrication is not.

## 6. What presentation may never create

A PresentationRevision may not introduce unsupported:

- employers;
- job titles;
- dates or durations;
- metrics or quantities;
- compensation;
- projects;
- technologies or skills;
- certifications or credentials;
- responsibilities;
- ownership;
- business impact;
- outcomes;
- scope;
- team size;
- customers;
- geography;
- seniority;
- leadership claims;
- causal claims;
- comparative/superlative claims;
- market facts represented as candidate facts.

A Job Description may influence selection, ordering and vocabulary. It may never backfill missing candidate truth.

```text
JOB_REQUIRES_KUBERNETES
+ CANDIDATE_EVIDENCE_HAS_NO_KUBERNETES
!= RESUME_MAY_SAY_KUBERNETES
```

## 7. Strength monotonicity

Presentation must not silently strengthen the epistemic force of a claim.

Examples of forbidden strengthening:

```text
"assisted with"        → "owned"
"worked on"            → "led"
"familiar with"        → "expert in"
"helped improve"       → "increased by 35%"
"used Java"            → "architected enterprise Java systems"
```

A stronger claim requires stronger Career Evidence, not better copywriting.

## 8. PresentationRevision

Minimum semantic shape:

```text
PresentationRevision
  id
  ownerUserId
  status: PROPOSED | APPROVED | REJECTED
  purpose: CLAIM | SUMMARY | SECTION_HEADING
  sourceEvidenceRefs[]
    evidenceId
    evidenceRevision
    evidenceTextSha256
  sourceText
  proposedText
  transformationTypes[]
  context
    mode: GENERAL | TARGETED
    careerTargetId?
    jobSnapshotId?
    opportunityAssessmentId?
  origin
    DETERMINISTIC | AI_PROPOSAL | USER_EDIT
  aiProvenance?
  validationReceipt
  sourceSha256
  proposedSha256
  approvedByUserAt?
  createdAt
```

PresentationRevision is immutable once APPROVED and referenced by an immutable ResumeVersion.

A user may create a later revision; the historical approved revision must remain reproducible.

## 9. Transformation taxonomy

Initial allowed transformation labels:

```text
GRAMMAR
ACTIVE_VOICE
CONCISION
CLARITY
TERMINOLOGY_ALIGNMENT
KEYWORD_ALIGNMENT
REORDER
GROUP
DEDUPLICATE
SUMMARY_SYNTHESIS
SECTION_SELECTION
SECTION_HEADING
```

The label is provenance metadata, not permission to bypass validation.

## 10. PresentationPlan

PresentationPlan owns contextual editorial decisions without becoming candidate truth.

Minimum responsibilities:

- selected evidence IDs/revisions;
- excluded evidence IDs/revisions;
- section grouping;
- section order;
- claim order;
- target/job context references;
- deterministic tie-break rules;
- optional rationale as derived analysis;
- renderer/template profile.

For a targeted resume, market truth may influence the plan but never the factual contents of a claim.

## 11. ResumeClaim vNext

A ResumeClaim must retain both truth and presentation lineage.

```text
ResumeClaim
  evidenceRefs[]
  evidenceCanonicalText[]
  presentationRevisionId
  renderedText
  evidenceFingerprint
  presentationFingerprint
```

A one-to-many evidence mapping is required for synthesized summary claims.

The old invariant:

```text
renderedText == evidenceCanonicalText
```

must be replaced by:

```text
renderedText == approved PresentationRevision.proposedText
AND
PresentationRevision.sourceEvidenceRefs resolve exactly
AND
all source evidence is VERIFIED
AND
validationReceipt is ACCEPTED
AND
approval is explicit
```

## 12. Validation model

No single validator is allowed to claim semantic omniscience.

Validation is layered and fail-closed.

### Layer 0 — source authority

- every source reference resolves;
- exact evidence revision is preserved;
- source hash matches;
- all candidate evidence used for a trusted claim is VERIFIED;
- Job/Target/Assessment objects remain context, not candidate evidence.

### Layer 1 — deterministic novelty guards

The application must reject or escalate suspicious novelty, including newly introduced:

- numbers;
- percentages;
- dates;
- currencies;
- named organizations;
- explicit technologies/skills not supported by source evidence;
- titles/credentials;
- comparative/superlative language;
- ownership/leadership verbs when not supported.

Deterministic guards are intentionally conservative.

### Layer 2 — bounded semantic validation

AI may assist in detecting semantic strengthening or unsupported additions, but AI is not the final truth authority.

The semantic validator receives only the bounded source evidence, context and proposed text. It must return a structured proposal/result, not free-form authority.

Provider disagreement or validation uncertainty must fail closed to review/canonical text.

### Layer 3 — explicit user approval

The user sees:

```text
SOURCE TRUTH
PROPOSED PRESENTATION
DIFF
EVIDENCE REFERENCES
VALIDATION WARNINGS
```

A proposal does not become an approved presentation silently.

### Layer 4 — compile-time provenance

ResumeVersion compilation rechecks:

- revision identity;
- hashes;
- approval status;
- evidence verification state at referenced revision;
- document/claim cardinality;
- rendered text equality with the approved revision;
- context identity.

## 13. What CV Engine can prove

CV Engine may claim that it can prove:

- which Career Evidence authorized each rendered claim;
- which exact evidence revision/hash was used;
- how the presentation differed from canonical evidence text;
- which transformation path created the proposal;
- which provider/model produced an AI proposal, when applicable;
- which application guards ran;
- whether warnings existed;
- when the user approved the presentation;
- which exact presentation was compiled into a ResumeVersion.

CV Engine must not claim formal mathematical proof that arbitrary natural-language paraphrases are semantically equivalent.

The product guarantee is a **traceable, fail-closed evidence chain**, not semantic theater.

## 14. Summary composition

Professional summaries are allowed, but they are not a provenance escape hatch.

Every summary sentence must map to one or more verified evidence references.

A summary may compress multiple facts, but may not synthesize a new unsupported level of seniority, identity or impact.

Example:

```text
Evidence A: built Spring Boot APIs for project X
Evidence B: built Angular interfaces for project Y

Allowed:
"Full-stack developer with hands-on experience building Spring Boot APIs and Angular interfaces."

Not automatically allowed:
"Senior full-stack architect leading enterprise platforms at scale."
```

## 15. Contextual positioning

For TARGETED presentation:

```text
candidate truth
      +
market truth
      ↓
selection / prioritization / terminology alignment
```

Never:

```text
candidate truth
      +
market requirement
      ↓
new candidate fact
```

The system should preferentially surface the strongest supported evidence relevant to the opportunity.

## 16. Document presentation

Professional presentation includes the rendered document, not only sentence wording.

Initial release renderer contract:

- single-column ATS-safe baseline;
- deterministic section hierarchy;
- deterministic page/spacing rules;
- readable typography;
- no meaning encoded only in color/iconography;
- no hidden text/keyword stuffing;
- no graphical skill bars;
- no fabricated ATS score;
- no universal ATS-compatibility claim;
- same semantic ResumeVersion drives DOCX, PDF, TXT and provenance JSON;
- exports must not silently diverge in claim text/order.

Additional visual templates require their own extraction/regression evidence before release support claims.

## 17. Export contract

Minimum supported outputs for P1 closure:

```text
DOCX
PDF
TXT
provenance JSON
```

The provenance export must include enough information to reconstruct the claim lineage without exposing unnecessary raw private source documents.

DOCX/PDF generation is a deterministic rendering concern. It may not invoke AI.

## 18. User experience

The intended primary experience is:

```text
Upload or enter career history
        ↓
Review truth
        ↓
Choose target / job
        ↓
CV Engine proposes the strongest truthful presentation
        ↓
Review meaningful changes, not every punctuation mark
        ↓
Approve
        ↓
Export professional CV
        ↓
Open proof/provenance when needed
```

The UI should make trust visible without making the product feel like an audit console.

Default view: professional result.

On demand: evidence/provenance depth.

## 19. AI role

`INLINE_WORDING_OPTIMIZATION` becomes an implementation input to P1, not a standalone product claim.

AI may propose presentation.

AI may not approve presentation, create candidate truth, alter source evidence, or compile the final ResumeVersion.

The application owns validation, user approval, compilation and provenance.

No-cloud mode must still support deterministic source-preserving composition and manual presentation edits inside the same validation/approval envelope.

## 20. Failure and degradation

If AI fails:

```text
AI proposal unavailable
→ deterministic/manual presentation remains available
```

If validation fails:

```text
proposal rejected
→ show reason
→ canonical source text remains safe fallback
```

If export rendering fails:

```text
no successful export receipt
→ no claim that export succeeded
```

If provenance cannot be resolved:

```text
ResumeVersion compilation fails closed
```

## 21. P1 release-blocking acceptance predicates

P1 may close only when all are proven:

```text
PRESENTATION_REVISION_DOMAIN             PASS
VERIFIED_EVIDENCE_ONLY                   PASS
NO_JOB_TO_CANDIDATE_TRUTH_PROMOTION      PASS
NO_UNSUPPORTED_METRIC_NOVELTY            PASS
NO_UNSUPPORTED_SKILL_NOVELTY             PASS
NO_UNSUPPORTED_SENIORITY_STRENGTHENING   PASS
MULTI_EVIDENCE_SUMMARY_PROVENANCE        PASS
SIDE_BY_SIDE_DIFF_REVIEW                  PASS
EXPLICIT_USER_APPROVAL                    PASS
APPROVED_REVISION_IMMUTABILITY            PASS
DETERMINISTIC_PRESENTATION_PLAN           PASS
TARGETED_SELECTION_WITHOUT_FACT_MUTATION PASS
RESUMECLAIM_PRESENTATION_PROVENANCE       PASS
RESUMEVERSION_DETERMINISTIC_REPLAY        PASS
AI_OUTAGE_SAFE_DEGRADATION                PASS
DOCX_EXPORT                               PASS
PDF_EXPORT                                PASS
TXT_EXPORT_REGRESSION                     PASS
PROVENANCE_JSON_EXPORT                    PASS
CROSS_FORMAT_CLAIM_CONSISTENCY            PASS
ATS_SAFE_BASELINE_STRUCTURE               PASS
B1_B2_B3_B4_B5_B6_B7_REGRESSION          PASS
REAL_BROWSER_E2E                          PASS
IDENTIFIED_RUNTIME_EXPORT_RECEIPT         PASS
```

## 22. Build graph effect

P1 is a new explicit product-scope node. It does not silently reopen B4 or B6.

Dependencies:

```text
B1 Career Evidence ─┐
B2 Target/Job       ├─→ P1 Truth-Preserving Professional Presentation
B3 Assessment       │
B4 ResumeVersion    │
B6 AI Runtime       │
B7 Opportunity      ┘
```

Release effect:

```text
P1 CLOSED
   +
B8 release certification including P1 regressions
   ↓
CVENGINE_V1_0_0 eligible for release
```

Until then:

```text
RELEASE_READY = NO
```

## 23. North-star test

For any generated resume sentence, CV Engine must be able to answer both questions:

1. **Why is this professionally the strongest way to present the candidate here?**
2. **Exactly what verified evidence allows us to say it?**

If it can answer only the second question, the product is safe but weak.

If it can answer only the first question, the product is persuasive but untrustworthy.

CV Engine exists to do both.
