\set ON_ERROR_STOP on

-- Previous B9 physical contracts intentionally exercise account deletion.
-- Reseed this contract's independent owner fixture so B9.5 never depends on
-- execution order side effects from B9.1/B9.4.
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
select resume_artifact_id, created from public.cv_engine_create_resume_artifact(:'art_plan_resume_plan_id'::uuid) \gset art_first_

create temporary table b9_artifact_context as
select :'art_ev_evidence_id'::uuid evidence_id,
       :'art_plan_resume_plan_id'::uuid plan_id,
       :'art_first_resume_artifact_id'::uuid artifact_id;

do $$
declare v_content jsonb; v_manifest jsonb; v_receipts integer;
begin
  select content_json, manifest_json into v_content, v_manifest
  from public.resume_artifacts where id=(select artifact_id from b9_artifact_context);
  select count(*) into v_receipts from public.resume_artifact_receipts
  where resume_artifact_id=(select artifact_id from b9_artifact_context);
  if v_content#>>'{header,status}' <> 'UNAVAILABLE' then raise exception 'B9_ARTIFACT_INVENTED_HEADER'; end if;
  if v_content->'sections'->0->'entries'->0->>'renderedText' <> 'Built a deterministic pipeline.' then raise exception 'B9_ARTIFACT_TEXT_MISMATCH'; end if;
  if v_manifest->>'artifactVersion' <> 'b9-canonical-resume-artifact-v1' or v_receipts <> 1 then raise exception 'B9_ARTIFACT_PROVENANCE_MISSING'; end if;
end $$;

-- Same immutable plan is idempotent while current.
do $$
declare v_id uuid; v_created boolean;
begin
  select resume_artifact_id, created into v_id, v_created
  from public.cv_engine_create_resume_artifact((select plan_id from b9_artifact_context));
  if v_id <> (select artifact_id from b9_artifact_context) or v_created then
    raise exception 'B9_ARTIFACT_REPLAY_NOT_IDEMPOTENT';
  end if;
end $$;

-- Authenticated clients cannot bypass the RPC.
do $$
begin
  begin
    insert into public.resume_artifacts(owner_user_id,resume_plan_id,mode,source_plan_semantic_key,career_evidence_fingerprint_sha256,artifact_version,composer_version,renderer_contract_version,content_json,manifest_json,artifact_semantic_sha256)
    values(auth.uid(),(select plan_id from b9_artifact_context),'GENERAL',repeat('a',64),repeat('b',64),'b9-canonical-resume-artifact-v1','b9-deterministic-resume-composition-v2','b9-ats-safe-single-column-v1','{}','{}',repeat('c',64));
    raise exception 'B9_ARTIFACT_DIRECT_INSERT_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;

-- Cross-user read is denied.
reset role; set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000202';
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.resume_artifacts where id=(select artifact_id from b9_artifact_context);
  if v_count <> 0 then raise exception 'B9_ARTIFACT_CROSS_USER_READ_ALLOWED'; end if;
end $$;

-- Anonymous mutation is denied.
reset role; set role anon; set request.jwt.claim.sub = '';
do $$
begin
  begin
    perform * from public.cv_engine_create_resume_artifact((select plan_id from b9_artifact_context));
    raise exception 'B9_ARTIFACT_ANON_RPC_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;

-- Changing truth makes the old plan stale for NEW server-side artifact generation.
reset role; set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';
select * from public.cv_engine_revise_career_evidence(
  (select evidence_id from b9_artifact_context),1,'VERIFIED','Built a deterministic pipeline with durable provenance.',null
);
do $$
begin
  begin
    perform * from public.cv_engine_create_resume_artifact((select plan_id from b9_artifact_context));
    raise exception 'B9_STALE_PLAN_REGENERATED';
  exception when serialization_failure then null; end;
end $$;

-- Historical artifact remains readable/exportable after source truth changes.
do $$
declare v_export jsonb;
begin
  if not exists(select 1 from public.resume_artifacts where id=(select artifact_id from b9_artifact_context)) then
    raise exception 'B9_HISTORICAL_ARTIFACT_LOST';
  end if;
  v_export := public.cv_engine_export_account();
  if v_export->>'schemaVersion' <> 'b8-account-export-v1'
     or jsonb_array_length(v_export->'resumeArtifacts') <> 1
     or jsonb_array_length(v_export->'resumeArtifactReceipts') <> 1 then
    raise exception 'B9_ARTIFACT_ACCOUNT_EXPORT_FAILED';
  end if;
end $$;

select public.cv_engine_delete_account();
reset role;

do $$
begin
  if exists(select 1 from public.resume_artifacts where owner_user_id='00000000-0000-4000-8000-000000000101'::uuid)
     or exists(select 1 from public.resume_artifact_receipts where owner_user_id='00000000-0000-4000-8000-000000000101'::uuid) then
    raise exception 'B9_ARTIFACT_ACCOUNT_DELETE_FAILED';
  end if;
end $$;
