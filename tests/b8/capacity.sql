\set ON_ERROR_STOP on

-- B8 bounded capacity smoke: 100 verified evidence rows must export and compose
-- deterministically within a generous CI ceiling. This is not a benchmark claim;
-- it is a release guard against pathological regressions.

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000909', false);

do $$
declare
  i integer;
begin
  for i in 1..100 loop
    perform * from public.cv_engine_create_career_evidence(
      'SKILL', 'MANUAL', 'VERIFIED', 'B8 capacity evidence ' || lpad(i::text, 3, '0'), null
    );
  end loop;
end;
$$;

do $$
declare
  v_started timestamptz := clock_timestamp();
  v_payload jsonb;
  v_elapsed interval;
begin
  v_payload := public.cv_engine_export_account();
  v_elapsed := clock_timestamp() - v_started;
  if jsonb_array_length(v_payload->'careerEvidence') <> 100 then
    raise exception 'B8_CAPACITY_EXPORT_COUNT_MISMATCH';
  end if;
  if v_elapsed > interval '10 seconds' then
    raise exception 'B8_CAPACITY_EXPORT_SLOW:%', v_elapsed;
  end if;
end;
$$;

do $$
declare
  v_started timestamptz := clock_timestamp();
  v_resume uuid;
  v_elapsed interval;
  v_claims integer;
begin
  select resume_version_id into v_resume
  from public.cv_engine_create_resume_version('GENERAL', null)
  limit 1;
  v_elapsed := clock_timestamp() - v_started;
  select count(*) into v_claims from public.resume_claims where resume_version_id = v_resume;
  if v_claims <> 100 then
    raise exception 'B8_CAPACITY_RESUME_CLAIM_COUNT_MISMATCH:%', v_claims;
  end if;
  if v_elapsed > interval '10 seconds' then
    raise exception 'B8_CAPACITY_RESUME_SLOW:%', v_elapsed;
  end if;
end;
$$;

select public.cv_engine_delete_account();
reset role;
