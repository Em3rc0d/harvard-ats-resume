# CV Engine — B7 Closure Receipt

Status: **CLOSED CANDIDATE — promotion exact-head certification required**

Node: **B7 — Opportunity Space / market extension**

B7 adds historical market observation and multi-opportunity comparison without weakening the product truth boundary. Market observations remain projections of immutable JobSnapshot truth; selected Opportunity Space items remain projections of immutable B3 OpportunityAssessment state.

## Contract realized

```text
immutable JobSnapshot
      ↓ capture
MarketObservation
      ↓ select only after deterministic B3 assessment
OpportunitySpaceItem
      ↓
deterministic multi-opportunity comparison
```

No B7 operation creates, upgrades, rewrites or infers Career Evidence.

## Closed invariants

```text
MARKET_OBSERVATION_DOMAIN                 PASS
JOB_SNAPSHOT_PROVENANCE                   PASS
MARKET_HISTORY_IMMUTABLE                  PASS
CAPTURE_REPLAY_IDEMPOTENT                 PASS
ASSESSMENT_REQUIRED_BEFORE_SELECTION      PASS
ASSESSMENT_JOB_IDENTITY_MATCH             PASS
ASSESSMENT_SEMANTIC_KEY_PRESERVED         PASS
SELECTION_REPLAY_IDEMPOTENT               PASS
MULTI_OPPORTUNITY_COMPARISON              PASS
DETERMINISTIC_CATEGORY_ORDERING           PASS
NO_HIRING_PROBABILITY                     PASS
NO_ATS_SCORE                              PASS
MARKET_FLOW_NEVER_MUTATES_CANDIDATE_TRUTH PASS
OWNER_SCOPED_RLS                          PASS
CROSS_USER_READ_DENIAL                    PASS
CROSS_USER_CAPTURE_DENIAL                 PASS
CROSS_USER_SELECTION_DENIAL               PASS
ANONYMOUS_RPC_DENIAL                      PASS
DIRECT_CLIENT_WRITE_DENIAL                PASS
HISTORICAL_REWRITE_DENIAL                 PASS
FRESH_CONNECTION_READBACK                 PASS
B1_B2_B3_B4_B5_REGRESSION                 PASS
B6_AI_REGRESSION                          PASS
CONSTRUCTION                              PASS
STATUS                                    CLOSED_CANDIDATE
```

## Controlled acquisition boundary

B7 does not introduce uncontrolled web scraping. A market observation can only be captured from Job Truth already represented by an owned immutable JobSnapshot. New or refreshed employer information must become a new JobSnapshot rather than silently rewriting historical market state.

## Comparison semantics

Comparison uses the signed B3 categorical states rather than invented probability theater:

```text
READY_NOW
STRONG_STRETCH
EVIDENCE_INCOMPLETE
BUILDABLE
LOW_ALIGNMENT
```

Evidence strength is used as the secondary deterministic ordering dimension. Opportunity Space therefore helps the user compare known evaluated opportunities without pretending to know a hiring probability.

## Evidence incident closed during qualification

The first physical B7 candidate failed because a temporary baseline receipt was created before switching the PostgreSQL session to the `authenticated` role, making that temporary relation inaccessible inside the later authenticated attack block. The fixture was corrected by capturing the baseline under the same role that executes the B7 flow. Product contracts and assertions were not weakened.

## Exact-head evidence

Final implementation head before promotion:

```text
6b9334ad87f1fbf08a90befd5f150642da5b17f9
```

The candidate produced exactly eight terminal GitHub Actions workflows on that head:

```text
CV Engine vNext Construction       SUCCESS
CV Engine B1 PostgreSQL Gate       SUCCESS
CV Engine B2 PostgreSQL Gate       SUCCESS
CV Engine B3 PostgreSQL Gate       SUCCESS
CV Engine B4 PostgreSQL Gate       SUCCESS
CV Engine B5 PostgreSQL Gate       SUCCESS
CV Engine B6 AI Runtime Gate       SUCCESS
CV Engine B7 PostgreSQL Gate       SUCCESS
```

There were zero failed workflows and zero pending/null conclusions on the exact candidate head.

## Physical B7 proof

The PostgreSQL gate constructs two owned assessed opportunities with different deterministic states, captures market observations, selects them into Opportunity Space and proves:

- capture replay is idempotent;
- selection replay is idempotent;
- READY_NOW and EVIDENCE_INCOMPLETE states are preserved exactly from B3;
- Career Evidence and Career Evidence revision counts are unchanged by the market flow;
- direct client inserts/rewrites are denied;
- User B cannot read/capture/select User A market state;
- anonymous RPC execution is denied;
- a fresh connection reads back consistent JobSnapshot and Assessment provenance.

## Promotion rule

B7 becomes authoritatively CLOSED only when the promotion head containing this receipt and the canonical ledger update passes all eight inherited/current gates on that same SHA.

After promotion certification:

```text
B7 = CLOSED
B8 = READY_TO_BUILD
RELEASE_READY = NO
```

Reopen B7 only under `docs/build/CLOSURE-PROTOCOL.md` when new contradictory executable evidence appears.
