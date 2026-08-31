\set ON_ERROR_STOP on

select set_config('b3.test.owner_a_job', (
  select id::text from public.job_snapshots
  where owner_user_id='00000000-0000-4000-8000-000000000101'
  order by created_at limit 1
), false);

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000202';

do $$ begin
  if (select count(*) from public.match_reports) <> 0
     or (select count(*) from public.requirement_matches) <> 0
     or (select count(*) from public.opportunity_assessments) <> 0 then
    raise exception 'B3_RLS_CROSS_USER_READ_LEAK';
  end if;
end $$;

do $$ begin
  begin
    perform * from public.cv_engine_create_opportunity_assessment(current_setting('b3.test.owner_a_job')::uuid);
    raise exception 'B3_CROSS_USER_ASSESSMENT_ACCEPTED';
  exception when no_data_found then null; end;
end $$;

do $$ begin
  begin
    update public.opportunity_assessments set recommendation='READY_NOW';
    raise exception 'B3_DIRECT_ASSESSMENT_UPDATE_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set role anon;
set request.jwt.claim.sub='';
do $$ begin
  begin
    perform * from public.cv_engine_create_opportunity_assessment(current_setting('b3.test.owner_a_job')::uuid);
    raise exception 'B3_ANONYMOUS_RPC_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
