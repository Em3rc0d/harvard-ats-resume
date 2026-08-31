\set ON_ERROR_STOP on

-- Resolve User A's real target id before entering User B's RLS context and
-- carry it through a session-local custom setting so the PL/pgSQL attack uses
-- the actual foreign UUID rather than a value hidden by RLS.
reset role;
select set_config(
  'cvengine.test.foreign_target_id',
  (select id::text from public.career_targets
   where owner_user_id='00000000-0000-4000-8000-000000000101'::uuid
     and semantic_key=repeat('a',64)),
  false
);

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000202';
do $$ declare foreign_id uuid := current_setting('cvengine.test.foreign_target_id')::uuid; begin
  if (select count(*) from public.career_targets)<>0 then raise exception 'B2_TARGET_RLS_LEAK'; end if;
  if (select count(*) from public.job_snapshots)<>0 then raise exception 'B2_JOB_RLS_LEAK'; end if;
  if (select count(*) from public.job_requirements)<>0 then raise exception 'B2_REQUIREMENT_RLS_LEAK'; end if;
  begin
    perform * from public.cv_engine_activate_career_target(foreign_id);
    raise exception 'B2_CROSS_USER_ACTIVATION_ALLOWED';
  exception when no_data_found then null; end;
end $$;

reset role; set role anon; set request.jwt.claim.sub='';
do $$ declare foreign_id uuid := current_setting('cvengine.test.foreign_target_id')::uuid; begin
  begin
    perform * from public.cv_engine_activate_career_target(foreign_id);
    raise exception 'B2_ANON_RPC_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;

-- Database immutability survives even a privileged direct write attempt.
reset role;
do $$ declare id_ uuid; begin
  select id into id_ from public.job_snapshots limit 1;
  begin
    update public.job_snapshots set role_title='Changed' where id=id_;
    raise exception 'B2_JOB_SNAPSHOT_UPDATE_ALLOWED';
  exception when check_violation then null; end;
end $$;
reset role;
