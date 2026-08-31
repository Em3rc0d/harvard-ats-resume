\set ON_ERROR_STOP on

-- Lock token semantics directly before any higher-level matcher assertions.
-- These helpers remain unavailable to authenticated clients; this runs as the
-- migration owner solely to certify deterministic matching behavior.
do $$
begin
  if public.cv_engine_b3_tokens('Kubernetes is required.') <> array['kubernetes']::text[] then
    raise exception 'B3_TOKENIZER_REQUIRED_TERM_REGRESSION:%', public.cv_engine_b3_tokens('Kubernetes is required.');
  end if;
  if public.cv_engine_b3_tokens('Docker is preferred.') <> array['docker']::text[] then
    raise exception 'B3_TOKENIZER_PREFERRED_TERM_REGRESSION:%', public.cv_engine_b3_tokens('Docker is preferred.');
  end if;
  if public.cv_engine_b3_overlap('Kubernetes is required.', 'Kubernetes') <> 1 then
    raise exception 'B3_EXACT_CONCEPT_OVERLAP_REGRESSION';
  end if;
end $$;

-- Trusted fixture preparation runs as the migration owner. The B2 SHA helper is
-- intentionally not executable by authenticated clients and this test must not
-- weaken that boundary merely to prepare deterministic fixture identities.
select E'Requirements:\n- Kubernetes is required.\n- AWS is required.\nPreferred:\n- Docker is preferred.' description,
       '- Kubernetes is required.' req1,
       '- AWS is required.' req2,
       '- Docker is preferred.' req3 \gset jd_
select public.cv_engine_sha256(:'jd_description') raw_hash,
       public.cv_engine_sha256(:'jd_req1') h1,
       public.cv_engine_sha256(:'jd_req2') h2,
       public.cv_engine_sha256(:'jd_req3') h3 \gset h_
select public.cv_engine_sha256('TOOL'||chr(31)||'REQUIRED'||chr(31)||'kubernetes is required.'||chr(31)||:'h_h1'||chr(31)||'0') k1,
       public.cv_engine_sha256('TOOL'||chr(31)||'REQUIRED'||chr(31)||'aws is required.'||chr(31)||:'h_h2'||chr(31)||'1') k2,
       public.cv_engine_sha256('TOOL'||chr(31)||'PREFERRED'||chr(31)||'docker is preferred.'||chr(31)||:'h_h3'||chr(31)||'2') k3 \gset k_
select public.cv_engine_sha256('MANUAL_JOB_DESCRIPTION'||chr(31)||'platform engineer'||chr(31)||''||chr(31)||:'h_raw_hash'||chr(31)||'b2-deterministic-job-intelligence-v1'||chr(31)||:'k_k1'||','||:'k_k2'||','||:'k_k3') sk \gset s_

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';

select evidence_id from public.cv_engine_create_career_evidence('SKILL','MANUAL','VERIFIED','Kubernetes',null) \gset ev_k8s_
select evidence_id from public.cv_engine_create_career_evidence('SKILL','MANUAL','VERIFIED','Docker',null) \gset ev_docker_

select snapshot_id from public.cv_engine_create_job_snapshot(
  :'s_sk','Platform Engineer','',:'jd_description',:'h_raw_hash','b2-deterministic-job-intelligence-v1',
  jsonb_build_array(
    jsonb_build_object('semanticKey',:'k_k1','category','TOOL','importance','REQUIRED','canonicalConcept','Kubernetes is required.','sourceText',:'jd_req1','sourceTextSha256',:'h_h1','sourceOrdinal',0),
    jsonb_build_object('semanticKey',:'k_k2','category','TOOL','importance','REQUIRED','canonicalConcept','AWS is required.','sourceText',:'jd_req2','sourceTextSha256',:'h_h2','sourceOrdinal',1),
    jsonb_build_object('semanticKey',:'k_k3','category','TOOL','importance','PREFERRED','canonicalConcept','Docker is preferred.','sourceText',:'jd_req3','sourceTextSha256',:'h_h3','sourceOrdinal',2)
  )
) \gset job_

create temporary table b3_job as select :'job_snapshot_id'::uuid id;
create temporary table b3_truth_guard as
select (select count(*) from public.career_evidence) evidence_count,
       (select count(*) from public.career_evidence_revisions) revision_count;
create temporary table b3_first as
select * from public.cv_engine_create_opportunity_assessment((select id from b3_job));
create temporary table b3_replay as
select * from public.cv_engine_create_opportunity_assessment((select id from b3_job));

do $$
declare
  before_evidence integer;
  before_revisions integer;
  required_unknown integer;
  required_match integer;
  preferred_match integer;
  first_report uuid;
  first_assessment uuid;
  replay_report uuid;
  replay_assessment uuid;
  replay_created boolean;
begin
  select evidence_count, revision_count into before_evidence, before_revisions from b3_truth_guard;
  select match_report_id, assessment_id into first_report, first_assessment from b3_first;
  select match_report_id, assessment_id, created into replay_report, replay_assessment, replay_created from b3_replay;

  if (select count(*) from public.career_evidence) <> before_evidence
     or (select count(*) from public.career_evidence_revisions) <> before_revisions then
    raise exception 'B3_ASSESSMENT_MUTATED_CANDIDATE_TRUTH';
  end if;
  if first_report <> replay_report or first_assessment <> replay_assessment or replay_created then
    raise exception 'B3_SEMANTIC_REPLAY_NOT_IDEMPOTENT';
  end if;

  select count(*) filter (where jr.importance='REQUIRED' and rm.status='UNKNOWN'),
         count(*) filter (where jr.importance='REQUIRED' and rm.status='MATCH'),
         count(*) filter (where jr.importance='PREFERRED' and rm.status='MATCH')
  into required_unknown, required_match, preferred_match
  from public.requirement_matches rm
  join public.job_requirements jr on jr.id=rm.requirement_id
  where rm.match_report_id=first_report;

  if required_unknown <> 1 or required_match <> 1 or preferred_match <> 1 then
    raise exception 'B3_MATCH_CLASSIFICATION_FAILED unknown=% required_match=% preferred_match=%', required_unknown, required_match, preferred_match;
  end if;

  if not exists (
    select 1 from public.opportunity_assessments
    where id=first_assessment
      and recommendation='EVIDENCE_INCOMPLETE'
      and decision='NOT_YET'
      and action='CLARIFY_EVIDENCE'
      and eligibility='UNCERTAIN'
      and cardinality(uncertain_requirement_ids)=1
  ) then raise exception 'B3_UNKNOWN_WAS_SILENTLY_PASSED'; end if;

  if exists (
    select 1 from public.requirement_matches
    where match_report_id=first_report
      and status in ('MATCH','POTENTIAL_MATCH')
      and cardinality(supporting_evidence_ids)=0
  ) then raise exception 'B3_SUPPORTED_MATCH_WITHOUT_EVIDENCE'; end if;
end $$;

select evidence_id from public.cv_engine_create_career_evidence('SKILL','MANUAL','VERIFIED','AWS',null) \gset ev_aws_
create temporary table b3_second as
select * from public.cv_engine_create_opportunity_assessment((select id from b3_job));

do $$
declare
  first_report uuid;
  second_report uuid;
  second_assessment uuid;
  second_created boolean;
begin
  select match_report_id into first_report from b3_first;
  select match_report_id, assessment_id, created into second_report, second_assessment, second_created from b3_second;
  if second_report = first_report or not second_created then
    raise exception 'B3_EVIDENCE_CHANGE_DID_NOT_VERSION_ASSESSMENT';
  end if;
  if not exists (
    select 1 from public.opportunity_assessments
    where id=second_assessment
      and recommendation='READY_NOW'
      and decision='YES'
      and action='APPLY'
      and eligibility='CLEAR'
      and evidence_strength='STRONG'
  ) then raise exception 'B3_VERIFIED_REQUIRED_SUPPORT_DID_NOT_REACH_READY_NOW'; end if;
  if not exists (
    select 1 from public.requirement_matches rm
    join public.job_requirements jr on jr.id=rm.requirement_id
    where rm.match_report_id=first_report
      and jr.canonical_concept='AWS is required.'
      and rm.status='UNKNOWN'
      and jsonb_array_length(rm.supporting_evidence_snapshot)=0
  ) then raise exception 'B3_HISTORICAL_ASSESSMENT_WAS_REWRITTEN'; end if;
end $$;

do $$
declare v_job uuid; begin
  select id into v_job from b3_job;
  begin
    insert into public.match_reports(owner_user_id,job_snapshot_id,job_snapshot_semantic_key,career_evidence_fingerprint_sha256,semantic_key,engine_version,basis)
    values ('00000000-0000-4000-8000-000000000101',v_job,repeat('a',64),repeat('b',64),repeat('c',64),'b3-deterministic-evidence-match-v1','{}'::jsonb);
    raise exception 'B3_DIRECT_MATCH_REPORT_INSERT_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
