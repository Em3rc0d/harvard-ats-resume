\set ON_ERROR_STOP on

-- User A creates verified candidate truth.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';

select evidence_id
from public.cv_engine_create_career_evidence(
  'PROJECT',
  'MANUAL',
  'VERIFIED',
  'Built a deterministic evidence pipeline.',
  null
)
\gset b9_

create temporary table b9_test_context (
  evidence_id uuid primary key,
  approved_proposal_id uuid,
  stale_proposal_id uuid
) on commit preserve rows;
insert into b9_test_context(evidence_id)
values (:'b9_evidence_id'::uuid);

-- A passing, source-bound proposal is durably recorded.
select presentation_revision_id, created
from public.cv_engine_record_presentation_proposal(
  :'b9_evidence_id'::uuid,
  1,
  'a94503c018b81e9489ccb0aa3bf63d711a7404bc3a97c0e46f92ac3d06b7af43',
  'Built and tested a deterministic evidence pipeline.',
  '5033a8566c827bc7a433780f614ff8bee8c2b52dcf74b55c979e468164fd6c43',
  'gemini',
  'gemini-3.5-flash-lite',
  'b6-ai-runtime-v1',
  1,
  false,
  'PLATFORM',
  'b9-physical-request-1',
  'b9-presentation-validator-v1',
  '{"status":"PASS","reasonCodes":[]}'::jsonb
)
\gset proposal_

update b9_test_context
set approved_proposal_id = :'proposal_presentation_revision_id'::uuid;

do $$
declare
  v_status text;
  v_owner uuid;
  v_count integer;
begin
  select status, owner_user_id into v_status, v_owner
  from public.presentation_revisions
  where id = (select approved_proposal_id from b9_test_context);

  select count(*) into v_count
  from public.presentation_revisions
  where owner_user_id = auth.uid();

  if v_status <> 'PROPOSED' or v_owner <> auth.uid() or v_count <> 1 then
    raise exception 'B9_INITIAL_READBACK_FAILED status=% owner=% count=%', v_status, v_owner, v_count;
  end if;
end;
$$;

-- Same semantic proposal is idempotent.
do $$
declare
  v_id uuid;
  v_created boolean;
begin
  select presentation_revision_id, created
    into v_id, v_created
  from public.cv_engine_record_presentation_proposal(
    (select evidence_id from b9_test_context),
    1,
    'a94503c018b81e9489ccb0aa3bf63d711a7404bc3a97c0e46f92ac3d06b7af43',
    'Built and tested a deterministic evidence pipeline.',
    '5033a8566c827bc7a433780f614ff8bee8c2b52dcf74b55c979e468164fd6c43',
    'gemini', 'gemini-3.5-flash-lite', 'b6-ai-runtime-v1', 1, false, 'PLATFORM',
    'b9-physical-request-replay', 'b9-presentation-validator-v1',
    '{"status":"PASS","reasonCodes":[]}'::jsonb
  );

  if v_created is distinct from false
     or v_id <> (select approved_proposal_id from b9_test_context) then
    raise exception 'B9_PROPOSAL_REPLAY_NOT_IDEMPOTENT id=% created=%', v_id, v_created;
  end if;
end;
$$;

-- Source hash mismatch is rejected atomically.
do $$
begin
  begin
    perform * from public.cv_engine_record_presentation_proposal(
      (select evidence_id from b9_test_context), 1,
      repeat('0', 64),
      'Built and tested a deterministic evidence pipeline.',
      '5033a8566c827bc7a433780f614ff8bee8c2b52dcf74b55c979e468164fd6c43',
      'gemini', 'gemini-3.5-flash-lite', 'b6-ai-runtime-v1', 1, false, 'PLATFORM',
      'b9-bad-source-hash', 'b9-presentation-validator-v1',
      '{"status":"PASS","reasonCodes":[]}'::jsonb
    );
    raise exception 'B9_BAD_SOURCE_HASH_ACCEPTED';
  exception
    when check_violation then null;
  end;
end;
$$;

-- Non-PASS validator output cannot become a durable proposal.
do $$
declare
  v_before integer;
  v_after integer;
begin
  select count(*) into v_before from public.presentation_revisions where owner_user_id = auth.uid();
  begin
    perform * from public.cv_engine_record_presentation_proposal(
      (select evidence_id from b9_test_context), 1,
      'a94503c018b81e9489ccb0aa3bf63d711a7404bc3a97c0e46f92ac3d06b7af43',
      'Built a deterministic evidence pipeline with 99% reliability.',
      repeat('1', 64),
      'gemini', 'gemini-3.5-flash-lite', 'b6-ai-runtime-v1', 1, false, 'PLATFORM',
      'b9-validator-reject', 'b9-presentation-validator-v1',
      '{"status":"REJECT","reasonCodes":["METRIC_ADDED"]}'::jsonb
    );
    raise exception 'B9_NON_PASS_VALIDATION_ACCEPTED';
  exception
    when check_violation then null;
  end;
  select count(*) into v_after from public.presentation_revisions where owner_user_id = auth.uid();
  if v_before <> v_after then
    raise exception 'B9_VALIDATION_REJECTION_NOT_ATOMIC before=% after=%', v_before, v_after;
  end if;
end;
$$;

-- Direct authenticated writes are denied; trusted mutations are RPC-only.
do $$
begin
  begin
    insert into public.presentation_revisions(
      owner_user_id, evidence_id, evidence_revision,
      source_text_sha256, proposed_text, proposed_text_sha256,
      capability, provider, model, provider_contract_version,
      provider_attempt, provider_fallback_used, provider_credential_mode,
      provider_request_id, validator_version, validation_result
    ) values (
      auth.uid(), (select evidence_id from b9_test_context), 1,
      repeat('a',64), 'Direct write must fail.', repeat('b',64),
      'INLINE_WORDING_OPTIMIZATION', 'gemini', 'x', 'x', 1, false, 'PLATFORM',
      'direct', 'b9-presentation-validator-v1', '{"status":"PASS","reasonCodes":[]}'::jsonb
    );
    raise exception 'B9_DIRECT_INSERT_ALLOWED';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- User B sees no User A presentation and cannot resolve it.
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000202';

do $$
declare
  v_visible integer;
begin
  select count(*) into v_visible
  from public.presentation_revisions
  where id = (select approved_proposal_id from b9_test_context);
  if v_visible <> 0 then
    raise exception 'B9_RLS_CROSS_USER_READ_ALLOWED';
  end if;

  begin
    perform * from public.cv_engine_resolve_presentation_revision(
      (select approved_proposal_id from b9_test_context), 'APPROVE'
    );
    raise exception 'B9_CROSS_USER_RESOLVE_ALLOWED';
  exception
    when no_data_found then null;
  end;
end;
$$;

-- Anonymous cannot execute trusted B9 mutation RPCs.
reset role;
set role anon;
set request.jwt.claim.sub = '';

do $$
begin
  begin
    perform * from public.cv_engine_resolve_presentation_revision(
      (select approved_proposal_id from b9_test_context), 'APPROVE'
    );
    raise exception 'B9_ANONYMOUS_RPC_ALLOWED';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- User A explicitly approves the first safe proposal.
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';

select *
from public.cv_engine_resolve_presentation_revision(
  (select approved_proposal_id from b9_test_context),
  'APPROVE'
);

do $$
declare
  v_status text;
  v_resolved timestamptz;
begin
  select status, resolved_at into v_status, v_resolved
  from public.presentation_revisions
  where id = (select approved_proposal_id from b9_test_context);
  if v_status <> 'APPROVED' or v_resolved is null then
    raise exception 'B9_APPROVAL_NOT_DURABLE status=% resolved=%', v_status, v_resolved;
  end if;

  begin
    perform * from public.cv_engine_resolve_presentation_revision(
      (select approved_proposal_id from b9_test_context), 'REJECT'
    );
    raise exception 'B9_DOUBLE_RESOLUTION_ALLOWED';
  exception
    when check_violation then null;
  end;
end;
$$;

-- Record another valid proposal before the source evidence changes.
select presentation_revision_id
from public.cv_engine_record_presentation_proposal(
  :'b9_evidence_id'::uuid,
  1,
  'a94503c018b81e9489ccb0aa3bf63d711a7404bc3a97c0e46f92ac3d06b7af43',
  'Built a deterministic evidence pipeline and tested it.',
  '428aba6198324bbf1e2e1fa731ad9a845f6c2120699953c68e58e40017a4dff0',
  'gemini', 'gemini-3.5-flash-lite', 'b6-ai-runtime-v1', 1, false, 'PLATFORM',
  'b9-stale-proposal', 'b9-presentation-validator-v1',
  '{"status":"PASS","reasonCodes":[]}'::jsonb
)
\gset stale_

update b9_test_context
set stale_proposal_id = :'stale_presentation_revision_id'::uuid;

-- Career Evidence changes to revision 2 after the proposal was made.
select *
from public.cv_engine_revise_career_evidence(
  :'b9_evidence_id'::uuid,
  1,
  'VERIFIED',
  'Built a deterministic evidence pipeline with durable provenance.',
  null
);

-- The old proposal cannot be approved against the new truth revision.
do $$
begin
  begin
    perform * from public.cv_engine_resolve_presentation_revision(
      (select stale_proposal_id from b9_test_context), 'APPROVE'
    );
    raise exception 'B9_STALE_PRESENTATION_APPROVED';
  exception
    when serialization_failure then null;
  end;
end;
$$;

-- Rejection of a stale proposal remains allowed so users can clear it explicitly.
select *
from public.cv_engine_resolve_presentation_revision(
  (select stale_proposal_id from b9_test_context),
  'REJECT'
);

-- Account export includes B9 durable state.
do $$
declare
  v_export jsonb;
  v_count integer;
begin
  v_export := public.cv_engine_export_account();
  v_count := jsonb_array_length(v_export->'presentationRevisions');
  if v_export->>'schemaVersion' <> 'b9-account-export-v1' or v_count <> 2 then
    raise exception 'B9_ACCOUNT_EXPORT_MISSING_PRESENTATION schema=% count=%', v_export->>'schemaVersion', v_count;
  end if;
end;
$$;

-- Account deletion must not be blocked by presentation FK state.
select public.cv_engine_delete_account();

reset role;

do $$
declare
  v_user_count integer;
  v_presentation_count integer;
begin
  select count(*) into v_user_count
  from auth.users
  where id = '00000000-0000-4000-8000-000000000101'::uuid;

  select count(*) into v_presentation_count
  from public.presentation_revisions
  where owner_user_id = '00000000-0000-4000-8000-000000000101'::uuid;

  if v_user_count <> 0 or v_presentation_count <> 0 then
    raise exception 'B9_ACCOUNT_DELETE_FAILED users=% presentations=%', v_user_count, v_presentation_count;
  end if;
end;
$$;
