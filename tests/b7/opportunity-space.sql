\set ON_ERROR_STOP on

-- B3 fixture has already created one READY_NOW assessed Platform Engineer job for user A.
create temporary table b7_truth_before as
select (select count(*) from public.career_evidence) evidence_count,
       (select count(*) from public.career_evidence_revisions) revision_count;

-- Prepare a second immutable market-side JobSnapshot with no matching Career Evidence.
select E'Requirements:\n- Terraform is required.' description,
       '- Terraform is required.' req1 \gset jd2_
select public.cv_engine_sha256(:'jd2_description') raw_hash,
       public.cv_engine_sha256(:'jd2_req1') h1 \gset h2_
select public.cv_engine_sha256('TOOL'||chr(31)||'REQUIRED'||chr(31)||'terraform is required.'||chr(31)||:'h2_h1'||chr(31)||'0') k1 \gset k2_
select public.cv_engine_sha256('MANUAL_JOB_DESCRIPTION'||chr(31)||'infrastructure engineer'||chr(31)||''||chr(31)||:'h2_raw_hash'||chr(31)||'b2-deterministic-job-intelligence-v1'||chr(31)||:'k2_k1') sk \gset s2_

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';

select id ready_job_id from public.job_snapshots where owner_user_id=auth.uid() and role_title='Platform Engineer' order by created_at limit 1 \gset ready_
select snapshot_id incomplete_job_id from public.cv_engine_create_job_snapshot(
  :'s2_sk','Infrastructure Engineer','',:'jd2_description',:'h2_raw_hash','b2-deterministic-job-intelligence-v1',
  jsonb_build_array(
    jsonb_build_object('semanticKey',:'k2_k1','category','TOOL','importance','REQUIRED','canonicalConcept','Terraform is required.','sourceText',:'jd2_req1','sourceTextSha256',:'h2_h1','sourceOrdinal',0)
  )
) \gset incomplete_

create temporary table b7_incomplete_assessment as
select * from public.cv_engine_create_opportunity_assessment(:'incomplete_incomplete_job_id'::uuid);

create temporary table b7_ready_capture as
select * from public.cv_engine_capture_market_observation(:'ready_ready_job_id'::uuid);
create temporary table b7_ready_replay as
select * from public.cv_engine_capture_market_observation(:'ready_ready_job_id'::uuid);
create temporary table b7_incomplete_capture as
select * from public.cv_engine_capture_market_observation(:'incomplete_incomplete_job_id'::uuid);

create temporary table b7_ready_select as
select * from public.cv_engine_select_opportunity((select observation_id from b7_ready_capture));
create temporary table b7_ready_select_replay as
select * from public.cv_engine_select_opportunity((select observation_id from b7_ready_capture));
create temporary table b7_incomplete_select as
select * from public.cv_engine_select_opportunity((select observation_id from b7_incomplete_capture));

do $$
declare
  ready_observation uuid;
  ready_replay uuid;
  ready_replay_created boolean;
  ready_item uuid;
  ready_item_replay uuid;
  ready_item_replay_created boolean;
begin
  select observation_id into ready_observation from b7_ready_capture;
  select observation_id, created into ready_replay, ready_replay_created from b7_ready_replay;
  if ready_observation <> ready_replay or ready_replay_created then
    raise exception 'B7_MARKET_CAPTURE_REPLAY_NOT_IDEMPOTENT';
  end if;

  select space_item_id into ready_item from b7_ready_select;
  select space_item_id, created into ready_item_replay, ready_item_replay_created from b7_ready_select_replay;
  if ready_item <> ready_item_replay or ready_item_replay_created then
    raise exception 'B7_SELECTION_REPLAY_NOT_IDEMPOTENT';
  end if;

  if (select count(*) from public.market_observations where owner_user_id=auth.uid()) <> 2 then
    raise exception 'B7_MARKET_OBSERVATION_COUNT_MISMATCH';
  end if;
  if (select count(*) from public.opportunity_space_items where owner_user_id=auth.uid()) <> 2 then
    raise exception 'B7_SPACE_ITEM_COUNT_MISMATCH';
  end if;

  if not exists (
    select 1 from public.opportunity_space_items
    where id=ready_item and recommendation='READY_NOW' and decision='YES' and action='APPLY' and evidence_strength='STRONG'
  ) then raise exception 'B7_READY_NOW_ASSESSMENT_NOT_PRESERVED'; end if;

  if not exists (
    select 1 from public.opportunity_space_items
    where id=(select space_item_id from b7_incomplete_select)
      and recommendation='EVIDENCE_INCOMPLETE'
      and decision='NOT_YET'
      and action='CLARIFY_EVIDENCE'
  ) then raise exception 'B7_INCOMPLETE_ASSESSMENT_NOT_PRESERVED'; end if;

  if (select count(*) from public.career_evidence) <> (select evidence_count from b7_truth_before)
     or (select count(*) from public.career_evidence_revisions) <> (select revision_count from b7_truth_before) then
    raise exception 'B7_MARKET_FLOW_MUTATED_CANDIDATE_TRUTH';
  end if;
end $$;

-- Direct client writes and historical rewrites are forbidden.
do $$
begin
  begin
    insert into public.market_observations(owner_user_id,job_snapshot_id,job_snapshot_semantic_key,raw_description_sha256,role_title,company,observed_at,lifecycle_version)
    select auth.uid(),id,semantic_key,raw_description_sha256,role_title,company,captured_at,'b7-market-observation-v1'
    from public.job_snapshots where id=:'ready_ready_job_id'::uuid;
    raise exception 'B7_DIRECT_MARKET_INSERT_ACCEPTED';
  exception when insufficient_privilege then null; end;

  begin
    update public.market_observations set role_title='rewritten' where id=(select observation_id from b7_ready_capture);
    raise exception 'B7_HISTORICAL_REWRITE_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $$;

create temporary table b7_user_a_ids as
select (select observation_id from b7_ready_capture) observation_id,
       (select space_item_id from b7_ready_select) space_item_id,
       :'ready_ready_job_id'::uuid job_snapshot_id;

-- User B cannot see, capture, or select user A's market truth.
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000202';

do $$
declare ids record;
begin
  select * into ids from b7_user_a_ids;
  if exists (select 1 from public.market_observations where id=ids.observation_id) then raise exception 'B7_CROSS_USER_OBSERVATION_VISIBLE'; end if;
  if exists (select 1 from public.opportunity_space_items where id=ids.space_item_id) then raise exception 'B7_CROSS_USER_SPACE_ITEM_VISIBLE'; end if;

  begin
    perform * from public.cv_engine_capture_market_observation(ids.job_snapshot_id);
    raise exception 'B7_CROSS_USER_CAPTURE_ACCEPTED';
  exception when no_data_found then null; when sqlstate 'P0002' then null; end;

  begin
    perform * from public.cv_engine_select_opportunity(ids.observation_id);
    raise exception 'B7_CROSS_USER_SELECT_ACCEPTED';
  exception when no_data_found then null; when sqlstate 'P0002' then null; end;
end $$;

reset role;

-- Anonymous execution must remain denied.
set role anon;
do $$
declare ids record; begin
  select * into ids from b7_user_a_ids;
  begin
    perform * from public.cv_engine_capture_market_observation(ids.job_snapshot_id);
    raise exception 'B7_ANON_CAPTURE_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
