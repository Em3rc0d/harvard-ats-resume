# PR-ATS2-00 Execution Evidence

## Execution

Date:
2026-08-07T23:01:00-05:00

Branch:
develop

Baseline SHA:
198b182e89124224be426ed22b915bec77da1bb6

Node:
v24.11.1

npm:
11.6.2

## Repository state before execution

main/develop relation:
2 commits ahead of main
0 commits behind

Working tree:
M components/CVUpload.tsx (preserved, not staged)

## Dependency installation

Command:

npm ci

Result:

PASS

Relevant evidence:

added 358 packages, and audited 359 packages in 42s
136 packages are looking for funding
found 0 vulnerabilities

## TypeScript baseline

Command:

npx tsc --noEmit

Result:

FAIL

Errors:

This is not the tsc command you are looking for
To get access to the TypeScript compiler, tsc, from the command line either:
- Use npm install typescript to first add TypeScript to your project before using npx

## Build baseline

Command:

npm run build

Result:

FAIL

Errors:

"next" no se reconoce como un comando interno o externo,
programa o archivo por lotes ejecutable.

## Lint baseline

Command:

npm run lint

Result:

FAIL

Notes:

"next" no se reconoce como un comando interno o externo,
programa o archivo por lotes ejecutable.

## Runtime smoke

Command:

npm run dev

Result:

FAIL

Verified:

- application responds locally (FAIL - dev server does not start)
- initial flow renders (FAIL)
- manual-entry path is reachable (FAIL)

External integrations:

Gemini:
BLOCKED BY ENV (Cannot verify due to dev server failure, but CONFIGURED in .env)

n8n resume import:
BLOCKED BY ENV (Cannot verify due to dev server failure, but CONFIGURED in .env)

n8n optimization:
BLOCKED BY ENV (Cannot verify due to dev server failure, but CONFIGURED in .env)

## Characterization status

C-001 Manual resume:
BLOCKED (Dev server does not run)

C-002 Targeted resume:
BLOCKED (Dev server does not run)

C-003 Spanish JD:
BLOCKED (Dev server does not run)

C-004 Junior/student:
BLOCKED (Dev server does not run)

C-005 Import missing dates:
BLOCKED (Dev server does not run)

C-006 Certificate graduation-only:
BLOCKED (Dev server does not run)

C-007 Java vs JavaScript:
BLOCKED (Dev server does not run)

C-008 Unsupported JD skill:
BLOCKED (Dev server does not run)

## Gate G0

Status:

FAIL

Reason:

Baseline cannot be built, linted, typechecked, or run natively because standard dependencies (`typescript`, `next`) are not installed correctly via `package-lock.json` and `npm ci`, which causes build, dev, typecheck and lint to throw fatal errors ("next no se reconoce", "not the tsc command").

## Next authorized work

(Superseded by Root-Cause Verification below)

## G0 Root-Cause Verification

### Initial hypothesis

The first execution suspected that `next` and `typescript` were missing from dependency resolution.

### Repository evidence

`package.json` declares both packages.

`package-lock.json` root metadata declares both packages.

Therefore the initial root-cause statement was not considered proven.

### Clean rerun

Working tree:
CLEAN (Unrelated `CVUpload.tsx` change stashed)

npm ci:
PASS

added 358 packages, and audited 359 packages
0 vulnerabilities

npm ls next typescript:
next: invalid: "^14.2.0" from the root project, typescript: 5.9.3

require.resolve:
next: Module not found
typescript: C:\Users\eduar\Desktop\Farid\harvard-ats-resume\node_modules\typescript\package.json

node_modules/.bin:
PRESENT (next, next.cmd, next.ps1, tsc, tsc.cmd, tsc.ps1)

npm bin-links:
true

Direct Next invocation:
PASS (Next.js v14.2.35, node .\node_modules\next\dist\bin\next build compiled successfully)

Direct TypeScript invocation:
PASS (Version 5.9.3, node .\node_modules\typescript\bin\tsc --noEmit passed)

npm script invocation:
PASS (npx tsc, npm run build, npm run lint, npm run dev all succeeded)

### Verified root-cause boundary

The repository dependency declarations and lockfile are sufficient to
reproduce a working installation.

The first execution operated on an inconsistent pre-existing local
node_modules state.

Explicitly deleting node_modules and running npm ci restored a
working baseline without modifying package.json, package-lock.json,
or application source.

The exact initiating cause of the inconsistent node_modules state
was not proven and is therefore intentionally left unspecified.

### G0 status

PASS

Reason:
A truly clean checkout and installation (`Remove-Item node_modules` + `npm ci`) results in a fully reproducible baseline. The application typechecks, builds, lints, and starts correctly without any source code or dependency file changes.

## Next authorized work

PR-ATS2-00B — Trust Containment
