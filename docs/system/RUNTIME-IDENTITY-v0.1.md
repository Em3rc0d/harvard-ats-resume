# Runtime Identity v0.1

## Why

ATS-SYS-INC-003 showed that repository state and observed container behavior can diverge. Without exact runtime identity, diagnosis can misclassify version skew as a provider/application failure.

## Contract

`/api/health` exposes:

```json
{
  "identity": {
    "buildSha": "... or UNIDENTIFIED",
    "architectureVersion": "ats-sys-01-v0.1",
    "runtimeProfileId": "... or UNCHARACTERIZED",
    "identified": true,
    "releaseQualifiableIdentity": true,
    "source": "CVENGINE_BUILD_SHA"
  }
}
```

No SHA is invented. If the build cannot identify itself, `buildSha` is `UNIDENTIFIED` and the runtime cannot satisfy the `build-identity` release criterion.

## Identified Docker startup

Use:

```bash
npm run docker:identified -- up --build
```

The wrapper resolves `git rev-parse HEAD` and passes it into Docker Compose as `CVENGINE_BUILD_SHA`.

The runtime profile is intentionally separate. Set it only when the host is being run under a declared characterization profile, for example:

```text
CVENGINE_RUNTIME_PROFILE_ID=REFERENCE-CPU-01
```

Do not assign a `SUPPORTED_MINIMUM` profile name until the Runtime Envelope gate is actually closed.

## Precedence

Build identity resolves in this order:

```text
CVENGINE_BUILD_SHA
VERCEL_GIT_COMMIT_SHA
GITHUB_SHA
UNIDENTIFIED
```

This supports local Docker and hosted build systems without confusing platform metadata with candidate/product truth.

## Health semantics

An unidentified build does not automatically make the process unhealthy for development. Service readiness and release qualification are separate questions:

- health/dependency readiness answers whether the process can serve requests;
- runtime identity answers whether its behavior can qualify as evidence for a specific release.
