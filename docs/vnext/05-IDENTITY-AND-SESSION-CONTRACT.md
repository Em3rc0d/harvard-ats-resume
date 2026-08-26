# CV Engine vNext — Identity, Session & Ownership Contract

Status: **AUTHORITATIVE PF0 PRODUCTION CONTRACT**

## 1. Decision

CV Engine vNext is an account-based B2C SaaS for durable Career Vault usage.

The first public production release does **not** support anonymous durable server-side Career Vaults.

A user may inspect the landing/first-run disclosure before authentication, but any durable career state requires an authenticated account.

```text
Visitor
  ↓
First-run disclosure
  ↓
Sign in / Create account
  ↓
Authenticated user
  ↓
Career Vault owned by user
```

Local development may use seeded/test users. That exception is not a production identity model.

## 2. Authentication authority

Production authentication is provided by **Supabase Auth**.

Initial supported methods:

- email + password;
- email magic link / OTP where enabled;
- social login is intentionally deferred until after the first production release unless product evidence requires it.

The application consumes authenticated identity through Supabase-issued session/JWT state. CV Engine domain code never treats an email address as authorization authority.

## 3. Ownership model

The first release is deliberately single-user, not organizational multi-tenant SaaS.

```text
AuthUser 1 ── owns ── CareerVault 1
```

Each durable user-owned aggregate carries an immutable `ownerUserId` that references the authenticated user identity.

Minimum ownership-bound aggregates:

- CareerVault;
- CareerEvidence / revisions;
- CareerSnapshot;
- CareerTarget;
- user-created JobSnapshot / Opportunity;
- OpportunityAssessment;
- ResumeVersion / ResumeManifest;
- Application / Outcome;
- user-visible AIExecution metadata;
- consent receipts.

Future coach/institution/team access must introduce an explicit membership/authorization model. It must never be implemented by sharing one user's owner id or bypassing RLS.

## 4. Authorization invariant

Authentication answers:

> Who is this request?

Authorization answers:

> May this user access this resource?

Both are required.

Every user-owned mutation/read must satisfy:

```text
request.userId == resource.ownerUserId
```

This rule is enforced twice:

1. application/service authorization before use-case execution;
2. PostgreSQL Row Level Security as defense in depth.

Server service-role credentials may bypass RLS only inside narrowly scoped infrastructure operations. They are never exposed to the browser and never used as a shortcut for ordinary user-facing reads/writes.

## 5. Session contract

Browser sessions use the provider-supported SSR/session mechanism for Next.js.

Requirements:

- session state must not be manually copied into localStorage as CV Engine auth state;
- server mutations resolve the authenticated user on the server;
- expired/invalid sessions fail as `UNAUTHENTICATED`, never as an empty Career Vault;
- authorization failures return `FORBIDDEN` without revealing whether another user's resource exists;
- session refresh behavior must not mutate Career Evidence;
- logout clears browser authentication state and any in-memory BYOK secret.

## 6. Consent relationship

The trust/disclaimer contract remains versioned.

For authenticated users, accepted consent is durable metadata:

```text
ConsentReceipt
- userId
- consentVersion
- acknowledgedAt
- aiAccessModePreference?   // preference only; never BYOK secret
```

If the authoritative consent/disclosure version changes materially, the product requires acknowledgement again before AI-assisted or career-data workflows continue.

A consent receipt is evidence of acknowledgement, not a waiver of technical/security responsibilities.

## 7. AI access context and identity

AI access is session/use-case context, not user authority.

```text
PLATFORM_KEY
BYOK_REQUEST_SCOPED
NO_CLOUD_AI
```

Changing AI access mode:

- does not change who owns Career Evidence;
- does not change authorization;
- does not create/delete Career Evidence;
- never persists a BYOK credential.

The user's selected non-secret preference may be persisted. The raw BYOK key may not.

## 8. Account lifecycle

### Create

Account creation yields an authenticated identity. Career Vault creation is explicit/idempotent and occurs on first durable career use.

### Export

A user must be able to export their durable career/application data in a machine-readable format before public production is called complete.

Minimum export scope:

- profile metadata;
- Career Evidence and revisions;
- Claims;
- Career Targets;
- Job/Opportunity snapshots created by that user;
- Assessments;
- ResumeVersions and provenance metadata;
- Application/outcome history;
- consent receipts;
- non-secret provider provenance.

Raw secrets are never included.

### Delete

Account deletion initiates deletion of user-owned primary data and private source objects according to the data lifecycle contract.

Deletion must be explicit and destructive, with a confirmation step.

The product must never claim instantaneous deletion from immutable provider backups unless the provider contract actually guarantees that. UI/legal wording should distinguish primary-store deletion from backup aging.

## 9. Resource identifiers

All durable domain entities use opaque IDs (UUID/UUIDv7 or equivalent implementation choice frozen in B0).

Never expose sequential IDs as authorization boundaries.

Ownership is checked independently of identifier entropy.

## 10. Anti-IDOR requirements

Quarry class: cross-user resource access.

Mandatory tests:

```text
User A cannot read User B CareerVault
User A cannot update User B Evidence
User A cannot delete User B ResumeVersion
User A cannot query existence through differing error bodies
service-role secret never reaches client
expired session cannot mutate state
```

## 11. First-release non-goals

Not in v1 core:

- organizations;
- coach/client delegation;
- university cohorts;
- shared Career Vaults;
- administrator impersonation;
- complex RBAC;
- SSO/SAML;
- public resume profiles.

Those require explicit future tenancy/authorization ADRs.

## 12. Acceptance criteria

PF0-01 is closed when implementation tests prove:

1. durable Career Vault access requires authentication;
2. every user-owned row has an ownership key or belongs to an ownership-bounded aggregate;
3. application authorization and RLS reject cross-user access;
4. logout destroys auth state and in-memory BYOK state;
5. consent version is tied to the authenticated user;
6. changing AI mode cannot alter ownership;
7. account export returns all supported user-owned domain records without secrets;
8. account deletion removes primary user-owned records according to the lifecycle contract;
9. service credentials are server-only;
10. security tests contain explicit IDOR fixtures.

## 13. Quarry seeds

```text
quarry-identity-001 cross-user CareerVault read
quarry-identity-002 cross-user evidence mutation
quarry-identity-003 resource-existence leak through 403/404 difference
quarry-identity-004 expired session mutation succeeds
quarry-identity-005 logout leaves BYOK in memory
quarry-identity-006 service-role credential bundled client-side
quarry-identity-007 stale consent version bypass
quarry-identity-008 delete account leaves primary CareerEvidence reachable
```
