\set ON_ERROR_STOP on

-- User A creates durable Career Evidence through the same invoker-security RPC.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';

select evidence_id
from public.cv_engine_create_career_evidence(
  'PROJECT',
  'MANUAL',
  'VERIFIED',
  'Built the B1 physical persistence gate.',
  null
)
\gset b1_

-- Readback and initial revision integrity.
do $$
declare
  v_count integer;
  v_revision integer;
begin
  select count(*), max(current_revision)
    into v_count, v_revision
  from public.career_evidence
  where owner_user_id = auth.uid();

  if v_count <> 1 or v_revision <> 1 then
    raise exception 'B1_INITIAL_READBACK_FAILED count=% revision=%', v_count, v_revision;
  end if;
end;
$$;

-- Revision 2 must preserve revision 1.
select *
from public.cv_engine_revise_career_evidence(
  :'b1_evidence_id'::uuid,
  1,
  'VERIFIED',
  'Built and physically tested the B1 persistence gate.',
  null
);

do $$
declare
  v_current integer;
  v_history integer;
begin
  select current_revision into v_current
  from public.career_evidence
  where id = :'b1_evidence_id'::uuid;

  select count(*) into v_history
  from public.career_evidence_revisions
  where evidence_id = :'b1_evidence_id'::uuid;

  if v_current <> 2 or v_history <> 2 then
    raise exception 'B1_REVISION_HISTORY_FAILED current=% history=%', v_current, v_history;
  end if;
end;
$$;

-- A stale expected revision must fail rather than silently overwrite.
do $$
begin
  begin
    perform * from public.cv_engine_revise_career_evidence(
      :'b1_evidence_id'::uuid,
      1,
      'VERIFIED',
      'This stale write must never win.',
      null
    );
    raise exception 'B1_STALE_REVISION_WAS_ACCEPTED';
  exception
    when serialization_failure then
      null;
  end;
end;
$$;

-- Invalid verification status must roll the whole create function back.
do $$
declare
  v_before integer;
  v_after integer;
begin
  select count(*) into v_before from public.career_evidence where owner_user_id = auth.uid();

  begin
    perform * from public.cv_engine_create_career_evidence(
      'PROJECT', 'MANUAL', 'BROKEN', 'Must roll back.', null
    );
    raise exception 'B1_INVALID_STATUS_WAS_ACCEPTED';
  exception
    when check_violation then
      null;
  end;

  select count(*) into v_after from public.career_evidence where owner_user_id = auth.uid();
  if v_before <> v_after then
    raise exception 'B1_ATOMIC_ROLLBACK_FAILED before=% after=%', v_before, v_after;
  end if;
end;
$$;

-- Job Description is market truth and cannot be created as Career Evidence.
do $$
declare
  v_before integer;
  v_after integer;
begin
  select count(*) into v_before from public.career_evidence where owner_user_id = auth.uid();

  begin
    perform * from public.cv_engine_create_career_evidence(
      'PROJECT', 'JOB_DESCRIPTION', 'UNVERIFIED', 'Must be rejected.', null
    );
    raise exception 'B1_JOB_DESCRIPTION_ENTERED_CANDIDATE_TRUTH';
  exception
    when check_violation then
      null;
  end;

  select count(*) into v_after from public.career_evidence where owner_user_id = auth.uid();
  if v_before <> v_after then
    raise exception 'B1_JOB_DESCRIPTION_ROLLBACK_FAILED before=% after=%', v_before, v_after;
  end if;
end;
$$;

-- User B must see none of User A's rows and cannot mutate them.
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000202';

do $$
declare
  v_visible integer;
  v_changed integer;
begin
  select count(*) into v_visible
  from public.career_evidence
  where id = :'b1_evidence_id'::uuid;

  if v_visible <> 0 then
    raise exception 'B1_RLS_CROSS_USER_READ_ALLOWED';
  end if;

  update public.career_evidence
  set current_revision = current_revision + 1
  where id = :'b1_evidence_id'::uuid;
  get diagnostics v_changed = row_count;

  if v_changed <> 0 then
    raise exception 'B1_RLS_CROSS_USER_UPDATE_ALLOWED';
  end if;

  delete from public.career_evidence
  where id = :'b1_evidence_id'::uuid;
  get diagnostics v_changed = row_count;

  if v_changed <> 0 then
    raise exception 'B1_RLS_CROSS_USER_DELETE_ALLOWED';
  end if;
end;
$$;

-- User B cannot use the revision RPC against User A's evidence.
do $$
begin
  begin
    perform * from public.cv_engine_revise_career_evidence(
      :'b1_evidence_id'::uuid,
      2,
      'VERIFIED',
      'Cross-user mutation must fail.',
      null
    );
    raise exception 'B1_RPC_CROSS_USER_REVISION_ALLOWED';
  exception
    when no_data_found then
      null;
  end;
end;
$$;

-- Anonymous callers cannot execute trusted mutation RPCs.
reset role;
set role anon;
set request.jwt.claim.sub = '';

do $$
begin
  begin
    perform * from public.cv_engine_create_career_evidence(
      'PROJECT', 'MANUAL', 'UNVERIFIED', 'Anonymous write.', null
    );
    raise exception 'B1_ANONYMOUS_RPC_ALLOWED';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

reset role;
