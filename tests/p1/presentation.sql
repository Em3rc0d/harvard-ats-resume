\set ON_ERROR_STOP on

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';

select evidence_id from public.cv_engine_create_career_evidence(
  'PROJECT','MANUAL','VERIFIED','Built Java and Spring Boot REST APIs for internal systems.',null
) \gset ev_api_
select evidence_id from public.cv_engine_create_career_evidence(
  'SKILL','MANUAL','VERIFIED','Docker container delivery',null
) \gset ev_docker_
select evidence_id from public.cv_engine_create_career_evidence(
  'ACHIEVEMENT','MANUAL','NEEDS_REVIEW','Unverified claim that must never enter a trusted presentation.',null
) \gset ev_unverified_

select set_config('p1.ev_api_id', :'ev_api_evidence_id', false);
select set_config('p1.ev_docker_id', :'ev_docker_evidence_id', false);
select set_config('p1.ev_unverified_id', :'ev_unverified_evidence_id', false);

select * from public.cv_engine_create_presentation_plan(
  'GENERAL', null, null, null,
  jsonb_build_array(
    jsonb_build_object('evidenceId', :'ev_api_evidence_id', 'evidenceRevision', 1),
    jsonb_build_object('evidenceId', :'ev_docker_evidence_id', 'evidenceRevision', 1)
  ),
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'sectionKey','experience','ordinal',1,
      'evidenceRefs',jsonb_build_array(
        jsonb_build_object('evidenceId', :'ev_api_evidence_id', 'evidenceRevision', 1),
        jsonb_build_object('evidenceId', :'ev_docker_evidence_id', 'evidenceRevision', 1)
      )
    )
  )
) \gset plan_

select set_config('p1.plan_id', :'plan_presentation_plan_id', false);
select set_config('p1.plan_sha', :'plan_plan_sha256', false);

do $$
begin
  if not exists (
    select 1 from public.presentation_plans
    where id=current_setting('p1.plan_id')::uuid
      and owner_user_id='00000000-0000-4000-8000-000000000101'::uuid
      and mode='GENERAL'
      and plan_sha256=current_setting('p1.plan_sha')
  ) then raise exception 'P1_PLAN_NOT_DURABLE'; end if;

  if (select count(*) from public.presentation_plan_evidence where plan_id=current_setting('p1.plan_id')::uuid and selection='SELECTED') <> 2 then
    raise exception 'P1_PLAN_EVIDENCE_RECEIPTS_MISSING';
  end if;
end $$;

-- An unverified revision cannot enter selected trusted presentation evidence.
do $$
begin
  begin
    perform * from public.cv_engine_create_presentation_plan(
      'GENERAL',null,null,null,
      jsonb_build_array(jsonb_build_object('evidenceId', current_setting('p1.ev_unverified_id'), 'evidenceRevision', 1)),
      '[]'::jsonb,
      jsonb_build_array(jsonb_build_object('sectionKey','experience','ordinal',1,'evidenceRefs',jsonb_build_array(jsonb_build_object('evidenceId', current_setting('p1.ev_unverified_id'), 'evidenceRevision', 1))))
    );
    raise exception 'P1_UNVERIFIED_EVIDENCE_WAS_ACCEPTED';
  exception when others then
    if sqlerrm <> 'P1_SELECTED_EVIDENCE_NOT_VERIFIED' then raise; end if;
  end;
end $$;

-- Source-exact revisions are accepted by deterministic validation but still need explicit approval.
select * from public.cv_engine_create_presentation_revision(
  :'plan_presentation_plan_id'::uuid,
  'CLAIM',
  jsonb_build_array(jsonb_build_object('evidenceId', :'ev_api_evidence_id', 'evidenceRevision', 1)),
  'Built Java and Spring Boot REST APIs for internal systems.',
  '{}'::text[],
  'DETERMINISTIC'
) \gset exact_

select set_config('p1.exact_revision_id', :'exact_presentation_revision_id', false);

do $$
begin
  if not exists (
    select 1 from public.presentation_revisions
    where id=current_setting('p1.exact_revision_id')::uuid
      and status='PROPOSED'
      and semantic_status='SOURCE_EXACT'
      and overall_status='ACCEPTED'
      and approved_by_user_at is null
  ) then raise exception 'P1_SOURCE_EXACT_STATE_INVALID'; end if;
end $$;

select * from public.cv_engine_approve_presentation_revision(:'exact_presentation_revision_id'::uuid);

do $$
begin
  if not exists (
    select 1 from public.presentation_revisions
    where id=current_setting('p1.exact_revision_id')::uuid
      and status='APPROVED'
      and semantic_status='SOURCE_EXACT'
      and overall_status='ACCEPTED'
      and approved_by_user_at is not null
  ) then raise exception 'P1_SOURCE_EXACT_APPROVAL_FAILED'; end if;
end $$;

-- A safe rewrite remains REVIEW_REQUIRED until the user explicitly approves it.
select * from public.cv_engine_create_presentation_revision(
  :'plan_presentation_plan_id'::uuid,
  'CLAIM',
  jsonb_build_array(jsonb_build_object('evidenceId', :'ev_api_evidence_id', 'evidenceRevision', 1)),
  'Built REST APIs with Java and Spring Boot for internal systems.',
  array['CLARITY','REORDER'],
  'USER_EDIT'
) \gset rewrite_

select set_config('p1.rewrite_revision_id', :'rewrite_presentation_revision_id', false);

do $$
begin
  if not exists (
    select 1 from public.presentation_revisions
    where id=current_setting('p1.rewrite_revision_id')::uuid
      and deterministic_status='PASS'
      and semantic_status='REVIEW_REQUIRED'
      and overall_status='REVIEW_REQUIRED'
      and status='PROPOSED'
  ) then raise exception 'P1_REWRITE_REVIEW_STATE_INVALID'; end if;
end $$;

select * from public.cv_engine_approve_presentation_revision(:'rewrite_presentation_revision_id'::uuid);

do $$
begin
  if not exists (
    select 1 from public.presentation_revisions
    where id=current_setting('p1.rewrite_revision_id')::uuid
      and status='APPROVED'
      and semantic_status='MANUAL_EVIDENCE_REVIEW_PASS'
      and overall_status='ACCEPTED'
      and approved_by_user_at is not null
  ) then raise exception 'P1_EXPLICIT_REWRITE_APPROVAL_FAILED'; end if;

  if not exists (
    select 1 from public.presentation_revision_evidence revision_evidence
    where revision_evidence.presentation_revision_id=current_setting('p1.rewrite_revision_id')::uuid
      and revision_evidence.evidence_id=current_setting('p1.ev_api_id')::uuid
      and revision_evidence.evidence_revision=1
      and revision_evidence.evidence_text_sha256=(
        select plan_evidence.evidence_text_sha256
        from public.presentation_plan_evidence plan_evidence
        where plan_evidence.plan_id=current_setting('p1.plan_id')::uuid
          and plan_evidence.selection='SELECTED'
          and plan_evidence.evidence_id=current_setting('p1.ev_api_id')::uuid
          and plan_evidence.evidence_revision=1
      )
  ) then raise exception 'P1_REWRITE_PROVENANCE_MISSING'; end if;
end $$;

-- Once approved, neither wording nor status can be rewritten.
reset role;
do $$
begin
  begin
    update public.presentation_revisions
      set proposed_text='tampered'
      where id=current_setting('p1.rewrite_revision_id')::uuid;
    raise exception 'P1_APPROVED_REVISION_MUTATED';
  exception when others then
    if sqlerrm <> 'P1_PRESENTATION_REVISION_IMMUTABLE' then raise; end if;
  end;
end $$;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';

-- Unsupported numbers are rejected inside the database RPC, not trusted from client-side validation.
do $$
begin
  begin
    perform * from public.cv_engine_create_presentation_revision(
      current_setting('p1.plan_id')::uuid,'CLAIM',
      jsonb_build_array(jsonb_build_object('evidenceId', current_setting('p1.ev_api_id'), 'evidenceRevision', 1)),
      'Built Java APIs that reduced latency by 35%.',array['CLARITY'],'USER_EDIT'
    );
    raise exception 'P1_UNSUPPORTED_NUMBER_ACCEPTED';
  exception when others then
    if sqlerrm <> 'P1_UNSUPPORTED_QUANTITATIVE_TOKEN:35%' then raise; end if;
  end;
end $$;

-- Punctuation must not bypass unsupported strengthening detection.
do $$
begin
  begin
    perform * from public.cv_engine_create_presentation_revision(
      current_setting('p1.plan_id')::uuid,'CLAIM',
      jsonb_build_array(jsonb_build_object('evidenceId', current_setting('p1.ev_api_id'), 'evidenceRevision', 1)),
      'Led, and architected Java and Spring Boot REST APIs for internal systems.',array['ACTIVE_VOICE'],'USER_EDIT'
    );
    raise exception 'P1_UNSUPPORTED_STRENGTHENING_ACCEPTED';
  exception when others then
    if sqlerrm not in ('P1_UNSUPPORTED_STRENGTHENING:led','P1_UNSUPPORTED_STRENGTHENING:architected') then raise; end if;
  end;
end $$;

-- Build a TARGETED context whose market truth includes Kubernetes while candidate evidence does not.
-- canonicalConcept intentionally contains extra words to ensure market token extraction is not phrase-literal.
select E'Requirements:\n- Kubernetes\n- Docker' description,
       '- Kubernetes' req1,
       '- Docker' req2 \gset p1jd_
select public.cv_engine_sha256(:'p1jd_description') raw_hash,
       public.cv_engine_sha256(:'p1jd_req1') h1,
       public.cv_engine_sha256(:'p1jd_req2') h2 \gset p1h_
select public.cv_engine_sha256('TOOL'||chr(31)||'REQUIRED'||chr(31)||'kubernetes is required.'||chr(31)||:'p1h_h1'||chr(31)||'0') k1,
       public.cv_engine_sha256('TOOL'||chr(31)||'PREFERRED'||chr(31)||'docker'||chr(31)||:'p1h_h2'||chr(31)||'1') k2 \gset p1k_
select public.cv_engine_sha256('MANUAL_JOB_DESCRIPTION'||chr(31)||'platform engineer'||chr(31)||''||chr(31)||:'p1h_raw_hash'||chr(31)||'b2-deterministic-job-intelligence-v1'||chr(31)||:'p1k_k1'||','||:'p1k_k2') sk \gset p1s_
select snapshot_id from public.cv_engine_create_job_snapshot(
  :'p1s_sk','Platform Engineer','',:'p1jd_description',:'p1h_raw_hash','b2-deterministic-job-intelligence-v1',
  jsonb_build_array(
    jsonb_build_object('semanticKey',:'p1k_k1','category','TOOL','importance','REQUIRED','canonicalConcept','Kubernetes is required.','sourceText',:'p1jd_req1','sourceTextSha256',:'p1h_h1','sourceOrdinal',0),
    jsonb_build_object('semanticKey',:'p1k_k2','category','TOOL','importance','PREFERRED','canonicalConcept','Docker','sourceText',:'p1jd_req2','sourceTextSha256',:'p1h_h2','sourceOrdinal',1)
  )
) \gset p1job_
select assessment_id from public.cv_engine_create_opportunity_assessment(:'p1job_snapshot_id'::uuid) \gset p1assessment_

select * from public.cv_engine_create_presentation_plan(
  'TARGETED',null,:'p1job_snapshot_id'::uuid,:'p1assessment_assessment_id'::uuid,
  jsonb_build_array(jsonb_build_object('evidenceId', :'ev_docker_evidence_id', 'evidenceRevision', 1)),
  '[]'::jsonb,
  jsonb_build_array(jsonb_build_object('sectionKey','skills','ordinal',1,'evidenceRefs',jsonb_build_array(jsonb_build_object('evidenceId', :'ev_docker_evidence_id', 'evidenceRevision', 1))))
) \gset targeted_

select set_config('p1.targeted_plan_id', :'targeted_presentation_plan_id', false);

-- Market truth must not backfill candidate truth, even with punctuation around the keyword.
do $$
begin
  begin
    perform * from public.cv_engine_create_presentation_revision(
      current_setting('p1.targeted_plan_id')::uuid,'CLAIM',
      jsonb_build_array(jsonb_build_object('evidenceId', current_setting('p1.ev_docker_id'), 'evidenceRevision', 1)),
      'Docker and Kubernetes, container delivery',array['KEYWORD_ALIGNMENT'],'USER_EDIT'
    );
    raise exception 'P1_MARKET_TERM_PROMOTED';
  exception when others then
    if sqlerrm <> 'P1_MARKET_TERM_PROMOTED_TO_CANDIDATE:kubernetes' then raise; end if;
  end;
end $$;

-- Multi-evidence summaries retain exact revision snapshots.
select * from public.cv_engine_create_presentation_revision(
  :'plan_presentation_plan_id'::uuid,'SUMMARY',
  jsonb_build_array(
    jsonb_build_object('evidenceId', :'ev_api_evidence_id', 'evidenceRevision', 1),
    jsonb_build_object('evidenceId', :'ev_docker_evidence_id', 'evidenceRevision', 1)
  ),
  'Developer with experience building Java and Spring Boot REST APIs and Docker container delivery.',
  array['SUMMARY_SYNTHESIS','CONCISION'],'USER_EDIT'
) \gset summary_

select set_config('p1.summary_revision_id', :'summary_presentation_revision_id', false);
select * from public.cv_engine_approve_presentation_revision(:'summary_presentation_revision_id'::uuid);

do $$
begin
  if (select count(*) from public.presentation_revision_evidence where presentation_revision_id=current_setting('p1.summary_revision_id')::uuid) <> 2 then
    raise exception 'P1_MULTI_EVIDENCE_SUMMARY_PROVENANCE_FAILED';
  end if;
end $$;

-- Account export must include the complete P1 durable surface.
do $$
declare
  v_export jsonb := public.cv_engine_export_account();
begin
  if v_export->>'schemaVersion' <> 'p1-account-export-v2' then raise exception 'P1_EXPORT_SCHEMA_NOT_PROMOTED'; end if;
  if jsonb_array_length(v_export->'presentationPlans') < 2 then raise exception 'P1_EXPORT_PLANS_MISSING'; end if;
  if jsonb_array_length(v_export->'presentationPlanEvidence') < 3 then raise exception 'P1_EXPORT_PLAN_EVIDENCE_MISSING'; end if;
  if jsonb_array_length(v_export->'presentationRevisions') < 3 then raise exception 'P1_EXPORT_REVISIONS_MISSING'; end if;
  if jsonb_array_length(v_export->'presentationRevisionEvidence') < 4 then raise exception 'P1_EXPORT_REVISION_EVIDENCE_MISSING'; end if;
end $$;

-- Cross-user read and mutation attempts are denied by owner scope/RPC ownership checks.
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000202';
do $$
begin
  if exists(select 1 from public.presentation_plans where id=current_setting('p1.plan_id')::uuid) then raise exception 'P1_CROSS_USER_PLAN_READ'; end if;
  if exists(select 1 from public.presentation_revisions where id=current_setting('p1.rewrite_revision_id')::uuid) then raise exception 'P1_CROSS_USER_REVISION_READ'; end if;
  begin
    perform * from public.cv_engine_approve_presentation_revision(current_setting('p1.rewrite_revision_id')::uuid);
    raise exception 'P1_CROSS_USER_APPROVAL_SUCCEEDED';
  exception when others then
    if sqlerrm <> 'P1_PRESENTATION_REVISION_NOT_FOUND' then raise; end if;
  end;
end $$;

-- Direct writes are denied to authenticated users.
do $$
begin
  begin
    insert into public.presentation_plans(owner_user_id,mode,renderer_profile,selected_evidence_refs,sections,plan_sha256)
    values('00000000-0000-4000-8000-000000000202','GENERAL','ATS_SINGLE_COLUMN_V1','[]'::jsonb,'[]'::jsonb,repeat('a',64));
    raise exception 'P1_DIRECT_INSERT_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- Anonymous execution is denied.
set role anon;
set request.jwt.claim.sub='';
do $$
begin
  begin
    perform * from public.cv_engine_approve_presentation_revision(current_setting('p1.rewrite_revision_id')::uuid);
    raise exception 'P1_ANON_RPC_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Privacy lifecycle: a second user's P1 history must export and erase through the authorized account path.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000202';
select evidence_id from public.cv_engine_create_career_evidence(
  'PROJECT','MANUAL','VERIFIED','Built a privacy lifecycle regression fixture.',null
) \gset delete_ev_
select * from public.cv_engine_create_presentation_plan(
  'GENERAL',null,null,null,
  jsonb_build_array(jsonb_build_object('evidenceId', :'delete_ev_evidence_id', 'evidenceRevision', 1)),
  '[]'::jsonb,
  jsonb_build_array(jsonb_build_object('sectionKey','experience','ordinal',1,'evidenceRefs',jsonb_build_array(jsonb_build_object('evidenceId', :'delete_ev_evidence_id', 'evidenceRevision', 1))))
) \gset delete_plan_
select * from public.cv_engine_create_presentation_revision(
  :'delete_plan_presentation_plan_id'::uuid,'CLAIM',
  jsonb_build_array(jsonb_build_object('evidenceId', :'delete_ev_evidence_id', 'evidenceRevision', 1)),
  'Built a privacy lifecycle regression fixture.','{}'::text[],'DETERMINISTIC'
) \gset delete_revision_
select * from public.cv_engine_approve_presentation_revision(:'delete_revision_presentation_revision_id'::uuid);

do $$
declare
  v_export jsonb := public.cv_engine_export_account();
begin
  if jsonb_array_length(v_export->'presentationPlans') <> 1 then raise exception 'P1_DELETE_FIXTURE_EXPORT_PLAN_MISSING'; end if;
  if jsonb_array_length(v_export->'presentationRevisions') <> 1 then raise exception 'P1_DELETE_FIXTURE_EXPORT_REVISION_MISSING'; end if;
end $$;

select public.cv_engine_delete_account();
reset role;

do $$
begin
  if exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000000202'::uuid) then raise exception 'P1_ACCOUNT_DELETE_USER_SURVIVED'; end if;
  if exists(select 1 from public.presentation_plans where owner_user_id='00000000-0000-4000-8000-000000000202'::uuid) then raise exception 'P1_ACCOUNT_DELETE_PLAN_SURVIVED'; end if;
  if exists(select 1 from public.presentation_plan_evidence where owner_user_id='00000000-0000-4000-8000-000000000202'::uuid) then raise exception 'P1_ACCOUNT_DELETE_PLAN_EVIDENCE_SURVIVED'; end if;
  if exists(select 1 from public.presentation_revisions where owner_user_id='00000000-0000-4000-8000-000000000202'::uuid) then raise exception 'P1_ACCOUNT_DELETE_REVISION_SURVIVED'; end if;
  if exists(select 1 from public.presentation_revision_evidence where owner_user_id='00000000-0000-4000-8000-000000000202'::uuid) then raise exception 'P1_ACCOUNT_DELETE_REVISION_EVIDENCE_SURVIVED'; end if;
end $$;

-- Privileged durable readback preserves the first user's exact historical artifact.
do $$
begin
  if not exists(
    select 1 from public.presentation_revisions
    where id=current_setting('p1.rewrite_revision_id')::uuid
      and status='APPROVED'
      and proposed_text='Built REST APIs with Java and Spring Boot for internal systems.'
      and proposed_sha256=public.cv_engine_sha256(proposed_text)
  ) then raise exception 'P1_DURABLE_READBACK_FAILED'; end if;
end $$;

select 'P1_PRESENTATION_PERSISTENCE_PASS' as result;
