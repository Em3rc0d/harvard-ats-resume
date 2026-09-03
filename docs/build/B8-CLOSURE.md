# CV Engine — B8 Release Hardening Closure

Status: **CLOSED**

## Closure authority

- Contract: `REBUILD-CONTRACT.md` B8 release-hardening scope
- Closure policy: `docs/build/CLOSURE-PROTOCOL.md`
- Production implementation SHA: `fa331f9b88c1f5a0d9e4ef3fa4960a4fd3394989`
- Production domain: `https://harvard-ats-resume.vercel.app`

## Why this receipt exists

B8 is closed on the release-hardening contract that existed before B9 was accepted. B9 is a downstream product-scope extension and does not retroactively invalidate B8's security/runtime/lifecycle evidence.

## Executable / physical evidence

```text
EXACT_PRODUCTION_SHA                     PASS
VERCEL_PRODUCTION_READY                  PASS
SUPABASE_CONFIGURED                      PASS
PLATFORM_GEMINI_CONFIGURED               PASS
INHERITED_GITHUB_GATES                   PASS
B8_RELEASE_GATE                          PASS
BROWSER_PRODUCTION_E2E                   PASS
CAREER_EVIDENCE_FLOW                     PASS
DOCX_IMPORT_AND_REVIEW                    PASS
CAREER_TARGET_FLOW                       PASS
JOB_TRUTH_FLOW                           PASS
ASSESSMENT_FLOW                          PASS
OPPORTUNITY_SPACE_FLOW                   PASS
GENERAL_RESUME_VERSION                   PASS
TARGETED_RESUME_VERSION                  PASS
TEXT_EXPORT                              PASS
PROVENANCE_JSON_EXPORT                   PASS
RETURNING_USER_RELOAD                    PASS
ACCOUNT_EXPORT                           PASS
ACCOUNT_DELETE                           PASS
POST_DELETE_SESSION_DENIAL               PASS
PRODUCTION_5XX_DURING_FINAL_E2E           0
SYNTHETIC_CERTIFICATION_USERS_REMAINING   0
```

Final browser certification:

```text
GitHub Actions run: 33804027248
job: production-browser-e2e
result: success
artifact: cvengine-production-certification-33804027248
artifact digest: sha256:be6c080f72b77035366b23bc2fa62ad3b7e0079ffb73a2bd664f7ca03b163b05
```

The browser journey physically exercised Production and produced successful runtime logs including:

```text
POST   /api/consent                         201
POST   /api/career/evidence                 201
POST   /api/imports/resume                  201
POST   /api/imports/proposals/.../accept    201
POST   /api/career/targets                  201
POST   /api/jobs                            201
POST   /api/assessments                     201
POST   /api/opportunity-space               201
POST   /api/resumes                         201
GET    /api/resumes/.../export              200
GET    /api/account/export                  200
DELETE /api/account/delete                  200
GET    /api/session after deletion          401
```

## Regressions found during certification

B8 certification was not treated as a ceremonial gate. Real browser use exposed and forced correction of:

- signup confirmation redirect routing;
- misleading material UI defaults;
- returning-user onboarding restoration;
- auth callback open redirect;
- authenticated API error semantics;
- account error leakage;
- Production Career Target readback timestamp normalization.

The final Production SHA includes the fixes required by the successful browser receipt.

## Known limitation now moved downstream

B8 proves the trusted-core product path through deterministic ResumeVersion and text/provenance export. It does **not** prove the stronger product promise that a raw uploaded CV is professionally rewritten, editorially composed and exported as a polished DOCX/PDF.

That accepted product-scope extension is owned by B9 Presentation Engine.

## Closure equation

```text
CONTRACT_SIGNED                    PASS
IMPLEMENTED                        PASS
WIRED                              PASS
EXECUTABLY_TESTED                  PASS
PHYSICALLY_PROVEN_WHERE_REQUIRED  PASS
NO_OPEN_B8_CONTRADICTIONS          PASS
STATUS                             CLOSED
```
