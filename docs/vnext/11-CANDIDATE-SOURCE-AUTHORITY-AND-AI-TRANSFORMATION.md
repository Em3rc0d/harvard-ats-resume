# CV Engine vNext — Candidate Source Authority & AI Transformation Contract

Status: **AUTHORITATIVE PRODUCT / TRUTH CORRECTION**  
Decision class: **CONCEPTUAL BOUNDARY CORRECTION BACKED BY REAL-USER DOGFOOD EVIDENCE**  
Implementation status: **DOCUMENTED — RE-CODING NOT YET AUTHORIZED BY THIS DOCUMENT ALONE**

## 1. Decision

CV Engine adopts the following governing rule:

> **Believe the user's source. Distrust the AI's additions.**

Technically:

```text
USER INPUT
= authoritative candidate assertion

AI OUTPUT
= transformation requiring provenance validation
```

This is the primary truth rule for candidate-authored resume content.

The Truth Graph must not decide whether a candidate "deserves" a stronger CV. Its responsibility is narrower and more useful:

> **Guarantee that CV Engine improves the candidate's story without silently writing a different story.**

This decision corrects an over-constrained interpretation of truth safety that made candidate-provided information behave as if it were false until independently proven.

That interpretation is rejected.

---

## 2. Why this correction is necessary

CV Engine originally optimized strongly for a legitimate invariant:

```text
NO HALLUCINATED CAREER CLAIMS
```

During implementation, that invariant drifted toward a different product behavior:

```text
NO STRONG USE OF A CANDIDATE CLAIM
UNTIL THE CLAIM IS INDEPENDENTLY VERIFIED
```

Those rules are not equivalent.

A resume optimizer normally receives claims authored by the candidate. The system does not need a contract, GitHub commit, certificate, employer confirmation, screenshot, or external source before it can improve the wording of those claims.

If a candidate writes:

```text
Developed REST APIs with Spring Boot and PostgreSQL.
```

CV Engine may improve presentation while preserving meaning, for example:

```text
Designed and developed REST APIs with Spring Boot and PostgreSQL for maintainable web systems.
```

The system must validate whether the transformation remains source-supported. It does **not** need to prove that the candidate truly worked with Spring Boot in the external world before providing editorial assistance.

The question CV Engine can reliably answer is:

> **Did the AI introduce a material claim that the candidate did not provide?**

The question CV Engine generally cannot answer from a CV alone is:

> **Is every autobiographical statement objectively true in the external world?**

CV Engine is not a background-check service.

---

## 3. Evidence that triggered this correction

This correction is allowed under the vNext documentation rule that broad conceptual redesign requires executable evidence of a missing boundary.

Real-user dogfood exposed the missing boundary:

```text
real resume
→ provider calls executed
→ provider returned responses
→ structured-output validation rejected the responses
→ deterministic fallback took control
→ the user still did not receive the expected "improve my CV" outcome
```

The observed import path completed technical gates while the actual product experience remained poor.

This demonstrated that:

```text
CI GREEN != PRODUCT GOAL ACHIEVED
SYNTHETIC GOLDEN PATH != REAL-CV QUALITY
SAFE FALLBACK != USEFUL RESUME IMPROVEMENT
```

The repository already recognizes the distinction `REAL-WORLD != SYNTHETIC`. This contract extends that principle to the candidate-source authority model.

---

## 4. Candidate truth classes

The candidate side of the Truth Graph must distinguish **source authority** from **external verification**.

### 4.1 USER_ASSERTED

A fact, description, metric, date, technology, role, achievement, project, education item, certification, skill, language, or other career statement explicitly supplied by the candidate through:

- an uploaded CV;
- manual Career Evidence;
- an approved profile edit;
- an approved correction to imported content;
- another explicit candidate-controlled input surface.

Meaning:

```text
The candidate asserts this information.
```

It does **not** mean:

```text
CV Engine independently verified this information.
```

It also does **not** mean:

```text
The information is false or unusable until verified.
```

`USER_ASSERTED` is sufficient authority for resume rewriting, restructuring, summarization, formatting, selection, and targeted presentation, subject to fact-preservation validation.

### 4.2 EXTERNALLY_VERIFIED

Candidate-provided information that additionally has explicit supporting evidence or a trusted external link/receipt under a separately qualified verification mechanism.

Examples may include future integrations with:

- verified portfolio artifacts;
- certificates;
- repository evidence;
- employer-confirmed data;
- trusted professional-source imports.

External verification is an enhancement to provenance and confidence. It is **not a prerequisite for normal CV optimization**.

### 4.3 AI_TRANSFORMED

Text produced by an AI model from candidate-authoritative source material for presentation purposes.

Examples:

- stronger wording;
- shorter wording;
- ATS-oriented phrasing;
- section summaries;
- reordered bullets;
- consolidated skills;
- targeted variants for a job description.

AI-transformed content is never automatically elevated to candidate truth merely because a model generated it.

It must remain traceable to source claims.

### 4.4 AI_DERIVED_ANALYSIS

Analysis created by CV Engine that is not itself a biographical candidate fact.

Examples:

- likely ATS weaknesses;
- redundancy findings;
- inferred skill clusters;
- job-fit analysis;
- gap analysis;
- market observations;
- opportunity ranking.

Derived analysis must remain visibly separate from candidate truth.

### 4.5 UNSUPPORTED_NEW_CLAIM

A material factual claim introduced by AI that is not supportable from the candidate-authoritative source set.

Examples:

```text
Source:
"Improved backend performance."

Generated:
"Reduced API latency by 47%."
```

If `47%` is absent from the source authority set, the generated claim is unsupported.

Default handling:

```text
BLOCK OR REMOVE
```

The system should prefer a conservative supported rewrite rather than interrupting the user unnecessarily.

### 4.6 CONFLICT

Two candidate-authoritative sources materially disagree.

Examples:

- incompatible employment dates;
- different current role names in equally current sources;
- contradictory education status;
- incompatible metrics for the same achievement.

A conflict is not equivalent to falsehood.

Default handling:

1. resolve deterministically when a clear source-precedence rule exists;
2. preserve the more recent explicit candidate source when appropriate;
3. choose conservative wording if facts can safely coexist;
4. ask the candidate only when the ambiguity materially changes the resulting CV and cannot be resolved without invention.

---

## 5. Governing authority model

The authoritative model becomes:

```text
Candidate-authored source
        ↓
USER_ASSERTED candidate truth
        ↓
AI transformation
        ↓
provenance + fact-preservation validation
        ↓
accepted presentation
```

Not:

```text
Candidate-authored source
        ↓
UNVERIFIED / suspicious
        ↓
manual proof requirement
        ↓
permission to improve wording
```

### Authority matrix

| Material | Authority | Can drive CV wording? | Requires external proof first? |
|---|---|---:|---:|
| Candidate-uploaded CV claim | USER_ASSERTED | Yes | No |
| Candidate manual Career Evidence | USER_ASSERTED | Yes | No |
| Candidate-approved correction | USER_ASSERTED | Yes | No |
| Externally verified candidate fact | EXTERNALLY_VERIFIED | Yes | Already supported |
| AI rewrite preserving meaning | AI_TRANSFORMED | Yes, after validation | No external proof; source validation required |
| AI-invented metric/fact | UNSUPPORTED_NEW_CLAIM | No | Must be removed or explicitly supplied by candidate |
| Job description | MARKET / JOB TRUTH | May influence presentation only | N/A |
| AI fit/gap analysis | DERIVED_ANALYSIS | May guide decisions | N/A |

---

## 6. Truth Graph responsibility

The Truth Graph remains a core architectural asset, but its responsibility is corrected.

### The Truth Graph SHOULD

- record where a candidate assertion came from;
- preserve source provenance;
- preserve revisions;
- distinguish candidate assertions from market facts and derived analysis;
- track transformations;
- detect unsupported additions;
- detect factual conflicts;
- preserve links from generated resume text back to candidate sources;
- support external verification when available;
- allow multiple presentation variants without rewriting historical truth;
- provide auditability without blocking normal editing.

### The Truth Graph SHOULD NOT

- treat `not independently verified` as `false`;
- require evidence uploads before improving candidate-authored text;
- force the user to verify every imported bullet;
- expose internal ontology as mandatory UI work;
- stop resume generation merely because a source claim is `USER_ASSERTED`;
- behave as a background-check engine;
- turn provenance controls into a gate in front of the primary product goal.

The graph is a **safety ledger and provenance system**, not a tribunal.

---

## 7. Product golden path

The primary CV Engine path is now defined as:

```text
UPLOAD CV
    ↓
UNDERSTAND THE COMPLETE DOCUMENT
    ↓
IMPROVE THE CV HOLISTICALLY
    ↓
COMPARE GENERATED CLAIMS TO CANDIDATE SOURCE
    ↓
REMOVE / REPAIR UNSUPPORTED ADDITIONS
    ↓
SHOW IMPROVED CV
    ↓
DOWNLOAD DOCX / PDF
```

Optional after the core result:

```text
review changes
choose a target job
create a targeted variant
inspect Career Vault / provenance
use market intelligence
use opportunity intelligence
verify selected claims externally
```

The user must not be required to understand or operate the internal dependency graph before receiving a useful improved CV.

---

## 8. Default interaction policy: do the work first

CV Engine should default to:

> **Do not ask the candidate questions that are unnecessary to produce a source-faithful improvement.**

The system should use conservative transformation instead of asking questions whenever reasonable.

### Do not ask merely because

- a claim is not externally verified;
- a technology appears only once;
- a project has no external URL;
- a metric came from the candidate's own CV;
- a role title has no employer confirmation;
- a certification has not been independently validated;
- a statement could theoretically be stronger with more context.

### Asking is justified only when

- two authoritative candidate sources materially conflict and no precedence rule resolves them;
- the requested transformation would require inventing a missing fact;
- ambiguity changes the professional meaning in a material way;
- the user explicitly enters an evidence-verification workflow.

Even then, a safe conservative output should be preferred when possible.

---

## 9. AI policy: powerful editor, strict guardian

CV Engine should not make the editor artificially weak in order to achieve safety.

The preferred architecture is:

```text
POWERFUL RESUME EDITOR
        +
STRICT FACT GUARDIAN
        =
USEFUL + SOURCE-FAITHFUL OUTPUT
```

Rejected architecture:

```text
OVER-CONSTRAINED EDITOR
        +
STRICT GUARDIAN
        =
TECHNICALLY SAFE BUT USELESS OUTPUT
```

### Resume Editor MAY

- rewrite sentences;
- improve action verbs;
- remove redundancy;
- consolidate repeated material;
- improve section ordering;
- improve ATS clarity;
- improve professional tone;
- summarize long passages;
- normalize headings;
- restructure bullets;
- tailor emphasis toward an explicit target job;
- choose among candidate-supplied facts for relevance.

### Resume Editor MAY NOT

- invent employers;
- invent roles;
- invent dates;
- invent technologies;
- invent education;
- invent certifications;
- invent responsibilities;
- invent achievements;
- invent metrics;
- materially change the meaning of source assertions without explicit candidate input.

### Fact Guardian MUST

compare generated output against the authoritative candidate-source set and classify material transformations as at least:

```text
SOURCE_PRESERVED
SAFE_REPHRASE
SAFE_RESTRUCTURE
SOURCE_OMISSION
POSSIBLE_NEW_CLAIM
UNSUPPORTED_NEW_CLAIM
SOURCE_CONFLICT
```

The guardian should validate facts, not stylistic identity.

---

## 10. Relationship to existing CV Engine architecture

This contract does **not** discard the current architecture.

It changes where that architecture participates in the user journey.

### Career Evidence / Career Vault

Remains the durable candidate-truth store.

Correction:

```text
Candidate import may populate candidate-authoritative assertions
without requiring claim-by-claim external verification.
```

External verification remains additive and optional unless a specific feature explicitly requires it.

### Career Target

Remains candidate intent.

It can guide prioritization and tailoring, but is not required to improve a general CV.

### Job Truth

Remains separate market/job authority.

Job descriptions may affect presentation but may never become candidate facts.

### Market Intelligence

Remains a separate capability.

It must not block the primary resume-improvement path.

### Assessment / Opportunity Space

Remain derived analysis.

They may provide additional value after or alongside the primary resume workflow.

They are not prerequisites for producing a stronger CV.

### Resume Plan

May remain as an internal explainable selection/ordering artifact.

It should not need to be understood by the end user.

### Presentation Revision

Remains a useful provenance record for AI transformations.

The normal product experience should present human-readable changes rather than internal revision mechanics.

### Resume Artifact

Remains the immutable generated document authority.

It is the natural result of the primary workflow.

---

## 11. Terminology correction

The UI and product semantics must avoid using `UNVERIFIED` in a way that implies falsehood.

Where relevant, prefer distinctions such as:

```text
Source-provided
Candidate-confirmed
Externally verified
AI-transformed
Needs conflict resolution
Unsupported AI addition
```

Exact schema naming remains an implementation decision and must not be changed merely to rename fields without a migration plan.

The conceptual invariant is mandatory even if existing database enums initially remain unchanged.

---

## 12. Import architecture implication

Mechanical extraction remains valuable for provenance.

However:

```text
SOURCE LINE != USER-FACING CAREER ENTITY
```

The mechanical layer should remain below a semantic document model.

Target architecture:

```text
PDF / DOCX
    ↓
Mechanical source extraction
    ↓
SourceLine[]
    ↓
Semantic document understanding
    ↓
Candidate entities
    ├── Profile
    ├── Employment[]
    ├── Projects[]
    ├── Education[]
    ├── Certifications[]
    ├── Skill groups[]
    └── Languages[]
    ↓
Holistic resume improvement
    ↓
Fact guardian
    ↓
Resume artifact
```

Source lines remain provenance leaves. They must not define the end-user mental model.

---

## 13. Failure and degradation policy

AI failure must remain safe, but `safe` is not equivalent to `successful`.

If the editor fails:

- preserve the original candidate source;
- explain that improvement could not be completed;
- do not corrupt candidate truth;
- do not silently present deterministic classification as if AI optimization succeeded.

If the guardian rejects part of an otherwise useful generated resume:

- salvage valid sections where possible;
- repair or revert unsupported passages;
- avoid discarding an entire document for one malformed field when safe partial recovery is possible.

Provider availability and validation failure must be reported distinctly.

```text
PROVIDER_UNAVAILABLE
!=
PROVIDER_RESPONDED_BUT_OUTPUT_INVALID
!=
FACT_GUARD_REJECTED_NEW_CLAIM
```

---

## 14. Release acceptance criteria derived from this contract

A future release implementing this decision is **not complete** merely because technical B0–B9 flows pass.

The core acceptance test must include a representative real or safely private ground-truthed CV workflow.

Minimum product acceptance:

```text
GIVEN
  a representative candidate CV

WHEN
  the candidate asks CV Engine to improve it

THEN
  CV Engine produces a materially improved resume

AND
  candidate-provided claims are usable without external proof

AND
  unsupported AI facts are not present

AND
  factual meaning is preserved

AND
  the candidate is not forced through claim-by-claim verification

AND
  a valid DOCX and/or PDF can be downloaded
```

Required regression dimensions:

- Spanish and English resumes;
- multiple projects;
- multiple employment roles;
- student/junior/mid/senior shapes;
- dense technical skills;
- quantified achievements;
- candidate assertions with no external evidence;
- conflicting old/new CV versions;
- provider output-validation failures;
- fact-guardian rejection of invented metrics;
- successful conservative recovery.

Release rule:

```text
SAFE BUT USELESS != PASS
REAL-CV PRODUCT FAILURE != PASS
ZERO HALLUCINATION + ZERO USEFUL IMPROVEMENT != PASS
```

---

## 15. Non-goals

This correction does not authorize CV Engine to:

- fabricate candidate experience;
- encourage lying on resumes;
- create unverifiable fake credentials;
- impersonate external verification;
- claim that candidate assertions are independently proven;
- merge market/job facts into candidate biography;
- remove provenance safeguards;
- bypass user ownership/RLS/lifecycle rules.

It also does not require removing:

- Career Targets;
- Job Truth;
- Market Intelligence;
- Assessments;
- Opportunity Space;
- Resume Plans;
- Presentation Revisions;
- Resume Artifacts;
- provenance;
- immutable history;
- external verification capabilities.

Those remain valuable capabilities. They simply must not obstruct the core resume-improvement experience.

---

## 16. Compatibility with the existing truth architecture

The existing high-level separation remains valid:

```text
Candidate truth != Job truth
Candidate truth != Career intent
Derived assessment != truth
AI proposal != truth
Provider success != validation success
```

This contract adds the missing distinction:

```text
Candidate-provided assertion != externally verified assertion

Not externally verified != false

Candidate-provided assertion
= sufficient source authority for CV transformation

AI-generated addition
= untrusted until source/provenance validation
```

Therefore the governing architecture becomes:

```text
Candidate source assertion = candidate authority
Job Snapshot               = market truth
Career Target              = intent
Assessment                 = derived analysis
AI transformation          = proposed presentation
Fact Guardian              = source-preservation gate
Resume Artifact            = accepted projection
```

---

## 17. Implementation stop condition

This document intentionally comes **before** re-coding.

No implementation should begin merely by renaming statuses or changing UI copy.

Before code changes, the implementation plan must close at least these nodes:

1. exact source-authority schema semantics;
2. compatibility with existing `CareerEvidence` and `TruthClass` storage;
3. full-document semantic model;
4. editor vs guardian capability split;
5. provider structured-output contract;
6. partial-recovery strategy;
7. user-facing primary workflow;
8. migration/backward-compatibility strategy;
9. real-CV golden acceptance harness;
10. release/re-certification scope.

Until those nodes are closed:

```text
DOCUMENT THE CORRECTION
DO NOT PATCH RANDOM SYMPTOMS
DO NOT REWRITE THE BACKEND UNNECESSARILY
DO NOT WEAKEN PROVENANCE
```

---

## 18. Final product principle

CV Engine exists to help a candidate present their career as strongly as possible without allowing the AI to invent a different career.

The concise governing rule is permanent unless superseded by a later explicit authority document:

> **Believe the user's source. Distrust the AI's additions.**

And the Truth Graph's product responsibility is:

> **Improve the candidate's story without writing a different story.**
