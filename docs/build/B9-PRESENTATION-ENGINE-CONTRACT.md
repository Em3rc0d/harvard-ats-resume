# CV Engine — B9 Presentation Engine Contract v1.0

Status: **SIGNED CONTRACT — IMPLEMENTATION NOT STARTED**

Branch: `build/cv-engine-vnext-b9-presentation-engine`

## 1. Product statement

CV Engine must not stop at proving what is true about a candidate.

> CV Engine must convert defensible Career Evidence into the strongest professional presentation it can support, while remaining able to prove that every material statement is still grounded in candidate truth.

B9 closes the product gap between a provenance-backed ResumeVersion and a professionally improved, application-ready resume.

## 2. Why B9 exists

B4 correctly closed deterministic, source-preserving ResumeVersion composition. Its invariant that trusted claims preserve VERIFIED Career Evidence exactly remains valid and must not be weakened.

However, exact copying is not equivalent to professional resume improvement. A candidate may provide a true but weakly worded statement. CV Engine needs a separate presentation layer capable of improving wording, selecting relevant content, composing sections and rendering a professional document without mutating Career Evidence.

B9 therefore adds a downstream presentation authority rather than reopening or weakening B1–B4 truth authority.

## 3. Authority boundaries

```text
CareerEvidence
    = WHAT IS TRUE

PresentationRevision
    = HOW AN APPROVED FACT MAY BE EXPRESSED

ResumePlan
    = WHICH APPROVED FACTS/PRESENTATIONS ARE USED AND IN WHAT ORDER

ResumeArtifact
    = THE FINAL RENDERED DOCUMENT
```

The following boundaries are mandatory:

- Career Evidence remains candidate-truth authority.
- PresentationRevision may change wording but may not change facts.
- Job Truth may influence selection/order/phrasing emphasis but may never become candidate truth.
- AI output is always a proposal until application validation and, where required, explicit user approval.
- ResumeArtifact is presentation output, never truth authority.

## 4. Canonical B9 flow

```text
PDF / DOCX / manual evidence
        ↓
B5 import + review / B1 manual input
        ↓
VERIFIED Career Evidence
        ↓
Presentation Optimization
        ↓
source-preserving AI proposal
        ↓
application-owned validation
        ↓
BEFORE / AFTER review
        ↓
explicit user approval
        ↓
APPROVED PresentationRevision
        ↓
Career Target
        ↓
Specific Job OR General Resume
        ↓
Assessment when targeted
        ↓
Resume Planning
  ├─ content selection
  ├─ section assignment
  ├─ ordering
  ├─ density limits
  └─ relevance prioritization
        ↓
Deterministic composition
        ↓
ATS-safe renderer
        ↓
DOCX / PDF / TXT / provenance JSON
```

## 5. PresentationRevision domain

Minimum conceptual shape:

```text
PresentationRevision
- id
- ownerUserId
- evidenceId
- evidenceRevision
- sourceTextSha256
- proposedText
- proposedTextSha256
- capability
- providerProvenance
- validatorVersion
- validationResult
- status: PROPOSED | APPROVED | REJECTED | SUPERSEDED
- approvedAt
- createdAt
```

Required properties:

- immutable source binding to exact Career Evidence revision;
- historical revisions preserved;
- approval status explicit;
- no silent overwrite;
- source/proposal hashes retained;
- provider/model provenance retained without secrets;
- presentation cannot survive as approved if its source evidence is no longer the referenced revision for a newly generated resume without explicit policy.

## 6. Fact-preservation validator

AI is not allowed to self-certify its rewrite.

Every wording proposal must pass application-owned validation before the UI may offer it as approvable.

Minimum rejection classes:

```text
FACT_ADDED
FACT_REMOVED_MATERIALLY
METRIC_ADDED
METRIC_CHANGED
EMPLOYER_CHANGED
TITLE_CHANGED
DATE_CHANGED
SKILL_ADDED
CERTIFICATION_ADDED
OWNERSHIP_STRENGTHENED
SENIORITY_STRENGTHENED
SCOPE_STRENGTHENED
NEGATION_CHANGED
UNSUPPORTED_SUPERLATIVE
SOURCE_NOT_PRESERVED
```

A validator may be conservative. False rejection is preferable to accepting an unsupported claim.

No validator may claim semantic equivalence merely because an LLM says so. Validation should combine deterministic checks, structured extraction/comparison and bounded model assistance only where necessary.

## 7. AI capabilities

B6 `INLINE_WORDING_OPTIMIZATION` becomes physically wired in B9.

B9 may add bounded capabilities such as:

```text
RESUME_WORDING_OPTIMIZATION
RESUME_SUMMARY_PROPOSAL
RESUME_CONTENT_PRIORITIZATION
RESUME_SECTION_COMPOSITION
```

Rules:

- AI may propose wording and editorial organization.
- AI may not invent metrics to make bullets stronger.
- AI may not infer a skill from a Job Description.
- AI may not convert "worked with" into ownership/leadership unless supported.
- AI may not promote familiarity into proficiency.
- AI may not fabricate quantified impact.
- AI may not silently drop material qualifiers that change truth.
- provider failure must degrade to source-preserving deterministic output.

## 8. User approval contract

Material wording changes require a reviewable before/after surface.

The user must be able to:

- inspect original Career Evidence;
- inspect proposed wording;
- see validation result;
- approve;
- reject;
- request another bounded proposal;
- revert to source wording.

No proposal is approved by default.

Bulk approval may be added only if every included proposal has individually passed validation and the UI makes the scope explicit.

## 9. ResumePlan

B9 introduces an application-owned editorial plan downstream of truth.

The plan may decide:

- which VERIFIED evidence appears;
- which APPROVED PresentationRevision is used for each selected evidence item;
- section assignment;
- section ordering;
- claim ordering;
- relevant certifications/projects retained or omitted;
- skill grouping;
- target-specific emphasis;
- page-density constraints.

The plan may not:

- create new Career Evidence;
- mutate Job Truth;
- claim unsupported ATS scores;
- hide provenance;
- turn omission into deletion of source truth.

General and targeted planning must remain distinguishable.

## 10. Professional summary

A professional summary is presentation, not candidate truth.

It may synthesize multiple VERIFIED evidence items and Career Target intent only when every factual component is traceable to its supporting sources.

A summary must never introduce:

- unsupported years of experience;
- unsupported seniority;
- unsupported specialties;
- unsupported business impact;
- unsupported technologies;
- unsupported domain expertise.

Summary provenance must identify every evidence source used.

## 11. ATS-safe rendering

B9 must produce application-ready artifacts, not only plain text.

Required v1 artifact formats:

```text
DOCX
PDF
TXT
provenance JSON
```

Renderer requirements:

- text remains selectable/searchable;
- semantic section headings;
- no image-only resume body;
- predictable reading order;
- conservative typography;
- no critical information in headers/footers only;
- links represented accessibly;
- no unsupported claim of universal ATS compatibility;
- output remains usable if styling is stripped.

PDF must be generated from the same canonical ResumeArtifact content as DOCX/TXT, not from a separate semantic branch.

## 12. Layout policy

Initial renderer should prefer a single-column professional layout.

Page count is a policy target, not a truth mutation rule.

For an early-career profile, the planner may target one page when content can be reduced through legitimate selection and concise presentation. It must never fabricate, distort or delete durable evidence merely to meet one page.

If content does not safely fit, two pages are preferable to destructive compression.

## 13. Import relationship

B9 does not change B5's truth semantics.

Imported fragments still enter as review proposals and accepted imported evidence remains `NEEDS_REVIEW` until the user verifies it according to Career Evidence rules.

B9 presentation optimization operates only on eligible Career Evidence. It must not optimize raw import proposals directly into final trusted resume claims.

A later versioned B5 proposal generator may improve structural extraction/noise filtering, but that is independent from B9 presentation authority.

## 14. Failure semantics

B9 fails closed by capability:

```text
AI unavailable
→ source wording remains usable

proposal fails validator
→ proposal rejected, source unchanged

renderer DOCX failure
→ no fake success; TXT/provenance may remain available

renderer PDF failure
→ no fake success; canonical artifact remains durable

stale evidence revision
→ approved presentation not silently rebound

missing targeted assessment
→ targeted plan forbidden
```

A presentation failure must never corrupt Career Evidence or an already committed historical ResumeVersion/ResumeArtifact.

## 15. Privacy and security

- raw CV bytes remain governed by existing import privacy boundaries;
- public repository fixtures must be synthetic and contain no real candidate PII;
- real-CV dogfood evidence must not be committed to the public repository;
- AI prompts contain only the minimum bounded content necessary for the capability;
- no BYOK/provider secret may enter PresentationRevision provenance;
- generated DOCX/PDF artifacts are private user data.

## 16. Golden-output acceptance philosophy

B9 is not closed because a document downloads.

The product must demonstrate that, for controlled synthetic resumes and private real-CV dogfood:

```text
OUTPUT_IS_TRUTH_PRESERVING
OUTPUT_IS_MEANINGFULLY_BETTER_PRESENTED
OUTPUT_IS_REVIEWABLE
OUTPUT_IS_PROVENANCE_BACKED
OUTPUT_IS_DOWNLOADABLE_AS_DOCX_AND_PDF
```

"Better" must be evaluated through executable structural rules plus human/product acceptance fixtures. It must not be reduced to an opaque ATS score or LLM self-rating.

## 17. B9 executable acceptance gates

B9 cannot close until all of the following are proven:

```text
PRESENTATION_REVISION_DOMAIN                         PASS
SOURCE_REVISION_IMMUTABLE_BINDING                    PASS
WORDING_AI_CAPABILITY_PHYSICALLY_WIRED               PASS
NO_AI_PATH_PRESERVES_SOURCE_WORDING                  PASS
BEFORE_AFTER_REVIEW_UI                               PASS
NO_DEFAULT_APPROVAL                                  PASS
FACT_ADDITION_REJECTION                              PASS
METRIC_ADDITION_REJECTION                            PASS
METRIC_CHANGE_REJECTION                              PASS
SENIORITY_STRENGTHENING_REJECTION                    PASS
SKILL_ADDITION_REJECTION                             PASS
STALE_SOURCE_REVISION_GUARD                          PASS
APPROVAL_DURABLE                                     PASS
REJECTION_DURABLE                                    PASS
GENERAL_RESUME_PLAN                                  PASS
TARGETED_RESUME_PLAN                                 PASS
JOB_TRUTH_NEVER_BECOMES_CANDIDATE_CLAIM             PASS
PROFESSIONAL_SUMMARY_PROVENANCE                      PASS
CONTENT_SELECTION_PROVENANCE                         PASS
ATS_SAFE_SINGLE_COLUMN_RENDERER                      PASS
DOCX_EXPORT                                          PASS
PDF_EXPORT                                           PASS
TXT_EXPORT                                           PASS
PROVENANCE_JSON_EXPORT                               PASS
DOCX_PDF_CANONICAL_CONTENT_PARITY                    PASS
CROSS_USER_IDOR_DENIAL                               PASS
ANONYMOUS_MUTATION_DENIAL                            PASS
AI_SECRET_CANARY                                     PASS
PROVIDER_FAILURE_DEGRADATION                         PASS
REAL_BROWSER_UPLOAD_TO_FINAL_ARTIFACT_E2E            PASS
PRIVATE_REAL_CV_DOGFOOD                              PASS
NO_OPEN_TRUTH_CONTRADICTIONS                         PASS
```

## 18. Golden path required for closure

```text
NEW USER
↓
Trust + Auth + AI choice
↓
Upload supported CV
↓
Review/import candidate facts
↓
Verify Career Evidence
↓
Generate wording proposals
↓
Review before/after
↓
Approve safe presentation revisions
↓
Choose Career Target
↓
General OR captured Job
↓
Assessment if targeted
↓
Generate ResumePlan
↓
Preview final resume
↓
Download DOCX
↓
Download PDF
↓
Download provenance
↓
Reload
↓
Historical artifact remains reproducible and traceable
```

## 19. Release claim

Until B9 closes, CV Engine may claim that its trusted-core and prior release contract are technically certified, but it may not claim the stronger commercial product promise:

> "Upload your CV and CV Engine will improve it into a professional application-ready resume from end to end."

That claim becomes eligible only after B9 is CLOSED with identified-runtime evidence.

## 20. Closure equation

```text
B9_CLOSED =
    CONTRACT_SIGNED
 && IMPLEMENTED
 && WIRED
 && EXECUTABLY_TESTED
 && REAL_BROWSER_UPLOAD_TO_FINAL_ARTIFACT_E2E
 && PRIVATE_REAL_CV_DOGFOOD
 && NO_OPEN_TRUTH_CONTRADICTIONS
```

Until then:

```text
UPLOAD_TO_IMPROVED_CV = NOT_PROVEN
RELEASE_READY = NO
PRODUCTION_QUALIFIED = NO
```
