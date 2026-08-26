# CV Engine vNext — BYOK Secret Handling

Status: **AUTHORITATIVE vNext SECURITY SPEC**

## 1. Scope

This document defines how CV Engine handles a user-supplied Gemini API key when the user chooses Bring Your Own Key (BYOK).

The API key is a secret credential. It must be handled as such from browser entry through provider invocation and disposal.

## 2. Security objective

CV Engine should be able to use a user-supplied Gemini key for bounded requests without intentionally persisting that credential anywhere in application state, storage, logs, analytics, error reporting, or durable databases.

The accurate promise is:

> CV Engine does not intentionally persist your BYOK credential. It is held transiently for the active page/request flow and discarded when that state ends.

Do not promise:

> CV Engine never sees your key.

If the CV Engine server proxies the Gemini request, the server necessarily receives the credential transiently.

## 3. Browser handling

Allowed:

- controlled secret/password input;
- React/application memory state;
- short-lived function/request variables;
- redacted UI state such as `BYOK configured`.

Forbidden:

- localStorage;
- sessionStorage;
- IndexedDB;
- Cache API;
- cookies;
- URL parameters or fragments;
- browser analytics events;
- client-side error payloads;
- Redux/Zustand/etc persistence plugins;
- DOM text rendering of the raw value after entry;
- clipboard re-copy features unless explicitly user initiated.

The default page reload behavior is to lose the key and require re-entry.

## 4. Transport

Production BYOK transport requires HTTPS.

Request shape is implementation-defined, but the credential must:

- never appear in a URL;
- never be included in GET requests;
- be sent only to the first-party CV Engine origin;
- be excluded from request tracing/logging;
- be redacted by server middleware before any generic logger/telemetry hook can inspect it.

Remote plain HTTP origins must not enable BYOK.

A localhost-only development exception may exist because local development commonly uses HTTP, but the UI must label it as local development behavior.

## 5. Server handling

The server may hold the BYOK secret only as a request-scoped variable.

Forbidden server behavior:

- database persistence;
- Redis persistence;
- filesystem persistence;
- environment mutation;
- process-global caches;
- session stores;
- background queues containing the raw key;
- request/response body logs containing the key;
- exception messages containing the key;
- provider provenance containing the key;
- key fingerprints derived from enough characters to reconstruct/identify the credential.

After the provider request completes/fails, application references to the credential must be released naturally with request scope.

No claim should imply guaranteed secure memory zeroization in JavaScript runtimes; the contract is zero intentional persistence and minimal lifetime/exposure.

## 6. Logging and telemetry

Before BYOK is implemented, the application must have a secret-redaction policy.

Logs may contain:

```text
credentialMode=BYOK
provider=gemini
model=<resolved model>
requestId=<opaque>
status=<normalized status>
```

Logs must never contain:

```text
AIza...
raw key
partial key prefix/suffix
x-goog-api-key value
authorization credential
request body containing credential
```

Automated tests must scan captured logs for the test secret.

## 7. Provider invocation

The server converts the transient inbound BYOK credential into the provider-specific authentication form only inside the Gemini adapter.

The rest of the domain/application code receives an opaque authentication context, not the raw string.

Preferred layering:

```text
UI secret input
   ↓
request-scoped credential envelope
   ↓
AI Gateway
   ↓
Gemini adapter only
   ↓
Google Gemini API
```

Ollama never receives the Gemini credential.

## 8. Key validation

Do not persist or deeply inspect a BYOK key to determine whether it is "real."

Validation should be minimal:

- non-empty;
- reasonable maximum length;
- permitted characters/shape only if stable enough not to reject valid future key formats;
- actual validity determined by a bounded provider request or dedicated provider validation call if justified.

Provider error responses are normalized without echoing the submitted key.

## 9. Abuse boundaries

BYOK does not exempt the user from CV Engine safety and resource controls.

Still enforce:

- request size limits;
- capability scope;
- whole-operation deadlines;
- model allowlist/routing policy;
- maximum attempts;
- abuse/rate controls where appropriate;
- truth validation.

A user-supplied key is authentication for provider usage, not authority to call arbitrary Google APIs through CV Engine.

## 10. Platform-owned key separation

The CV Engine platform key is never sent to the browser and never shares the BYOK lifecycle.

```text
PLATFORM KEY → server secret/env/secret manager
BYOK KEY     → browser memory → request scope → Gemini adapter → discard
```

These paths must be tested independently.

## 11. Security UX

BYOK screen should explain:

- where the key is used;
- that it is not intentionally stored;
- that reload may require re-entry;
- that usage is billed/limited by the user's Gemini project;
- that HTTPS is required outside localhost;
- that the user should revoke the key from Google AI Studio if they believe it was exposed.

## 12. Acceptance criteria

1. storage inspection after BYOK entry finds no key;
2. reload removes the key;
3. captured client/server logs contain no key;
4. Redis/database/filesystem scans contain no key;
5. platform-key and BYOK code paths are separate;
6. Ollama fallback receives no Gemini credential;
7. insecure remote HTTP disables BYOK;
8. normalized Gemini auth errors do not echo secrets;
9. provider provenance records only `credentialMode=BYOK`;
10. automated secret canary tests fail the build if the canary appears in persisted/logged artifacts.

## 13. Quarry seeds

```text
quarry-byok-001 key stored in localStorage
quarry-byok-002 key included in generic request logger
quarry-byok-003 key copied to Redis session state
quarry-byok-004 key leaked in exception telemetry
quarry-byok-005 key forwarded to Ollama fallback
quarry-byok-006 remote HTTP accepts BYOK
quarry-byok-007 provider auth error echoes submitted credential
```
