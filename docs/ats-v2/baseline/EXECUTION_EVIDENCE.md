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

PR-ATS2-00B may begin only when G0 disposition is explicitly recorded.
