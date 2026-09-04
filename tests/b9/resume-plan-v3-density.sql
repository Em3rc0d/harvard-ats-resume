\set ON_ERROR_STOP on

reset role;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000303') on conflict do nothing;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000303';

select * from public.cv_engine_create_career_evidence('PROJECT','MANUAL','VERIFIED','Project evidence 1',null);
select * from public.cv_engine_create_career_evidence('PROJECT','MANUAL','VERIFIED','Project evidence 2',null);
select * from public.cv_engine_create_career_evidence('PROJECT','MANUAL','VERIFIED','Project evidence 3',null);
select * from public.cv_engine_create_career_evidence('PROJECT','MANUAL','VERIFIED','Project evidence 4',null);
select * from public.cv_engine_create_career_evidence('PROJECT','MANUAL','VERIFIED','Project evidence 5',null);
select * from public.cv_engine_create_career_evidence('PROJECT','MANUAL','VERIFIED','Project evidence 6',null);

select * from public.cv_engine_create_career_evidence('CERTIFICATION','MANUAL','VERIFIED','Certification evidence 1',null);
select * from public.cv_engine_create_career_evidence('CERTIFICATION','MANUAL','VERIFIED','Certification evidence 2',null);
select * from public.cv_engine_create_career_evidence('CERTIFICATION','MANUAL','VERIFIED','Certification evidence 3',null);
select * from public.cv_engine_create_career_evidence('CERTIFICATION','MANUAL','VERIFIED','Certification evidence 4',null);

select * from public.cv_engine_create_career_evidence('SKILL','MANUAL','VERIFIED','Skill evidence 1',null);
select * from public.cv_engine_create_career_evidence('SKILL','MANUAL','VERIFIED','Skill evidence 2',null);
select * from public.cv_engine_create_career_evidence('SKILL','MANUAL','VERIFIED','Skill evidence 3',null);
select * from public.cv_engine_create_career_evidence('SKILL','MANUAL','VERIFIED','Skill evidence 4',null);
select * from public.cv_engine_create_career_evidence('SKILL','MANUAL','VERIFIED','Skill evidence 5',null);

select * from public.cv_engine_create_career_evidence('LANGUAGE','MANUAL','VERIFIED','Language evidence 1',null);
select * from public.cv_engine_create_career_evidence('LANGUAGE','MANUAL','VERIFIED','Language evidence 2',null);

select resume_plan_id from public.cv_engine_create_resume_plan('GENERAL',null,null) \gset plan_

do $$
declare
  v_planner text;
  v_policy jsonb;
  v_projects integer;
  v_certs integer;
  v_skills integer;
  v_languages integer;
  v_receipts integer;
  v_included integer;
  v_omitted integer;
begin
  select planner_version, density_policy
    into v_planner, v_policy
  from public.resume_plans
  where id = :'plan_resume_plan_id'::uuid;

  select count(*) filter (where section = 'PROJECTS'),
         count(*) filter (where section = 'CERTIFICATIONS'),
         count(*) filter (where section = 'SKILLS'),
         count(*) filter (where section = 'LANGUAGES')
    into v_projects, v_certs, v_skills, v_languages
  from public.resume_plan_items
  where resume_plan_id = :'plan_resume_plan_id'::uuid;

  select count(*),
         count(*) filter (where decision = 'INCLUDED'),
         count(*) filter (where decision = 'OMITTED_DENSITY')
    into v_receipts, v_included, v_omitted
  from public.resume_plan_source_receipts
  where resume_plan_id = :'plan_resume_plan_id'::uuid;

  if v_planner <> 'b9-deterministic-resume-plan-v3'
     or v_policy <> '{"policyVersion":"b9-balanced-one-page-density-v2","targetPages":1,"maxItems":20,"sectionBudgets":{"PROFILE":1,"EXPERIENCE":4,"PROJECTS":5,"EDUCATION":2,"CERTIFICATIONS":3,"SKILLS":4,"LANGUAGES":1}}'::jsonb
     or v_projects <> 5
     or v_certs <> 3
     or v_skills <> 4
     or v_languages <> 1
     or v_receipts <> 17
     or v_included <> 13
     or v_omitted <> 4 then
    raise exception 'B9_V3_DENSITY_POLICY_FAILED planner=% policy=% projects=% certs=% skills=% languages=% receipts=% included=% omitted=%',
      v_planner, v_policy, v_projects, v_certs, v_skills, v_languages, v_receipts, v_included, v_omitted;
  end if;
end;
$$;

select public.cv_engine_delete_account();

reset role;
do $$
declare
  v_plans integer;
  v_receipts integer;
begin
  select count(*) into v_plans from public.resume_plans
  where owner_user_id = '00000000-0000-4000-8000-000000000303'::uuid;
  select count(*) into v_receipts from public.resume_plan_source_receipts
  where owner_user_id = '00000000-0000-4000-8000-000000000303'::uuid;
  if v_plans <> 0 or v_receipts <> 0 then
    raise exception 'B9_V3_DENSITY_ACCOUNT_DELETE_FAILED plans=% receipts=%', v_plans, v_receipts;
  end if;
end;
$$;
