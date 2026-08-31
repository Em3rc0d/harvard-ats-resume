#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

USER_A="00000000-0000-4000-8000-000000000101"

psql_cmd() {
  psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 "$@"
}

EVIDENCE_ID="$(psql_cmd -c "
  set role authenticated;
  set request.jwt.claim.sub = '$USER_A';
  select evidence_id
  from public.cv_engine_create_career_evidence(
    'ACHIEVEMENT', 'MANUAL', 'VERIFIED',
    'Concurrency gate seed.', null
  );
")"

if [[ -z "$EVIDENCE_ID" ]]; then
  echo "B1_CONCURRENCY_SEED_FAILED" >&2
  exit 1
fi

run_revision() {
  local text="$1"
  psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 -c "
    set role authenticated;
    set request.jwt.claim.sub = '$USER_A';
    select revision_number
    from public.cv_engine_revise_career_evidence(
      '$EVIDENCE_ID'::uuid, 1, 'VERIFIED', '$text', null
    );
  "
}

set +e
run_revision "Concurrent writer A." > /tmp/b1-writer-a.out 2> /tmp/b1-writer-a.err &
PID_A=$!
run_revision "Concurrent writer B." > /tmp/b1-writer-b.out 2> /tmp/b1-writer-b.err &
PID_B=$!

wait "$PID_A"
STATUS_A=$?
wait "$PID_B"
STATUS_B=$?
set -e

SUCCESS_COUNT=0
[[ "$STATUS_A" -eq 0 ]] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
[[ "$STATUS_B" -eq 0 ]] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))

if [[ "$SUCCESS_COUNT" -ne 1 ]]; then
  echo "B1_CONCURRENT_REVISION_EXPECTED_ONE_WINNER status_a=$STATUS_A status_b=$STATUS_B" >&2
  cat /tmp/b1-writer-a.err >&2 || true
  cat /tmp/b1-writer-b.err >&2 || true
  exit 1
fi

READBACK="$(psql_cmd -c "
  set role authenticated;
  set request.jwt.claim.sub = '$USER_A';
  select e.current_revision || ':' || count(r.id)
  from public.career_evidence e
  join public.career_evidence_revisions r on r.evidence_id = e.id
  where e.id = '$EVIDENCE_ID'::uuid
  group by e.current_revision;
")"

if [[ "$READBACK" != "2:2" ]]; then
  echo "B1_CONCURRENT_REVISION_INTEGRITY_FAILED readback=$READBACK" >&2
  exit 1
fi

echo "B1_CONCURRENT_REVISION_RACE PASS evidence_id=$EVIDENCE_ID"
