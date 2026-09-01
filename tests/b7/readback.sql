\set ON_ERROR_STOP on

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';

do $$
begin
  if (select count(*) from public.market_observations) <> 2 then
    raise exception 'B7_FRESH_READBACK_OBSERVATION_COUNT';
  end if;
  if (select count(*) from public.opportunity_space_items) <> 2 then
    raise exception 'B7_FRESH_READBACK_SPACE_COUNT';
  end if;
  if not exists (
    select 1 from public.market_observations mo
    join public.job_snapshots js on js.id=mo.job_snapshot_id and js.owner_user_id=mo.owner_user_id
    where mo.job_snapshot_semantic_key=js.semantic_key
      and mo.raw_description_sha256=js.raw_description_sha256
  ) then raise exception 'B7_MARKET_PROVENANCE_READBACK_FAILED'; end if;
  if exists (
    select 1 from public.opportunity_space_items osi
    join public.market_observations mo on mo.id=osi.market_observation_id and mo.owner_user_id=osi.owner_user_id
    join public.opportunity_assessments oa on oa.id=osi.opportunity_assessment_id and oa.owner_user_id=osi.owner_user_id
    where osi.job_snapshot_id is distinct from mo.job_snapshot_id
       or osi.job_snapshot_id is distinct from oa.job_snapshot_id
       or osi.assessment_semantic_key is distinct from oa.semantic_key
  ) then raise exception 'B7_SELECTION_PROVENANCE_DRIFT'; end if;
end $$;

reset role;
