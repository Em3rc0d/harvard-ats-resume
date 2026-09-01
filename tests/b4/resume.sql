\set ON_ERROR_STOP on

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
select evidence_id from public.cv_engine_create_career_evidence('ACHIEVEMENT','MANUAL','NEEDS_REVIEW','Claim that must never enter a trusted resume',null) \gset ev_untrusted_
select snapshot_id from public.cv_engine_create_job_snapshot(
  :'s_sk','Platform Engineer','',:'jd_description',:'h_raw_hash','b2-deterministic-job-intelligence-v1',
  jsonb_build_array(
    jsonb_build_object('semanticKey',:'k_k1','category','TOOL','importance','REQUIRED','canonicalConcept','Kubernetes is required.','sourceText',:'jd_req1','sourceTextSha256',:'h_h1','sourceOrdinal',0),
    jsonb_build_object('semanticKey',:'k_k2','category','TOOL','importance','REQUIRED','canonicalConcept','AWS is required.','sourceText',:'jd_req2','sourceTextSha256',:'h_h2','sourceOrdinal',1),
    jsonb_build_object('semanticKey',:'k_k3','category','TOOL','importance','PREFERRED','canonicalConcept','Docker is preferred.','sourceText',:'jd_req3','sourceTextSha256',:'h_h3','sourceOrdinal',2)
  )
) \gset job_

create temporary table b4_general_first as select * from public.cv_engine_create_resume_version('GENERAL',null);
create temporary table b4_general_replay as select * from public.cv_engine_create_resume_version('GENERAL',null);
create temporary table b4_targeted_first as select * from public.cv_engine_create_resume_version('TARGETED',:'job_snapshot_id'::uuid);
create temporary table b4_targeted_replay as select * from public.cv_engine_create_resume_version('TARGETED',:'job_snapshot_id'::uuid);

do $$
declare g1 uuid; g2 uuid; t1 uuid; t2 uuid; g2_created boolean; t2_created boolean;
begin
  select resume_version_id into g1 from b4_general_first;
  select resume_version_id, created into g2, g2_created from b4_general_replay;
  select resume_version_id into t1 from b4_targeted_first;
  select resume_version_id, created into t2, t2_created from b4_targeted_replay;
  if g1 <> g2 or g2_created then raise exception 'B4_GENERAL_REPLAY_NOT_IDEMPOTENT'; end if;
  if t1 <> t2 or t2_created then raise exception 'B4_TARGETED_REPLAY_NOT_IDEMPOTENT'; end if;
  if (select count(*) from public.resume_claims where resume_version_id=g1) <> 2 then raise exception 'B4_GENERAL_VERIFIED_SELECTION_FAILED'; end if;
  if (select count(*) from public.resume_claims where resume_version_id=t1) <> 2 then raise exception 'B4_TARGETED_SUPPORT_SELECTION_FAILED'; end if;
  if exists (select 1 from public.resume_claims where resume_version_id in (g1,t1) and evidence_verification_status <> 'VERIFIED') then raise exception 'B4_UNTRUSTED_EVIDENCE_ENTERED_RESUME'; end if;
  if exists (select 1 from public.resume_claims where evidence_canonical_text = 'Claim that must never enter a trusted resume') then raise exception 'B4_NEEDS_REVIEW_ENTERED_TRUSTED_RESUME'; end if;
  if exists (select 1 from public.resume_claims where rendered_text in ('- Kubernetes is required.','- AWS is required.','- Docker is preferred.')) then raise exception 'B4_JOB_TRUTH_BECAME_CANDIDATE_CLAIM'; end if;
  if exists (select 1 from public.resume_claims where rendered_text <> evidence_canonical_text) then raise exception 'B4_SOURCE_PRESERVATION_FAILED'; end if;
end $$;

select * from public.cv_engine_revise_career_evidence(:'ev_k8s_evidence_id'::uuid,1,'VERIFIED','Kubernetes platform operations',null) \gset rev_
create temporary table b4_general_second as select * from public.cv_engine_create_resume_version('GENERAL',null);

do $$
declare first_id uuid; second_id uuid; begin
  select resume_version_id into first_id from b4_general_first;
  select resume_version_id into second_id from b4_general_second;
  if first_id = second_id then raise exception 'B4_EVIDENCE_CHANGE_DID_NOT_VERSION_RESUME'; end if;
  if not exists (select 1 from public.resume_claims where resume_version_id=first_id and evidence_revision=1 and rendered_text='Kubernetes') then raise exception 'B4_HISTORICAL_RESUME_WAS_REWRITTEN'; end if;
  if not exists (select 1 from public.resume_claims where resume_version_id=second_id and evidence_revision=2 and rendered_text='Kubernetes platform operations') then raise exception 'B4_NEW_REVISION_NOT_PROJECTED'; end if;
end $$;

reset role;
create or replace function public.b4_test_force_claim_failure() returns trigger language plpgsql as $$ begin raise exception 'B4_TEST_FORCED_CLAIM_FAILURE'; end; $$;
create trigger b4_test_force_claim_failure before insert on public.resume_claims for each row execute function public.b4_test_force_claim_failure();
create temporary table b4_before_failure as select count(*)::integer version_count from public.resume_versions;

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';
select * from public.cv_engine_revise_career_evidence(:'ev_docker_evidence_id'::uuid,1,'VERIFIED','Docker container delivery',null) \gset rev2_
do $$ begin
  begin
    perform * from public.cv_engine_create_resume_version('GENERAL',null);
    raise exception 'B4_FORCED_FAILURE_WAS_NOT_TRIGGERED';
  exception when others then
    if sqlerrm <> 'B4_TEST_FORCED_CLAIM_FAILURE' then raise; end if;
  end;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.resume_versions) <> (select version_count from b4_before_failure) then raise exception 'B4_PARTIAL_VERSION_SURVIVED_FAILED_TRANSACTION'; end if;
end $$;

drop trigger b4_test_force_claim_failure on public.resume_claims;
drop function public.b4_test_force_claim_failure();
