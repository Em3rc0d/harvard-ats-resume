# ATS-SYS-01 Characterization Harness v0.1

## Purpose

This harness is the bridge between system contracts and release evidence.

It is not a replacement for unit tests or construction CI. It executes the running Docker product against versioned synthetic personas and fault scenarios, records exact runtime identity, preserves raw evidence, and emits machine-readable receipts.

The governing rule is:

```text
observation != budget
fixture contract != passing fixture
implemented harness != executed harness
CI green != release qualified
```

## Prerequisites

Use the ATS-SYS-01 branch and declare the runtime profile being observed.

The current real CPU host can be called `REFERENCE-CPU-01` because it has already been observed, but this name is **not** a minimum-support promise.

### PowerShell

```powershell
git checkout agent/ats-sys-01-system-characterization
git pull
$env:CVENGINE_RUNTIME_PROFILE_ID="REFERENCE-CPU-01"
npm run docker:identified -- up --build -d
```

### POSIX shell

```bash
git checkout agent/ats-sys-01-system-characterization
git pull
export CVENGINE_RUNTIME_PROFILE_ID=REFERENCE-CPU-01
npm run docker:identified -- up --build -d
```

`docker:identified` injects the exact Git HEAD into the application image. `/api/health` must report the same build SHA and a non-`UNCHARACTERIZED` runtime profile before characterization can qualify as release evidence.

Do not use `docker compose down -v` for this workflow. The standard v0.1 characterization retains Redis/Ollama volumes.

## 1. Canonical persona characterization

Run all promoted document personas:

```bash
npm run system:characterize
```

Run one persona while debugging:

```bash
npm run system:characterize -- --persona P09
```

Promoted v0.1 document personas:

```text
P01 clean junior DOCX
P03 Spanish DOCX
P04 sparse DOCX
P09 adversarial Job Description
```

For every persona the runner performs the actual HTTP/Docker workflow:

```text
GET /api/health
        ↓
POST /api/import-resume
        ↓
known-truth comparison
        ↓
POST /api/assess-opportunity
        ↓
POST /api/generate-resume
        ↓
forbidden-truth / JD-leakage check
        ↓
verify zero Ollama /api/chat calls during final assembly
        ↓
claim provenance check
        ↓
durable Career Vault assertion
        ↓
direct Redis read-after-write verification
        ↓
SystemAcceptanceReceipt
```

A failure stops the persona run and writes `accepted:false`; it is not averaged away by later personas.

### Evidence layout

Each run writes a timestamped directory under:

```text
evidence/system/runs/
```

Per persona, the runner preserves evidence such as:

```text
01-import-response.json
02-known-truth-evaluation.json
03-opportunity-assessment-response.json
04-generate-resume-response.json
05-final-resume-truth-evaluation.json
06-generation-ollama.log
07-career-vault-readback.json
08-ollama.log
09-app.log
receipt.json
```

These generated files are local characterization evidence until deliberately reviewed/versioned. Their existence alone is not a release PASS.

## 2. Full runtime observation

To measure the Docker stack while the persona harness executes:

```bash
npm run system:characterize:runtime
```

This wraps the same real persona flow and samples:

```text
app
ollama
redis
redis-http
```

at approximately one-second intervals.

The runtime observation records:

- CPU model and logical CPU count;
- host total memory;
- maximum observed memory per Docker service;
- maximum observed aggregate Docker memory;
- maximum observed CPU percentage per service;
- sample count and interval;
- persona evidence directory;
- characterization exit code.

Important: these are **sampled observations**, not mathematically exact peaks and not approved budgets.

No v0.1 code may infer minimum hardware from one observation.

## 3. Fault injection — P10

A fully READY baseline is required first.

Run:

```bash
npm run system:faults
```

P10 currently contains two promoted fault cases.

### local-ai-down

The harness stops Ollama and requires:

```text
HTTP 200
status = DEGRADED
trustedCoreAvailable = true
```

The expected degraded capabilities are the bounded AI-assisted paths. The service is restored in a `finally` boundary before the next scenario.

### durable-redis-down

The harness stops Redis and requires:

```text
HTTP 503
status = UNAVAILABLE
trustedCoreAvailable = false
```

Redis is restored before the script exits.

This distinction is deliberate: optional intelligence may degrade; a missing durability boundary cannot silently produce trusted durable success.

Fault evidence is written under:

```text
evidence/system/faults/
```

## 4. Docker cold-start characterization

v0.1 defines one non-destructive cold-start class:

```text
CONTAINERS_COLD_VOLUMES_RETAINED
```

Run:

```bash
npm run system:cold-start
```

Default repetitions: `3`.

Custom repetitions:

```bash
npm run system:cold-start -- --repetitions 5
```

The image is built once with exact runtime identity. Each repetition then performs:

```text
docker compose down
        ↓
identified docker compose up -d
        ↓
wait for READY
        ↓
verify exact build SHA
        ↓
verify release-qualifiable runtime profile
```

Volumes are retained. This is intentionally different from a fresh-install/model-download test.

`FRESH_INSTALL_COLD_START` remains uncharacterized and must not be implied by this receipt.

Cold-start latency is observational in v0.1; no readiness latency threshold exists yet.

## 5. Release evidence evaluation

After a persona run and P10 fault run exist:

```bash
npm run system:release-evaluate -- \
  --persona-run evidence/system/runs/<persona-run> \
  --fault-run evidence/system/faults/<fault-run>
```

Optionally include an identified three-or-more-attempt cold-start receipt:

```bash
npm run system:release-evaluate -- \
  --persona-run evidence/system/runs/<persona-run> \
  --fault-run evidence/system/faults/<fault-run> \
  --cold-start evidence/system/cold-start/<run>/cold-start-receipt.json
```

The evaluator can currently move evidence-backed criteria such as these to PASS:

```text
canonical-personas
failure-degradation
truth-invariants
durable-readback
build-identity
docker-cold-start
```

`truth-invariants` also requires operational generation provenance:

```text
provider = cv-engine-deterministic
model = source-preserving-resume-composer-v2
contractVersion = ats2-evidence-bound-resume-v2
```

Therefore a ResumeVersion that incorrectly claims Ollama generated the final artifact fails the gate even if its text looks correct.

## 6. Gates that remain intentionally blocked

The evaluator keeps these as `UNCHARACTERIZED` in v0.1:

```text
runtime-envelope
latency-budgets
```

Why:

- one runtime observation is not a support policy;
- observed latency is not a product SLO;
- an SLO should be selected from product/user requirements plus repeated runtime evidence;
- minimum hardware should then be derived by testing candidate runtime profiles against those approved budgets.

The required order is:

```text
measure
  ↓
repeat / compare profiles
  ↓
define product budgets
  ↓
validate profiles against budgets
  ↓
declare minimum supported runtime
```

Never invert this into `pick hardware → hope → increase timeout`.

## 7. Evidence handling rule

Generated evidence must identify:

- build SHA;
- architecture version;
- runtime profile;
- persona/fault/cold-start contract version;
- start/completion times;
- raw stage evidence;
- measurements;
- accepted/failed status.

A receipt from an unidentified build cannot qualify a release.

A receipt from one commit cannot qualify a different commit.

A failing receipt is valuable system evidence and must not be deleted merely to make a later dashboard green.

## v0.1 completion boundary

ATS-SYS-01D/E/F/H/I are implemented when the fixtures and runners exist. They become **characterized** only after the real Docker commands above are executed and their receipts are reviewed.

Until then the correct status is:

```text
HARNESS IMPLEMENTED
REAL CHARACTERIZATION PENDING
RELEASE QUALIFICATION BLOCKED
```
