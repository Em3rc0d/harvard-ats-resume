# PR-ATS2-14H — Generation Readiness Boundary

## BEFORE

The G14G imported happy path shortened the workflow to `Upload → Career Review → Target → Generate`.

That exposed a previously hidden contract mismatch:

- native import intentionally preserves source-faithful partial data instead of inventing missing values
- the import runtime schema accepts empty/partial candidate leaves when the source does not provide them
- `/api/generate-resume` uses the stricter `resumeRequestSchema`
- the imported Target flow could therefore POST a draft that import accepted but generation rejected with a generic HTTP 400
- generation input validation happened after distributed rate limiting, so a stale/unreachable Upstash endpoint could add several seconds of irrelevant latency before the deterministic 400

The real field log also showed `getaddrinfo ENOTFOUND supreme-haddock-20550.upstash.io`. Rate limiting correctly fell back to memory, but the same environment variables back durable Career Vault persistence; G12 still forbids a memory fallback for Career Vault.

## INVARIANTS

- never invent missing candidate data merely to satisfy generation validation
- imported source data remains candidate asserted, not externally verified
- Job Description remains separate from candidate evidence
- Career Vault durability must continue to fail closed
- validation diagnostics may expose field paths/messages, never candidate values or full request bodies

## CHANGES

- added `GenerationReadiness` as an explicit application boundary over `resumeRequestSchema`
- Target Job evaluates candidate generation readiness before enabling generation
- incomplete drafts display exact field paths requiring candidate review
- `/api/generate-resume` validates JSON before touching distributed rate limiting
- invalid requests return structured `inputValidation` with path-safe diagnostics and a useful human-readable error
- server warning logs include only field paths and validation messages, not CV contents

## NON-GOALS

- no schema relaxation
- no automatic filling of missing dates, companies, education, metrics, or other facts
- no Career Vault memory fallback
- no attempt to repair operator Upstash credentials in code
- no date/language/stable-entity model migration

## FIELD NOTE

The previously captured real resume payload satisfies the visible `resumeRequestSchema`; therefore the new server diagnostics are intentionally retained even for candidates that appear ready client-side. A subsequent real field run must identify whether the observed 400 was caused by a different current draft, `sourceContext`, `careerVaultId`, or another request-level contract.

## EXPECTED GATE

Behavior suite before this PR: 76 tests.
This PR adds four regressions; expected total: **80**.
