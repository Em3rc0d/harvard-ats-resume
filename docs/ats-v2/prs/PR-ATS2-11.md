# PR-ATS2-11 — Runtime Resume Composition & Versioning

## Objective

Turn an already-approved generated resume from an ephemeral text response into an explicit ATS v2 runtime artifact with deterministic identity and complete claim provenance.

Before this gate, `ResumeVersion` and `ResumeManifest` existed in the domain model but were not wired into the production generation path. A successful `/api/generate-resume` response could therefore contain grounded resume text without materializing the text as a versioned domain artifact.

## Architecture

The successful generation path is now:

```text
Candidate Truth
  ↓
Job Intelligence + Match
  ↓
Structured AI proposal
  ↓
Deterministic Grounding
  ↓
Semantic Grounding
  ↓
Runtime Resume Composition
  ↓
ResumeClaim[]
  ↓
ResumeVersion + ResumeManifest
  ↓
HTTP 200
```

The composer runs only after both grounding layers approve the generated resume. It cannot rescue or override a grounding rejection.

## Version identity

Every runtime `ResumeVersion` is bound to:

- SHA-256 of the exact approved rendered resume text (`contentSha256`);
- SHA-256 of the target Job Description snapshot when a target exists;
- candidate profile identifier;
- target Job Description identifier when present;
- MatchReport identifier when one was produced;
- generation provider;
- generation model;
- generation contract version;
- the generated ResumeClaim identifiers included in the version.

The version identifier is deterministic from the rendered content hash and target-job snapshot hash. The same approved content against the same target reuses the same logical version identity across runtime attempts; changing the target changes the version identity even if the rendered text is unchanged.

## Claim provenance

The new `ResumeCompositionService` extracts material candidate-content lines from the approved rendered resume and attempts to link each line to existing `CareerAssertion`s.

It deliberately excludes presentation-only material such as the candidate-name line, standard section headings, contact links/emails, and date-only lines.

For each material generated line:

1. candidate assertions are normalized and compared using conservative token overlap;
2. equivalent delivery/leadership/design/architecture/ownership action families are canonicalized for provenance matching;
3. one generated line may reference multiple assertions when necessary, such as a combined skills line;
4. a `ResumeClaim` is registered only with existing assertion identifiers;
5. `ResumeManifest` records the complete assertion set for that claim and continues to enforce `INV-006`.

If any material generated wording cannot be traced to candidate assertions, composition fails and the API returns HTTP 422 with `composition.status = UNTRACEABLE`. No `ResumeVersion` is emitted.

Job Description content and MatchReport inference remain target/inference artifacts and are never accepted as candidate evidence.

## Runtime API output

Successful generation responses now include:

- `resumeVersion`
- `resumeManifest`
- `resumeClaims`
- `resumePersistence: EPHEMERAL_RUNTIME`

The explicit persistence marker is important: this PR materializes the domain objects in the successful request path but does **not** persist them to durable storage.

## Generation metadata

`GeminiResumeProvider` now exports the generation identity used by version records:

- provider: `google-gemini`
- model: `gemini-2.5-flash`
- contract version: `ats2-structured-resume-v1`

This prevents a version record from losing the identity of the generation contract that produced its rendered content.

## Incidents found during execution

### CI attempt 1 — domain fixture migration

The strengthened `ResumeVersion` contract correctly caused TypeScript to reject the original domain roundtrip fixture because that fixture did not provide the new required `contentSha256` and generation metadata.

The fixture was migrated to the new contract. The production type was not weakened.

The failure was contained to the feature branch and never reached `develop`.

### Post-green hardening — presentation-line assumption

After the first fully green run, review identified that the composer initially skipped the first two non-empty lines as presentation metadata. A valid resume without a contact line could therefore lose its summary from the manifest.

The logic was hardened to skip only the first identity line and detect contact lines by their actual content. A regression test now proves that a summary remains traceable when the contact line is omitted.

## Behavioral verification

The dedicated ATS2-11 suite verifies:

1. approved resume content materializes as a content-addressed version with complete claim provenance;
2. identical content + identical target produce deterministic version identity across runtime attempts;
3. changing the target changes version identity even if rendered content is unchanged;
4. a combined generated skills line preserves all supporting assertion IDs;
5. a summary remains in the claim manifest when the resume has no contact line;
6. untraceable generated wording is refused rather than versioned.

The final executable head before this documentation record was `7d4d918f820ee73a51fb4185f2bb590b43c31bcb`.

GitHub Actions run `31536867968` passed:

- `npm ci` — PASS
- lint — PASS
- typecheck — PASS
- ATS v2 behavior tests — PASS (`32/32`)
- G10 controlled match benchmark remained PASS (`42/42`, zero false MATCH/GAP in the controlled corpus)
- production build — PASS

Vercel preview — READY.

## Trust wording

This gate means a successful generated resume is now materialized at runtime as a content-addressed `ResumeVersion` whose material generated claims have a complete `ResumeManifest` back to candidate assertions.

It does **not** mean resume versions survive process/request lifetime, support history queries, synchronization, deletion, retention, or multi-device access. Those capabilities require the persistence/Career Vault gate.

## Gate

`G11 RUNTIME_RESUME_VERSIONING — PASS (CONTENT-ADDRESSED + FULL CLAIM PROVENANCE), PERSISTENCE NOT YET CLAIMED`

## Next architectural frontier

The next implementation frontier is durable persistence / Career Vault: repositories and storage for candidate truth, source receipts, assertions, jobs, match reports, claims, versions, and manifests while preserving the existing truth boundaries.
