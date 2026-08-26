# CV Engine vNext — Data Persistence & Lifecycle Contract

Status: **AUTHORITATIVE PF0 PRODUCTION CONTRACT**

## 1. Decision

The durable authority for CV Engine vNext is **PostgreSQL**, delivered initially through Supabase Postgres.

Redis is **not** the source of truth.

```text
PostgreSQL = durable Career / Job / Resume / History authority
Redis      = optional operational accelerator
Object store = temporary/private source-file transport when required
```

This deliberately changes a weakness of the first implementation: trusted Career Evidence durability must not depend on an operational cache/rate-limit service.

## 2. Why PostgreSQL

The domain is relational and provenance-heavy:

- users own Career Vaults;
- evidence has revisions;
- claims reference evidence;
- ResumeVersions reference snapshots/claims;
- assessments reference career/job snapshots;
- applications reference opportunities/resumes/outcomes;
- history must remain queryable and reproducible.

These relationships benefit from transactions, foreign keys, unique constraints, indexes and migration discipline.

## 3. Authoritative entity families

Minimum durable tables/aggregates for the first complete product path:

```text
profiles
career_vaults
career_evidence
career_evidence_revisions
claims
claim_evidence_refs
career_snapshots
career_targets
job_snapshots
job_requirements
opportunity_assessments
assessment_requirement_matches
resume_versions
resume_claims
resume_manifests
applications
application_events
outcomes
consent_receipts
ai_executions
import_receipts
```

Exact normalized table design is a B0/B1 implementation detail, but these semantic boundaries may not collapse into one `resume_data JSONB` authority blob.

JSONB may be used for bounded versioned payloads where relational decomposition adds no integrity value, but ownership, identity, status, version and provenance relationships remain explicit columns/foreign keys.

## 4. Evidence revision policy

Career Evidence is editable, but historical truth must remain interpretable.

Do not mutate historical evidence invisibly.

Preferred model:

```text
CareerEvidence (stable identity)
       ↓
EvidenceRevision 1
       ↓
EvidenceRevision 2
       ↓
EvidenceRevision N (current)
```

A correction creates a new controlled revision. Existing ResumeVersions continue to point to the snapshot/revision set from which they were built.

## 5. Snapshot policy

CareerSnapshot and JobSnapshot are immutable once used by a durable assessment/application/resume version.

If inputs change:

```text
Snapshot N
  ↓ change
Snapshot N+1
```

Do not rewrite Snapshot N and thereby reinterpret old decisions.

## 6. ResumeVersion policy

ResumeVersion is immutable after trusted creation.

Editing a resume produces another version.

Each trusted ResumeVersion must retain enough references to reproduce/explain:

- owner;
- career snapshot;
- target/job snapshot when applicable;
- claim ids;
- evidence references;
- composition contract/version;
- AI execution ids for optional rewrites;
- validator versions;
- renderer/export version.

## 7. Transaction boundaries

Operations that claim a trusted durable result must commit atomically.

Examples:

### Create Career Evidence revision

```text
insert revision
update current revision pointer
write audit/domain event metadata
COMMIT
```

If any required step fails, the application reports failure and does not claim the revision was saved.

### Create trusted ResumeVersion

```text
validate source snapshot/claims
insert ResumeVersion
insert ResumeClaim refs
insert ResumeManifest/provenance
COMMIT
```

No UI success before transaction success.

## 8. Idempotency and concurrency

Critical mutations should accept an application-generated idempotency/request key where duplicate browser retries are plausible.

At minimum:

- ResumeVersion creation;
- import finalization;
- application creation;
- destructive account/data operations.

Concurrent edits to evidence use optimistic concurrency (`revision/version` check or equivalent). Silent last-write-wins on Career Evidence is not accepted.

## 9. RLS and ownership

Every exposed user-owned table enables PostgreSQL Row Level Security.

Policies enforce authenticated ownership using the identity contract.

RLS is defense in depth, not a substitute for application authorization.

Migration tests must verify RLS on every exposed table before release.

## 10. Redis role

Redis/Upstash may be used for:

- distributed rate limits;
- short-lived idempotency locks;
- circuit-breaker state;
- ephemeral provider-health hints;
- short-lived cache;
- non-authoritative queue coordination where loss is explicitly safe.

Redis may **not** be the sole authority for:

- Career Evidence;
- ResumeVersions;
- consent receipts;
- JobSnapshots used by applications;
- application history;
- account ownership;
- BYOK secrets.

Redis outage may degrade these operational capabilities, but PostgreSQL-backed trusted reads/writes remain independently characterizable.

## 11. Source document lifecycle

Default v1 policy: uploaded CV/source documents are **ephemeral processing inputs**, not long-term Career Vault assets.

Reason:

- reduce retained PII;
- reduce storage cost;
- reduce deletion complexity;
- Career Evidence/provenance, not the binary file, is the primary product asset.

Because hosted request bodies can be smaller than our desired upload limit, a temporary private object-store lane may be used:

```text
Browser
  ↓ signed temporary upload
private object storage
  ↓ server processing
ImportReceipt + extracted proposal
  ↓
delete temporary object
```

Requirements:

- private bucket only;
- unpredictable user-scoped object path;
- bounded file size/type;
- short TTL/cleanup job as safety net;
- explicit deletion after import completes/fails;
- no public URL;
- no object name containing email/full name where avoidable.

If a future feature intentionally retains source documents, it requires a separate explicit consent/retention contract.

## 12. Upload limits baseline

Initial product contract:

- PDF and DOCX only for resume import;
- maximum 10 MB source file;
- maximum page/document complexity guard determined during B5 characterization;
- MIME sniff + extension/content agreement checks;
- archive-bomb / malformed document handling;
- no executable formats.

The 10 MB limit is a product limit, not permission to route 10 MB through any hosting function whose request-body limit is lower.

## 13. Backup / restore policy

Development/dogfood may use free infrastructure.

Public commercial production must run on a database tier that provides automatic backups suitable for our declared recovery policy.

The first production readiness gate must execute at least one restore drill into an isolated environment and verify representative Career Evidence, ResumeVersion and ownership relationships.

Until that drill exists, backup capability is `DOCUMENTED`, not `VERIFIED`.

## 14. Migration policy

All schema changes are version-controlled migrations.

Rules:

- production schema is never edited manually as the normal workflow;
- destructive migrations require explicit migration plan and backup/rollback consideration;
- migrations run in CI against a clean database;
- migration from N-1 supported schema is tested before release where production data exists;
- domain contract version changes are recorded separately from database migration numbers.

## 15. Data retention

### Active account

Durable domain data remains until the user deletes it or a future retention policy explicitly applies.

### Temporary uploads

Delete after processing; TTL cleanup is a fallback, not the primary deletion mechanism.

### BYOK

Zero intentional persistence.

### Logs/telemetry

Do not contain raw resumes/PII by default; retention defined in the security/observability contract.

### Account deletion

Primary user-owned rows/private objects are deleted/cascaded according to explicit foreign-key/domain rules. Provider backups age out under the infrastructure provider's backup lifecycle; public copy must describe this accurately.

## 16. Export portability

User data export must use stable machine-readable JSON plus human-usable resume exports where present.

The JSON export contains schema/version metadata so future CV Engine versions can interpret it.

## 17. Production baseline cost decision

Supabase Free is acceptable for local development/dogfood, but it does not satisfy the public-production durability promise because the free tier does not include automatic backups and may pause for inactivity.

The production launch gate therefore requires an appropriate paid/durable Supabase tier or an explicitly equivalent PostgreSQL provider before external commercial release.

## 18. Acceptance criteria

PF0-02 is closed when implementation proves:

1. PostgreSQL is the durable authority;
2. Redis failure cannot erase or fabricate Career Evidence durability;
3. RLS prevents cross-user table access;
4. Career Evidence updates preserve controlled revision history;
5. trusted ResumeVersion creation is atomic and immutable;
6. concurrency conflicts are detected rather than silently overwritten;
7. temporary source documents are deleted after import with TTL cleanup fallback;
8. account export is complete and versioned;
9. account deletion removes primary user-owned data;
10. schema migrations execute from clean and prior supported schema;
11. a production backup/restore drill is required before B8 qualification.

## 19. Quarry seeds

```text
quarry-data-001 Redis outage during Career Evidence save
quarry-data-002 duplicate ResumeVersion retry creates two versions
quarry-data-003 concurrent evidence edit silently overwrites revision
quarry-data-004 temporary CV survives cleanup window
quarry-data-005 RLS omitted on new user-owned table
quarry-data-006 account deletion leaves orphaned evidence
quarry-data-007 ResumeVersion transaction persists manifest without claims
quarry-data-008 restore drill loses provenance relationship
```
