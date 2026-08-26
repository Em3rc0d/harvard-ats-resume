# CV Engine vNext — Security, Observability & Privacy Baseline

Status: **AUTHORITATIVE PF0 PRODUCTION CONTRACT**

## 1. Objective

CV Engine processes sensitive career information and transient API credentials. Production security cannot be a collection of ad-hoc headers and logger calls.

This contract defines the minimum engineering baseline for:

- data classification;
- browser/API security;
- upload security;
- secrets;
- observability;
- privacy/data minimization;
- provider disclosures;
- incident handling;
- dependency/supply-chain gates.

## 2. Data classes

### SECRET

Examples:

- BYOK Gemini key;
- platform Gemini key;
- Ollama API credential;
- Supabase service-role/server secret;
- Upstash credentials;
- telemetry ingestion secret.

Rules:

- server/request memory only as required;
- never application logs/analytics;
- never client bundle unless provider explicitly defines a browser-safe publishable key;
- never URLs;
- never error messages;
- rotation procedure required.

### SENSITIVE_PII

Examples:

- full name;
- email/phone;
- address/location when specific;
- resume/CV raw contents;
- employment/education history;
- application history/outcomes;
- source files.

Rules:

- collect only for product purpose;
- user ownership/RLS;
- no infrastructure logs by default;
- no AI transmission unless capability needs the specific data;
- retention/deletion/export contract applies.

### CAREER_CONTENT

Examples:

- responsibilities;
- projects;
- achievements;
- skills;
- claims;
- job descriptions.

Career content may be sent to AI only through a declared bounded capability and should exclude identity fields not required for that capability.

### OPERATIONAL_METADATA

Examples:

- request id;
- user opaque id;
- capability;
- model/provider;
- status;
- latency;
- token counts;
- build/runtime identity.

This is the preferred observability layer.

### PUBLIC

Marketing/public product content only.

## 3. Privacy minimization principle

The AI payload should be the smallest payload that can satisfy the capability.

Example:

```text
Resume wording optimization needs:
claims + evidence-bound text + target requirements

It usually does NOT need:
email + phone + LinkedIn URL + home address
```

Identity and career content are separate application concepts so this minimization is enforceable.

## 4. Provider/processor inventory

The production privacy model must list every external processor/service that may receive data.

Initial architecture inventory:

- Vercel — web/application runtime;
- Supabase — Auth/PostgreSQL/private temporary object storage;
- Google Gemini — bounded AI when cloud AI is enabled;
- Ollama/Ollama Cloud or qualified remote Ollama provider — fallback AI when configured;
- Upstash — operational rate-limit/cache metadata only when enabled;
- future error/analytics provider only after explicit privacy review.

The public privacy/disclosure copy must reflect the providers actually enabled in the release profile, not every theoretical adapter in source code.

## 5. Logging policy

Application logs are metadata-first.

Allowed examples:

```text
requestId
opaque userId
route/useCase
status/errorCode
provider/model
credentialMode
latency
token counts
record ids
build SHA/runtime profile
```

Forbidden by default:

```text
raw CV/resume
raw Career Evidence description
raw Job Description
email/phone/full name
BYOK/platform API keys
Authorization/Cookie headers
full request/response bodies
signed storage URLs/tokens
```

If a temporary debug workflow needs sensitive content, it requires explicit local/test-only tooling and must never be silently enabled in production.

## 6. Secret redaction

Redaction occurs **before** generic logger/error/telemetry hooks.

Minimum canary strategy:

- inject a distinctive synthetic secret in security tests;
- execute BYOK/provider/error paths;
- scan captured client/server logs, database, Redis, telemetry fixtures and error artifacts;
- build fails if the canary appears outside expected in-memory test boundary.

Do not rely only on regex matching known Gemini prefixes; future credential formats may differ.

## 7. Error handling

User-facing errors must be actionable but non-sensitive.

Internal normalized errors contain:

- class/code;
- request id;
- capability;
- provider/model when safe;
- retry/degradation state.

Never echo:

- provider Authorization headers;
- raw upstream error request bodies containing secrets;
- SQL queries with user content;
- stack traces to end users in production.

## 8. Browser security baseline

Production responses define and test:

- Content-Security-Policy;
- `frame-ancestors` / clickjacking protection;
- `object-src 'none'` unless explicitly required;
- restricted `base-uri`;
- restricted `form-action`;
- explicit `connect-src` for first-party/Supabase/provider calls actually made from browser;
- Referrer-Policy;
- X-Content-Type-Options;
- Strict-Transport-Security on production HTTPS;
- Permissions-Policy limiting unnecessary browser capabilities.

CSP must be compatible with the actual Next.js/runtime implementation and tested in report/enforce mode progression rather than disabled because it is inconvenient.

## 9. HTTPS rule

Production is HTTPS-only.

Remote BYOK is disabled on plain HTTP.

`http://localhost` may be used only as an explicit development exception.

No mixed-content provider endpoints in production.

## 10. Session / mutation protection

Authentication and session libraries use secure provider-supported cookies/SSR mechanisms.

For state-changing requests:

- same-origin boundaries are enforced;
- unsafe cross-site request behavior is rejected;
- Origin/Host validation or framework/provider-supported CSRF defenses are used where relevant;
- cookies use appropriate Secure/SameSite/HttpOnly characteristics according to provider flow;
- authorization is still performed per resource.

Do not invent a custom session token format.

## 11. Upload security

Resume import accepts only explicitly supported formats.

Checks include:

```text
authenticated owner
size <= product limit
extension allowlist
MIME/content sniffing
PDF/DOCX structural parser validation
archive/decompression guard
filename normalization
private temporary storage
opaque storage path
no public object ACL
cleanup on success/failure
```

Never execute macros/scripts from uploaded office documents.

Malformed parser inputs must produce a safe import failure, not server crash or partial Career Evidence acceptance.

## 12. Rate limiting and abuse

Different surfaces have different cost/risk profiles.

At minimum:

- authentication endpoints use provider/platform abuse controls;
- AI endpoints use user/IP burst limits + daily policy;
- upload authorization has user/IP limits;
- import operations have concurrency limits;
- export/download endpoints prevent unauthorized enumeration;
- platform-key AI fails closed to paid/provider use when cost guards cannot be evaluated.

Rate limit errors do not expose internal quota values unless intentionally part of UX.

## 13. Database security

- RLS on user-owned exposed tables;
- least-privilege grants;
- service role server-only;
- migrations version controlled;
- no SQL constructed by string-concatenating user input;
- connection secrets not client-side;
- production backups/access governed through provider account security.

Cross-user RLS tests are mandatory.

## 14. Object storage security

Temporary resume objects:

- private bucket;
- user-scoped/opaque key;
- signed time-limited upload/read authorization;
- no public listing;
- cleanup lifecycle;
- object metadata avoids unnecessary PII.

Signed URLs/tokens are credentials and must not be logged.

## 15. Dependency / supply-chain baseline

CI must include:

- lockfile-enforced install;
- dependency vulnerability audit with explicit severity policy;
- no unreviewed install scripts where avoidable;
- secret scanning;
- source scanning for forbidden client-exposed environment variables;
- license review for production dependencies where relevant;
- framework/runtime on supported release line;
- generated artifacts built from exact commit.

A green dependency audit does not prove production security, but known critical/high exploitable issues cannot be knowingly shipped without explicit risk acceptance.

## 16. Observability contract

Observability must answer operational questions without copying the product's sensitive content into logs.

Required dimensions:

```text
request / trace id
route / use case
build SHA
runtime profile
user opaque id
operation id
success/failure/degradation
latency
DB operation outcome
AI provider/model/attempt/fallback
token/cost metadata when available
import stage/error class
export renderer version
```

Metrics are aggregate where possible.

## 17. Audit/domain events

Security/product audit events record **what happened**, not the raw career content.

Examples:

```text
CONSENT_ACKNOWLEDGED
CAREER_EVIDENCE_REVISION_CREATED
RESUME_VERSION_CREATED
ACCOUNT_EXPORT_REQUESTED
ACCOUNT_DELETION_REQUESTED
AI_PROVIDER_FALLBACK_USED
BYOK_MODE_SELECTED
```

Do not build an immutable surveillance log of the user's full resume text.

## 18. Retention baseline

Initial operational retention target:

- application logs: short bounded period appropriate for debugging;
- security/audit metadata: longer bounded period where needed;
- raw career content: not present in logs;
- temporary uploads: processing lifetime + short cleanup safety window;
- BYOK: no persistence;
- production backups: provider-defined lifecycle disclosed accurately.

Exact numeric retention values are frozen before B8/public privacy copy based on the selected telemetry/provider plans. Missing numeric values do not permit indefinite retention.

## 19. Security incident handling

At minimum, operational runbooks cover:

### Suspected secret exposure

1. revoke/rotate affected credential;
2. disable affected provider path if needed;
3. inspect metadata/log boundaries without spreading secret further;
4. patch root cause;
5. run canary/regression;
6. assess user/provider notification obligations.

### Cross-user authorization incident

1. disable affected surface;
2. preserve non-sensitive forensic evidence;
3. identify scope;
4. patch RLS/application authorization;
5. rerun IDOR corpus;
6. evaluate disclosure obligations.

### Malicious upload/parser exploit

1. disable import path if containment requires;
2. retain safe hashes/metadata, not redistribute malicious file casually;
3. patch parser/size/type boundary;
4. add quarry fixture when safely reproducible.

## 20. Legal/privacy release boundary

Engineering can implement the disclosure requirements, but public production must have Terms/Privacy/Disclaimer copy reviewed for the actual jurisdiction/business posture.

The product must never claim:

- the disclaimer removes liability;
- zero provider processing when cloud AI is enabled;
- instant deletion from provider backups without evidence;
- BYOK key never reaches CV Engine server when it is proxied;
- guaranteed hiring/ATS outcomes.

## 21. Security release gates

B8 cannot qualify without executable evidence for:

```text
cross-user authorization
RLS coverage
secret canary
CSP/security headers
BYOK insecure-origin block
upload malformed/oversize/type faults
rate-limit/budget fault behavior
account export/deletion
no raw PII in production log fixtures
supported framework/dependency line
```

## 22. Acceptance criteria

PF0-05 is closed when the implementation plan can prove:

1. all persisted/transmitted data has a classification;
2. AI payloads minimize identity/PII;
3. production logs contain metadata, not raw career content/secrets;
4. secret canary test exists and blocks leakage;
5. browser security headers/CSP are tested;
6. remote BYOK requires HTTPS;
7. uploads are private, bounded and validated;
8. RLS/application auth block cross-user access;
9. provider/service credentials are server-only;
10. incident runbooks exist before public release;
11. privacy copy reflects actual enabled providers/data flows.

## 23. Quarry seeds

```text
quarry-security-001 raw CV logged by generic request logger
quarry-security-002 BYOK leaked in exception telemetry
quarry-security-003 service-role secret exposed in browser bundle
quarry-security-004 malicious DOCX causes parser crash
quarry-security-005 oversized upload bypasses client limit
quarry-security-006 CSP silently removed to fix UI script
quarry-security-007 cross-user signed file URL generated
quarry-security-008 account export contains provider secret
quarry-security-009 production debug mode logs Job Description/Career Evidence
quarry-security-010 dependency upgrade introduces unsupported framework line
```
