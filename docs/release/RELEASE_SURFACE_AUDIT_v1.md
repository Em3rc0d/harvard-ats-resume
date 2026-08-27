# CV Engine — Release Surface Audit v1

Status: **release hardening gate**  
Scope: public product surface on `/`, its primary API boundaries, and every user-visible control reachable from the canonical flow.

This document exists because a green compile is not enough. A release candidate must also prove that every visible action has one owner, one safe transition, one failure state, and no path that corrupts candidate truth.

## 1. Canonical public flow

```text
START
  ├─ Start from CV
  │      ↓
  │   UPLOAD
  │      ↓
  │   IMPORTED REVIEW
  │      ↓
  └─ Build career evidence
         ↓
       EDIT
         ↓
       TARGET
       ├─ General resume
       ├─ Specific job → Opportunity Assessment
       └─ Opportunity Space (2–10 jobs)
         ↓
      GENERATION
         ↓
      GUARDRAILS
         ↓
       RESULTS
```

`app/page.tsx` is intentionally only an entrypoint. `CVEngineFlow` owns the public state machine. The legacy `ResumeForm` is not part of the public runtime.

## 2. Global shell

| Surface/control | Expected behavior | Release contract |
|---|---|---|
| CV Engine brand/home button | reset the complete flow | clears result, failure, imported context, evidence draft and user name |
| EN / ES / FR / PT selector | switch visible copy | survives unavailable localStorage using volatile fallback; updates `<html lang>` |
| Product principle chips | presentation only | no click affordance |
| Footer | presentation only | no hidden action |

## 3. START

| Control | Expected transition | Guard |
|---|---|---|
| Start from my CV | `START → UPLOAD` | does not create candidate evidence before a file is accepted |
| Build my evidence | `START → EDIT` | no Job Description and no generation inside the evidence editor |

Trust copy must describe Career Opportunity Intelligence and evidence separation; it must not claim keyword stuffing, hiring probability, or guaranteed ATS success.

## 4. UPLOAD

### File picker / drag-and-drop

Accepted:

- `.pdf`
- `.docx`
- maximum 10 MB

Client-side checks reject unsupported type/size before the request. The server repeats authoritative validation.

### Import state

The UI shows the actual trust pipeline:

1. document text extraction;
2. candidate extraction proposal;
3. source reconciliation.

### Import failures

Expected non-2xx responses are product states, not thrown browser exceptions. `CVUpload` renders `errorCode` + `stage` inline.

Server failure classes include:

- `RESUME_IMPORT_TIMEOUT`
- `INVALID_RESUME_FILE`
- `RESUME_TEXT_UNREADABLE`
- `NO_SOURCE_BACKED_CANDIDATE_CONTENT`
- `NO_CANDIDATE_CONTENT`
- `AI_EXTRACTION_INVALID_RESPONSE`
- `SOURCE_RECONCILIATION_REJECTED`
- `RESUME_IMPORT_RUNTIME_FAILURE`

A single unsupported model leaf does not destroy an otherwise source-backed import. Unsupported values are omitted.

### Buttons

| Control | Behavior |
|---|---|
| Upload/select | process one file at a time; disabled while importing |
| Retry / choose another | reopens file chooser; does not reuse failed bytes silently |
| Cancel | `UPLOAD → START`; disabled while request is active |

## 5. IMPORTED REVIEW

The review surface shows source receipt, evidence counts and imported sections before targeting.

| Control | Behavior |
|---|---|
| Edit career evidence | `IMPORTED_REVIEW → EDIT` while retaining source receipt/evidence map |
| Continue to target | `IMPORTED_REVIEW → TARGET` |
| Start over | full reset |

Imported Job Description data is always empty; job truth is not extracted from a resume.

## 6. CAREER EVIDENCE EDITOR

Sections:

1. Personal information
2. Professional summary
3. Work experience
4. Education
5. Skills
6. Projects
7. Certifications
8. Languages

The editor owns **candidate evidence only**.

### Evidence shape

CV Engine no longer requires a traditional biography shape. It requires:

- valid basic identity; and
- at least one material career-evidence dimension.

Summary, work history and education are not individually mandatory. Source-reconciled work records may retain company/role/technology even when an unsupported description or date was removed.

Empty fields create no ghost CareerAssertion.

### Controls

| Control | Behavior |
|---|---|
| Next / Previous | changes editor section only |
| Add / Remove experience | modifies candidate evidence only |
| Add / Remove education | modifies candidate evidence only |
| Add / Remove project | modifies candidate evidence only |
| Add / Remove certification | modifies candidate evidence only |
| Add / Remove language | modifies candidate evidence only |
| Safe wording optimization | internal `/api/optimize-content`; new facts rejected/fallback |
| Voice input | optional browser capability; errors contained inline |
| Certificate upload | image → OCR; PDF → server text boundary |
| Continue to target | only when generation readiness passes; `EDIT → TARGET` |
| Cancel | returns to imported review when editing import, otherwise START |

There is no Generate button and no Job Description input in this surface.

## 7. CERTIFICATE HELPER

- Image processing uses OCR.
- PDF processing uses `/api/extract-certificate-text` on Node.
- PDF.js is not loaded in the browser.
- Missing extraction fields remain empty.
- Strings such as `Degree not found` are never written as candidate data.
- Promise failures are caught by the owning interaction and rendered inline.
- Server PDF extraction is bounded and rate-limited.

## 8. TARGET — GENERAL

| Control | Behavior |
|---|---|
| General resume | selects general mode; no Job Match is fabricated |
| Generate trusted resume | available only when career evidence readiness passes |
| Back | returns to imported review or evidence editor according to source |
| Edit career details | returns to EDIT |

General generation submits an empty Job Description.

## 9. TARGET — SPECIFIC JOB

Inputs:

- target role
- preferred seniority
- preferred location
- work model
- Job Description

Career Target remains preference/intent. It never becomes evidence.

### Assess opportunity

Before the request, the UI captures one immutable target/job snapshot. While the durable assessment is running:

- mode selection is disabled;
- Career Target fields are disabled;
- Job Description is disabled;
- Back/Edit are disabled;
- Generate is disabled.

The response must contain the current Opportunity Assessment, durable history and Target relevance. Network/response failures render inline; they do not call `console.error` from the user interaction.

Editing any target input invalidates the previous assessment.

### Build targeted resume

The button is enabled only when:

- candidate readiness passes;
- the current Job Description and target exactly match the assessed snapshot;
- Target relevance is present;
- no async operation is active.

## 10. OPPORTUNITY SPACE

Supports 2–10 complete job descriptions against one career state and one Career Target.

Before the first durable write the UI captures:

- `targetSnapshot`
- `selectedJobs`

While the sequence runs all mutable controls are locked:

- Back
- role/seniority/location/work model
- Add opportunity
- Remove opportunity
- all job textareas

Every selected job is assessed sequentially. All results must bind to the same CareerSnapshot before `/api/opportunity-space` composes the durable ordering.

A failed item stops composition and renders an inline error. Existing candidate evidence is never mutated.

## 11. TRUSTED GENERATION

`CVEngineFlow` is the only public owner of `/api/generate-resume`.

Final resume materialization is **deterministic and application-owned**. Ollama is not on this critical path; local AI remains bounded to import extraction and inline wording assistance.

```text
request validation
  ↓
rate limit
  ↓
Career Vault identity
  ↓
Career Evidence / optional Job Intelligence + Match
  ↓
deterministic source-preserving resume assembly
  ↓
deterministic grounding
  ↓
semantic grounding
  ↓
resume composition / claim provenance
  ↓
durable Career Vault commit + reload verification
  ↓
product result
```

The materialization provenance must identify the actual deterministic composer (`cv-engine-deterministic` / `source-preserving-resume-composer-v2` under the current contract). Missing or false generation provenance is a trusted-version blocker.

The exact attempted data, including Job Description, is retained before the request so a safe retry does not silently switch target context.

## 12. GUARDRAIL FAILURE

Failure classes remain distinct:

- deterministic truth grounding
- semantic grounding
- composition/provenance
- persistence

| Control | Behavior |
|---|---|
| Edit career evidence | change evidence, then return through TARGET before generation |
| Back to target | return to target without publishing a trusted version |
| Retry trusted generation | shown only for non-grounding failures where unchanged evidence may safely retry |
| Brand/home | full reset remains available |

A guardrail failure never emits a trusted ResumeVersion.

## 13. RESULTS

The result surface contains:

- Job Match when a target exists;
- Resume Quality;
- ATS Parseability;
- requirement-by-requirement evidence;
- ResumeClaim → CareerAssertion traceability;
- deterministic check details;
- Career Vault / ResumeVersion integrity;
- generated resume preview;
- suggestions.

These scores are scoped evaluations, not recruiter/hiring probabilities.

### Buttons

| Control | Behavior |
|---|---|
| Download PDF | render the trusted text with jsPDF; filename sanitized; export failure is inline and does not invalidate ResumeVersion |
| Print | browser print for `.print-content` only |
| Create New | complete flow reset |

No result action uses native `alert()` or logs an expected UI failure as an uncaught console error.

## 14. API boundary audit

| Route | Primary owner | Key guard |
|---|---|---|
| `/api/import-resume` | CVUpload | file validation, rate limit, source reconciliation, typed failures |
| `/api/extract-certificate-text` | CertificateUpload | PDF-only, bounded bytes, rate limit, Node PDF boundary |
| `/api/optimize-content` | CareerEvidenceForm | fact-preserving validator/fallback |
| `/api/assess-opportunity` | Target / Opportunity Space | rate limit, durable history, CareerTarget separation |
| `/api/opportunity-space` | Opportunity Space | durable assessment IDs only |
| `/api/generate-resume` | CVEngineFlow | validation → deterministic assembly → truth/semantic/provenance → durability |

Market-observation APIs remain separate from candidate evidence and are outside the primary resume UI flow.

## 15. Release documentation truth

The repository README and page metadata must describe the current product as Career Opportunity Intelligence. Release documentation must match the runtime actually built and tested.

Forbidden release claims include:

- “Production Ready” without completed release gate;
- hiring probability;
- guaranteed ATS success;
- keyword stuffing as the product strategy;
- invented/placeholder metrics as examples of expected resume content;
- client-side certificate PDF parsing when the code is server-owned;
- Gemini or another remote provider as part of the current default runtime;
- whole-resume model generation when final assembly is deterministic;
- obsolete model sizes, timeout settings, or runtime defaults contradicted by `.env.example` / Compose;
- CI-green or synthetic-browser PASS presented as physical field certification.

## 16. Automated merge gate

Exact PR head must pass the repository-owned release checks, including:

```text
npm ci
npm audit --audit-level=moderate
local-only AI runtime enforcement
npm run lint
npm run typecheck
npm test
npm run build
node scripts/verify-pdfjs-server-bundle.mjs
docker compose config
identified Docker image build + build identity verification
Chromium release acceptance
```

The browser gate must exercise user-visible success/failure transitions without unhandled page errors. Where a field incident depends on a browser capability class, the regression must explicitly reproduce that capability boundary rather than relying on localhost defaults that may mask it.

## 17. Field acceptance gate

After merge, the same real CV that previously exposed import failures must complete this golden path on a clean local build:

```text
same PDF
  ↓
import 200 or actionable typed rejection
  ↓
review retained source-backed evidence
  ↓
edit without inventing missing fields
  ↓
target + durable assessment
  ↓
trusted generation
  ↓
truth + semantic + provenance gates
  ↓
durable ResumeVersion
  ↓
Download / Print / Create New
```

For the RC2 browser-capability incident, field acceptance also requires the actual Windows-browser → non-loopback WSL HTTP path that exposed the failure. The generation request must leave the browser without an unhandled `crypto.randomUUID` error; any subsequent stop must be classified by the trusted server boundary rather than disguised as a client network failure.

A typed, correct guardrail stop is an acceptable outcome when the generated wording is unsupported. A runtime exception, browser overlay, generic unexplained 502, ghost assertion, stale/mismatched UI result, or browser-only capability crash is not.
