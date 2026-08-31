\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';
do $$
declare v_targets integer; v_active integer; v_jobs integer; v_requirements integer;
begin
  select count(*), count(*) filter (where is_active) into v_targets, v_active from public.career_targets;
  select count(*) into v_jobs from public.job_snapshots;
  select count(*) into v_requirements from public.job_requirements;
  if v_targets <> 2 or v_active <> 1 or v_jobs <> 1 or v_requirements <> 2 then
    raise exception 'B2_FRESH_READBACK_FAILED targets=% active=% jobs=% requirements=%', v_targets, v_active, v_jobs, v_requirements;
  end if;
end $$;
reset role;
