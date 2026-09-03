\set ON_ERROR_STOP on

-- presentation-revisions.sql deletes User A. Recreate clean fixture identities for this independent gate.
reset role;
insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000202')
on conflict do nothing;

-- Trusted fixture hashes/semantic identities are prepared outside the authenticated role.
select public.cv_engine_sha256('Built a deterministic evidence pipeline.') project_source_hash,
       public.cv_engine_sha256('Built and tested a deterministic evidence pipeline.') project_proposal_hash,
       public.cv_engine_sha256('Kubernetes') kubernetes_hash,
       public.cv_engine_sha256('Kubernetes platform engineering') kubernetes_proposal_hash,
       public.cv_engine_sha256('Kubernetes is required.') req_source_hash,
       public.cv_engine_sha256(E'Requirements:\n- Kubernetes is required.') jd_hash
\gset h_
select public.cv_engine_sha256(
  'TOOL'||chr(31)||'REQUIRED'||chr(31)||'kubernetes is required.'||chr(31)||:'h_req_source_hash'||chr(31)||'0'
) requirement_key
\gset k_
select public.cv_engine_sha256(
  'MANUAL_JOB_DESCRIPTION'||chr(31)||'platform engineer'||chr(31)||''||chr(31)||:'h_jd_hash'||chr(31)||
  'b2-deterministic-job-intelligence-v1'||chr(31)||:'k_requirement_key'
) job_key
\gset s_

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';

select evidence_id from public.cv_engine_create_career_evidence(
  'PROJECT','MANUAL','VERIFIED','Built a deterministic evidence pipeline.',null
) \gset ev_project_
select evidence_id from public.cv_engine_create_career_evidence(
  'SKILL','MANUAL','VERIFIED','Kubernetes',null
) \gset ev_skill_

-- Only the explicitly approved presentation may alter rendered wording.
select presentation_revision_id from public.cv_engine_record_presentation_proposal(
  :'ev_project_evidence_id'::uuid,
  1,
  :'h_project_source_hash',
  'Built and tested a deterministic evidence pipeline.',
  :'h_project_proposal_hash',
  'gemini','gemini-3.5-flash-lite','b6-ai-runtime-v1',1,false,'PLATFORM',
  'b9-plan-approved','b9-presentation-validator-v1',
  '{"status":"PASS","reasonCodes":[]}'::jsonb
) \gset approved_
select * from public.cv_engine_resolve_presentation_revision(
  :'approved_presentation_revision_id'::uuid,'APPROVE'
);

select presentation_revision_id from public.cv_engine_record_presentation_proposal(
  :'ev_skill_evidence_id'::uuid,
  1,
  :'h_kubernetes_hash',
  'Kubernetes platform engineering',
  :'h_kubernetes_proposal_hash',
  'gemini','gemini-3.5-flash-lite','b6-ai-runtime-v1',1,false,'PLATFORM',
  'b9-plan-unapproved','b9-presentation-validator-v1',
  '{"status":"PASS","reasonCodes":[]}'::jsonb
) \gset proposed_

select resume_plan_id, created from public.cv_engine_create_resume_plan('GENERAL',null,null) \gset general_
create temporary table b9_plan_context(
  general_plan_id uuid,
  targeted_plan_id uuid,
  job_snapshot_id uuid,
  assessment_id uuid,
  project_evidence_id uuid,
  skill_evidence_id uuid,
  approved_presentation_revision_id uuid
) on commit preserve rows;
insert into b9_plan_context(
  general_plan_id,
  project_evidence_id,
  skill_evidence_id,
  approved_presentation_revision_id
) values (
  :'general_resume_plan_id'::uuid,
  :'ev_project_evidence_id'::uuid,
  :'ev_skill_evidence_id'::uuid,
  :'approved_presentation_revision_id'::uuid
);

do $$
declare
  v_project_text text;
  v_project_presentation uuid;
  v_skill_text text;
  v_skill_presentation uuid;
  v_count integer;
begin
  select rendered_text, presentation_revision_id
    into v_project_text, v_project_presentation
  from public.resume_plan_items
  where resume_plan_id = (select general_plan_id from b9_plan_context)
    and evidence_id = (select project_evidence_id from b9_plan_context);

  select rendered_text, presentation_revision_id
    into v_skill_text, v_skill_presentation
  from public.resume_plan_items
  where resume_plan_id = (select general_plan_id from b9_plan_context)
    and evidence_id = (select skill_evidence_id from b9_plan_context);

  select count(*) into v_count
  from public.resume_plan_items
  where resume_plan_id = (select general_plan_id from b9_plan_context);

  if v_count <> 2
     or v_project_text <> 'Built and tested a deterministic evidence pipeline.'
     or v_project_presentation <> (select approved_presentation_revision_id from b9_plan_context)
     or v_skill_text <> 'Kubernetes'
     or v_skill_presentation is not null then
    raise exception 'B9_RESUME_PLAN_APPROVAL_BOUNDARY_FAILED count=% project=% project_pr=% skill=% skill_pr=%',
      v_count, v_project_text, v_project_presentation, v_skill_text, v_skill_presentation;
  end if;
end;
$$;

-- General plan semantic replay is idempotent.
do $$
declare
  v_id uuid;
  v_created boolean;
begin
  select resume_plan_id, created into v_id, v_created
  from public.cv_engine_create_resume_plan('GENERAL',null,null);
  if v_id <> (select general_plan_id from b9_plan_context) or v_created then
    raise exception 'B9_GENERAL_PLAN_REPLAY_NOT_IDEMPOTENT id=% created=%', v_id, v_created;
  end if;
end;
$$;

-- Direct authenticated writes remain forbidden.
do $$
begin
  begin
    insert into public.resume_plans(
      owner_user_id, mode, planner_version, section_order, density_policy,
      career_evidence_fingerprint_sha256, semantic_key
    ) values (
      auth.uid(), 'GENERAL', 'b9-deterministic-resume-plan-v1',
      '["PROFILE","EXPERIENCE","PROJECTS","EDUCATION","CERTIFICATIONS","SKILLS","LANGUAGES"]'::jsonb,
      '{"policyVersion":"b9-one-page-density-v1","targetPages":1,"maxItems":20}'::jsonb,
      repeat('a',64), repeat('b',64)
    );
    raise exception 'B9_DIRECT_RESUME_PLAN_INSERT_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Create a target Job Snapshot, but prove TARGETED planning cannot synthesize its own Assessment.
select snapshot_id from public.cv_engine_create_job_snapshot(
  :'s_job_key',
  'Platform Engineer',
  '',
  E'Requirements:\n- Kubernetes is required.',
  :'h_jd_hash',
  'b2-deterministic-job-intelligence-v1',
  jsonb_build_array(jsonb_build_object(
    'semanticKey', :'k_requirement_key',
    'category', 'TOOL',
    'importance', 'REQUIRED',
    'canonicalConcept', 'Kubernetes is required.',
    'sourceText', 'Kubernetes is required.',
    'sourceTextSha256', :'h_req_source_hash',
    'sourceOrdinal', 0
  ))
) \gset job_
update b9_plan_context set job_snapshot_id = :'job_snapshot_id'::uuid;

do $$
begin
  begin
    perform * from public.cv_engine_create_resume_plan(
      'TARGETED',
      (select job_snapshot_id from b9_plan_context),
      null
    );
    raise exception 'B9_TARGETED_PLAN_WITHOUT_ASSESSMENT_ALLOWED';
  exception when check_violation then null;
  end;
end;
$$;

select assessment_id from public.cv_engine_create_opportunity_assessment(:'job_snapshot_id'::uuid) \gset assessment_
update b9_plan_context set assessment_id = :'assessment_assessment_id'::uuid;

select resume_plan_id from public.cv_engine_create_resume_plan(
  'TARGETED',
  :'job_snapshot_id'::uuid,
  :'assessment_assessment_id'::uuid
) \gset targeted_
update b9_plan_context set targeted_plan_id = :'targeted_resume_plan_id'::uuid;

do $$
declare
  v_count integer;
  v_evidence uuid;
  v_reason text;
  v_assessment uuid;
begin
  select count(*), min(evidence_id), min(selection_reason)
    into v_count, v_evidence, v_reason
  from public.resume_plan_items
  where resume_plan_id = (select targeted_plan_id from b9_plan_context);
  select opportunity_assessment_id into v_assessment
  from public.resume_plans where id = (select targeted_plan_id from b9_plan_context);

  if v_count <> 1
     or v_evidence <> (select skill_evidence_id from b9_plan_context)
     or v_reason <> 'TARGET_MATCH'
     or v_assessment <> (select assessment_id from b9_plan_context) then
    raise exception 'B9_TARGETED_PLAN_SELECTION_FAILED count=% evidence=% reason=% assessment=%',
      v_count, v_evidence, v_reason, v_assessment;
  end if;
end;
$$;

-- Any Career Evidence change invalidates the assessment-bound targeted planner input.
select * from public.cv_engine_revise_career_evidence(
  :'ev_skill_evidence_id'::uuid,
  1,
  'VERIFIED',
  'Kubernetes and Helm',
  null
);

do $$
begin
  begin
    perform * from public.cv_engine_create_resume_plan(
      'TARGETED',
      (select job_snapshot_id from b9_plan_context),
      (select assessment_id from b9_plan_context)
    );
    raise exception 'B9_STALE_ASSESSMENT_ACCEPTED_BY_PLANNER';
  exception when serialization_failure then null;
  end;
end;
$$;

-- A second user cannot read or reuse User A's plan/assessment bindings.
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000202';

do $$
declare v_visible integer; begin
  select count(*) into v_visible
  from public.resume_plans
  where id = (select general_plan_id from b9_plan_context);
  if v_visible <> 0 then raise exception 'B9_RESUME_PLAN_RLS_CROSS_USER_READ_ALLOWED'; end if;

  begin
    perform * from public.cv_engine_create_resume_plan(
      'TARGETED',
      (select job_snapshot_id from b9_plan_context),
      (select assessment_id from b9_plan_context)
    );
    raise exception 'B9_CROSS_USER_TARGET_BINDING_ALLOWED';
  exception when no_data_found then null;
  end;
end;
$$;

-- Export/lifecycle remain additive and complete.
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';

do $$
declare v_export jsonb; begin
  v_export := public.cv_engine_export_account();
  if v_export->>'schemaVersion' <> 'b8-account-export-v1'
     or jsonb_array_length(v_export->'resumePlans') <> 2
     or jsonb_array_length(v_export->'resumePlanItems') <> 3 then
    raise exception 'B9_RESUME_PLAN_EXPORT_FAILED schema=% plans=% items=%',
      v_export->>'schemaVersion',
      jsonb_array_length(v_export->'resumePlans'),
      jsonb_array_length(v_export->'resumePlanItems');
  end if;
end;
$$;

select public.cv_engine_delete_account();

reset role;
do $$
declare v_plans integer; v_items integer; begin
  select count(*) into v_plans from public.resume_plans
  where owner_user_id = '00000000-0000-4000-8000-000000000101'::uuid;
  select count(*) into v_items from public.resume_plan_items
  where owner_user_id = '00000000-0000-4000-8000-000000000101'::uuid;
  if v_plans <> 0 or v_items <> 0 then
    raise exception 'B9_RESUME_PLAN_ACCOUNT_DELETE_FAILED plans=% items=%', v_plans, v_items;
  end if;
end;
$$;
