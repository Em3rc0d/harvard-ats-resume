# PR-ATS2-12 — Durable Persistence & Career Vault

## Objective

Turn the G11 runtime-only resume artifact into durable ATS v2 history without collapsing candidate truth, job truth, match inference, generated claims, or rendered resume content into one ambiguous record.

Before this gate, a successful generated resume could be materialized as `ResumeClaim[]`, `ResumeVersion`, and `ResumeManifest`, but the API explicitly reported `EPHEMERAL_RUNTIME`. The graph disappeared with request/process lifetime and the exact rendered artifact could not be reloaded later.

## Architecture

The durable path is now:

```text
Opaque browser vault capability
        ↓ SHA-256 server-side
Candidate Vault Identity
        ↓
Candidate Truth Snapshot
        + Target Job
        + Match Report
        + Grounded Resume
        ↓
ResumeClaims
        ↓
ResumeVersion
(content + target + provenance identity)
        ↓
ResumeManifest
        + Exact Rendered Resume Document
        ↓
CareerVaultSnapshot
        ↓ atomic Redis SET
        ↓ reload + complete graph validation
        ↓
HTTP 200
```

The application depends on a `CareerVaultRepository` port. The first infrastructure adapter uses the already-installed server-side `@upstash/redis` client. Domain/application code does not depend directly on Redis.

## Durable aggregate

`CareerVaultSnapshot` persists distinct collections for:

- `CandidateProfile`
- `CareerSource`
- `CareerEvidence`
- `CareerAssertion`
- `JobDescription`
- `JobRequirement`
- Job-analysis metadata and analyzer version
- `MatchReport`
- match score/breakdown and matcher version
- `ResumeClaim`
- `ResumeVersion`
- `ResumeManifest`
- exact plain-text rendered resume document
- vault revision and timestamps

The first adapter stores the complete candidate graph under one Redis key. A single Redis `SET` replaces the full snapshot atomically, so readers cannot observe a half-written ResumeVersion/ResumeManifest graph.

## Reload verification

A persistence call is not accepted as durable merely because `SET` returned.

The service:

1. loads and validates the previous snapshot when present;
2. merges immutable historical records by stable identity;
3. validates the complete next graph before storage;
4. writes the complete snapshot;
5. reloads it;
6. validates every cross-reference again;
7. verifies the expected revision, ResumeVersion, ResumeManifest, and rendered document exist;
8. only then allows the API to return success.

A storage failure or integrity failure cannot produce a successful durability response.

## Identity boundaries

### Vault identity

An early design used a hash of the candidate email as the durable vault key. Architectural review identified that as unsafe in the unauthenticated product: possession of another person's email could allow a caller to write into the same logical vault.

The final design instead creates an opaque UUID capability in the browser and stores it in localStorage under `ats2:career-vault-id`. The API requires that capability; the server hashes it before deriving `CandidateProfileId`.

Raw capability values, raw email, and raw Job Description text never appear in domain identifiers or Redis keys.

This capability is **not authentication**. It is a transitional opaque possession-based identity until a later authentication/account boundary binds or replaces it. No public Career Vault read endpoint is introduced in this gate.

### Candidate-truth snapshot identity

The logical vault/candidate identity is independent from the current candidate truth snapshot. Candidate truth receives its own stable SHA-256-derived projection key based on canonical candidate data and source-document provenance when available.

Job Description content remains excluded from that candidate fingerprint.

### Job and match identity

Target Job Descriptions receive a separate SHA-256 identity. Persisted Job Intelligence and Match identities include explicit engine-contract versions (`ji-g10-v1`, `jm-g10-v1`) so a future parser/matcher change cannot silently overwrite the historical meaning of an old analysis.

## Provenance-sensitive resume identity

Persistence exposed an additional historical-collision case in G11 identity semantics.

Previously:

```text
ResumeClaim ID   = rendered content + line index
ResumeVersion ID = rendered content + target
```

That is sufficient for runtime materialization, but not for durable history. If candidate assertions changed while the final rendered text and target stayed identical, the wording would have different provenance while reusing the same logical IDs.

G12 therefore strengthens identity:

```text
ResumeClaim ID
= content + supporting assertion provenance + line index

ResumeVersion ID
= content + target + claim provenance

ResumeManifest ID
= content + target + claim provenance
```

The exact rendered text still has its independent `contentSha256`. Identical text/target/provenance remains deterministic across attempts, while changed provenance becomes a distinct historical version.

## Exact rendered artifact

A second architectural review found that persisting only `ResumeVersion.contentSha256` plus claims/manifest would prove what the document hash was but would not allow the exact resume text to be recovered after restart.

G12 therefore persists a `PersistedResumeDocument` containing:

- `resumeVersionId`
- `mediaType: text/plain`
- exact rendered content
- `contentSha256`

Reload validation recomputes the content hash and requires it to equal both the stored document hash and the owning `ResumeVersion.contentSha256`. A tampered rendered document is rejected.

## API behavior

`/api/generate-resume` now requires `careerVaultId` in addition to the existing resume/source context.

The successful path remains:

```text
Candidate Truth
→ Job Intelligence / Match
→ Structured AI
→ Deterministic Grounding
→ Semantic Grounding
→ Runtime Resume Composition
→ Durable Career Vault save + reload verification
→ HTTP 200
```

If Upstash credentials are absent, generation fails closed with HTTP 503 and `persistence.status = UNAVAILABLE`. Career Vault never silently falls back to process memory.

If graph integrity fails, persistence is rejected and no durability claim is returned.

Successful responses now report:

```text
resumePersistence: DURABLE_CAREER_VAULT
careerVault.schemaVersion
careerVault.candidateProfileId
careerVault.revision
careerVault.createdAt
careerVault.updatedAt
```

The full stored vault and the opaque browser capability are not returned as a public browsing API.

## Incidents and corrections during execution

### Operator incident — accidental default-branch noop file

Before the feature branch was established, an accidental `__noop__` file was created on the repository default `main` branch. It was immediately reported and deleted before continuing G12 work. It was unrelated to the migration branch and did not represent intended product behavior.

### Identity review — email-derived vault collision/poisoning risk

The initial design used normalized email as the logical durable candidate key. Review rejected that design because the current product has no authentication boundary. It was replaced with the opaque browser-held UUID capability described above.

### Candidate fingerprint casing

The initial candidate fingerprint preserved email casing even though logical email identity normalized casing. That inconsistency was corrected by canonicalizing email in the candidate snapshot before hashing. The final vault identity is capability-based, but candidate snapshot canonicalization remains useful for deterministic truth snapshots.

### Missing rendered-document persistence

Review found that hash + manifest alone could not reconstruct the exact resume. The exact `PersistedResumeDocument` and anti-tampering validation were added before gate closure.

### CI typecheck attempt 1

The first authoritative G12 CI run caught an overly broad `NodeJS.ProcessEnv` contract in the repository factory test. The adapter contract was narrowed to only the two Upstash variables it actually consumes.

### CI typecheck attempt 2

The next run caught two TypeScript contract issues: passing `process.env` into a weak optional-only interface and mutating a `readonly` test snapshot. The environment is now projected explicitly into the minimal two-variable object, and the test reconstructs an immutable tampered snapshot instead of mutating readonly state.

### Post-green provenance collision review

After the first complete green persistence run, review found that identical content + target could reuse G11 IDs even if assertion provenance changed. ResumeClaim/ResumeVersion/ResumeManifest identities were hardened to include provenance, and a dedicated regression was added.

## Behavioral verification

The G12 Career Vault suite verifies:

1. opaque vault identity is stable across target/email presentation changes and does not expose capability/email;
2. first durable save survives serialization/reload with complete candidate→job→resume provenance;
3. exact rendered resume content survives reload and matches the ResumeVersion hash;
4. repeated same input increments vault revision without duplicating immutable history;
5. different target Job Description creates distinct job/match/version/document history;
6. partial manifest provenance is rejected before repository save;
7. tampered rendered resume content is rejected by SHA-256 validation;
8. a failed durable save leaves the previously committed snapshot intact;
9. absent durable-storage configuration fails closed instead of falling back to memory;
10. identical rendered content and target produce a distinct logical version when candidate assertion provenance changes.

Latest executable head before this documentation record: `045410dc2c3160f4aafb8e5da270bfb248323c49`.

GitHub Actions run `31541633398` passed:

- `npm ci` — PASS
- lint — PASS
- typecheck — PASS
- ATS v2 behavior tests — PASS (`41/41`)
- G10 controlled Job Match benchmark — PASS (`42/42` labeled EN/ES cases, zero false MATCH/GAP in that controlled corpus)
- production build — PASS

Vercel status for the same feature head — SUCCESS.

## Trust boundary / non-goals

This gate establishes a durable repository boundary and reload-verified persistence behavior. It does **not** claim:

- authenticated user identity or account ownership;
- recovery of a browser capability after localStorage is cleared;
- cross-device synchronization;
- public Career Vault browsing;
- retention/deletion workflows or privacy-policy completeness;
- encryption controls beyond the storage provider/platform defaults;
- optimistic concurrency or lost-update protection for simultaneous writers;
- validated scalability of an indefinitely growing single-key snapshot;
- full Career Vault UX;
- real-world statistical Match calibration.

The browser UUID capability is deliberately transitional. Clearing localStorage can orphan access to the old vault from that browser until an authentication/recovery mechanism exists.

## Gate

`G12 DURABLE_CAREER_VAULT — PASS (ATOMIC SNAPSHOT + RELOAD-VERIFIED PROVENANCE + EXACT RENDERED ARTIFACT), AUTH/RETENTION/CONCURRENCY HARDENING NOT YET CLAIMED`

Supporting status:

`OPAQUE_BROWSER_CAPABILITY — IMPLEMENTED, AUTHENTICATION NOT CLAIMED`

## Next architectural frontier

With durable history available, the next product frontier is explainability UX and legacy-score migration: make evidence, requirement matches, provenance, and version history visible without conflating Resume Quality, ATS Parseability, and Job Match.

Authentication/privacy hardening must be designed before exposing a general Career Vault read/browse API.