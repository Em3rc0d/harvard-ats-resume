\set ON_ERROR_STOP on

reset role;
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000202')
on conflict do nothing;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';

select evidence_id from public.cv_engine_create_career_evidence(
  'PROJECT','MANUAL','VERIFIED','Built a deterministic pipeline.',null
) \gset art_ev_
select resume_plan_id from public.cv_engine_create_resume_plan('GENERAL', null, null) \gset art_plan_

create temporary table b9_artifact_plan_context as
select :'art_ev_evidence_id'::uuid evidence_id,
       :'art_plan_resume_plan_id'::uuid plan_id;

-- v2 fails closed without explicit profile authority.
do $$ begin
  begin
    perform * from public.cv_engine_create_resume_artifact((select plan_id from b9_artifact_plan_context));
    raise exception 'B9_ARTIFACT_CREATED_WITHOUT_PROFILE';
  exception when no_data_found then null; end;
end $$;

select revision_number, created from public.cv_engine_upsert_resume_profile(
  'Synthetic Candidate','Backend Engineer','Synthetic City',null,null,
  array['https://example.test/profile']::text[]
) \gset art_profile1_
select resume_artifact_id, created from public.cv_engine_create_resume_artifact(:'art_plan_resume_plan_id'::uuid) \gset art_first_

create temporary table b9_artifact_context as
select evidence_id,
       plan_id,
       :'art_first_resume_artifact_id'::uuid artifact_id
from b9_artifact_plan_context;

do $$ declare v_content jsonb; v_manifest jsonb; v_receipts integer; begin
  select content_json, manifest_json into v_content, v_manifest
  from public.resume_artifacts where id=(select artifact_id from b9_artifact_context);
  select count(*) into v_receipts from public.resume_artifact_receipts
  where resume_artifact_id=(select artifact_id from b9_artifact_context);
  if v_content#>>'{header,status}' <> 'AVAILABLE' then raise exception 'B9_ARTIFACT_PROFILE_HEADER_MISSING'; end if;
  if v_content#>>'{header,displayName}' <> 'Synthetic Candidate' then raise exception 'B9_ARTIFACT_PROFILE_NAME_MISMATCH'; end if;
  if v_content#>>'{header,headline}' <> 'Backend Engineer' then raise exception 'B9_ARTIFACT_PROFILE_HEADLINE_MISMATCH'; end if;
  if v_content#>>'{header,contactLines,0}' not like '%https://example.test/profile%' then raise exception 'B9_ARTIFACT_PROFILE_CONTACT_MISSING'; end if;
  if v_content->'sections'->0->'entries'->0->>'renderedText' <> 'Built a deterministic pipeline.' then raise exception 'B9_ARTIFACT_TEXT_MISMATCH'; end if;
  if v_manifest->>'artifactVersion' <> 'b9-canonical-resume-artifact-v2'
     or (v_manifest->>'resumeProfileRevision')::integer <> 1
     or coalesce(v_manifest->>'resumeProfileSemanticSha256','') !~ '^[0-9a-f]{64}$'
     or v_receipts <> 1 then raise exception 'B9_ARTIFACT_PROVENANCE_MISSING'; end if;
end $$;

-- Same plan/profile replay is exact and idempotent.
do $$ declare v_id uuid; v_created boolean; begin
  select resume_artifact_id, created into v_id, v_created
  from public.cv_engine_create_resume_artifact((select plan_id from b9_artifact_context));
  if v_id <> (select artifact_id from b9_artifact_context) or v_created then raise exception 'B9_ARTIFACT_REPLAY_NOT_IDEMPOTENT'; end if;
end $$;

-- Profile is RPC-owned and revisioned.
do $$ begin
  begin
    insert into public.resume_profile_revisions(owner_user_id,revision_number,display_name,links_json,semantic_sha256)
    values(auth.uid(),99,'Bypass','[]',repeat('a',64));
    raise exception 'B9_PROFILE_DIRECT_INSERT_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;

select revision_number, created from public.cv_engine_upsert_resume_profile(
  'Synthetic Candidate','Backend / Full Stack Engineer','Synthetic City',null,null,
  array['https://example.test/profile']::text[]
) \gset art_profile2_
select resume_artifact_id, created from public.cv_engine_create_resume_artifact(:'art_plan_resume_plan_id'::uuid) \gset art_second_

create temporary table b9_artifact_profile2_context as
select :'art_profile2_revision_number'::integer profile_revision,
       :'art_profile2_created'::boolean profile_created,
       :'art_second_resume_artifact_id'::uuid artifact_id,
       :'art_second_created'::boolean artifact_created;

do $$ declare v_first jsonb; v_second jsonb; v_profile record; begin
  select * into v_profile from b9_artifact_profile2_context;
  if v_profile.profile_revision <> 2 or not v_profile.profile_created then raise exception 'B9_PROFILE_REVISION_NOT_CREATED'; end if;
  if not v_profile.artifact_created or v_profile.artifact_id = (select artifact_id from b9_artifact_context) then raise exception 'B9_PROFILE_CHANGE_DID_NOT_CREATE_DISTINCT_ARTIFACT'; end if;
  select content_json into v_first from public.resume_artifacts where id=(select artifact_id from b9_artifact_context);
  select content_json into v_second from public.resume_artifacts where id=v_profile.artifact_id;
  if v_first#>>'{header,headline}' <> 'Backend Engineer' then raise exception 'B9_HISTORICAL_PROFILE_REWRITTEN'; end if;
  if v_second#>>'{header,headline}' <> 'Backend / Full Stack Engineer' then raise exception 'B9_NEW_PROFILE_NOT_BOUND'; end if;
end $$;

-- Cross-owner reads are hidden by RLS.
reset role; set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000202';
do $$ declare v_count integer; begin
  select count(*) into v_count from public.resume_artifacts where id=(select artifact_id from b9_artifact_context);
  if v_count <> 0 then raise exception 'B9_ARTIFACT_CROSS_USER_READ_ALLOWED'; end if;
  select count(*) into v_count from public.resume_profiles where owner_user_id='00000000-0000-4000-8000-000000000101'::uuid;
  if v_count <> 0 then raise exception 'B9_PROFILE_CROSS_USER_READ_ALLOWED'; end if;
end $$;

-- Anonymous RPC use is denied.
reset role; set role anon; set request.jwt.claim.sub = '';
do $$ begin
  begin
    perform * from public.cv_engine_upsert_resume_profile('Anon',null,null,null,null,array[]::text[]);
    raise exception 'B9_PROFILE_ANON_RPC_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;

-- New generation from stale Career Evidence is rejected, while history survives.
reset role; set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';
select * from public.cv_engine_revise_career_evidence(
  (select evidence_id from b9_artifact_context),1,'VERIFIED','Built a deterministic pipeline with durable provenance.',null
);
select revision_number from public.cv_engine_upsert_resume_profile(
  'Synthetic Candidate','Backend Platform Engineer','Synthetic City',null,null,
  array['https://example.test/profile']::text[]
) \gset art_profile3_
do $$ begin
  begin
    perform * from public.cv_engine_create_resume_artifact((select plan_id from b9_artifact_context));
    raise exception 'B9_STALE_PLAN_REGENERATED';
  exception when serialization_failure then null; end;
end $$;

do $$ declare v_export jsonb; begin
  v_export := public.cv_engine_export_account();
  if v_export->>'schemaVersion' <> 'b8-account-export-v1'
     or jsonb_array_length(v_export->'resumeProfiles') <> 1
     or jsonb_array_length(v_export->'resumeProfileRevisions') <> 3
     or jsonb_array_length(v_export->'resumeArtifacts') <> 2
     or jsonb_array_length(v_export->'resumeArtifactReceipts') <> 2 then
    raise exception 'B9_ARTIFACT_ACCOUNT_EXPORT_FAILED';
  end if;
end $$;

select public.cv_engine_delete_account();
reset role;
do $$ begin
  if exists(select 1 from public.resume_artifacts where owner_user_id='00000000-0000-4000-8000-000000000101'::uuid)
     or exists(select 1 from public.resume_profiles where owner_user_id='00000000-0000-4000-8000-000000000101'::uuid)
     or exists(select 1 from public.resume_profile_revisions where owner_user_id='00000000-0000-4000-8000-000000000101'::uuid) then
    raise exception 'B9_ARTIFACT_ACCOUNT_DELETE_FAILED';
  end if;
end $$;
