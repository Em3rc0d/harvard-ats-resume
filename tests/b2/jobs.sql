\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';

select E'Requirements:\n- Kubernetes is required.\nPreferred:\n- Terraform is preferred.' description,'- Kubernetes is required.' req1,'- Terraform is preferred.' req2 \gset jd_
select encode(digest(:'jd_description','sha256'),'hex') raw_hash,encode(digest(:'jd_req1','sha256'),'hex') h1,encode(digest(:'jd_req2','sha256'),'hex') h2 \gset h_
select encode(digest('TOOL'||chr(31)||'REQUIRED'||chr(31)||'kubernetes is required.'||chr(31)||:'h_h1'||chr(31)||'0','sha256'),'hex') k1,
       encode(digest('TOOL'||chr(31)||'PREFERRED'||chr(31)||'terraform is preferred.'||chr(31)||:'h_h2'||chr(31)||'1','sha256'),'hex') k2 \gset k_
select encode(digest('MANUAL_JOB_DESCRIPTION'||chr(31)||'backend engineer'||chr(31)||''||chr(31)||:'h_raw_hash'||chr(31)||'b2-deterministic-job-intelligence-v1'||chr(31)||:'k_k1'||','||:'k_k2','sha256'),'hex') sk \gset s_
select count(*) evidence_before from public.career_evidence \gset before_

select snapshot_id from public.cv_engine_create_job_snapshot(:'s_sk','Backend Engineer','',:'jd_description',:'h_raw_hash','b2-deterministic-job-intelligence-v1',jsonb_build_array(
 jsonb_build_object('semanticKey',:'k_k1','category','TOOL','importance','REQUIRED','canonicalConcept','Kubernetes is required.','sourceText',:'jd_req1','sourceTextSha256',:'h_h1','sourceOrdinal',0),
 jsonb_build_object('semanticKey',:'k_k2','category','TOOL','importance','PREFERRED','canonicalConcept','Terraform is preferred.','sourceText',:'jd_req2','sourceTextSha256',:'h_h2','sourceOrdinal',1)
));
select snapshot_id from public.cv_engine_create_job_snapshot(:'s_sk','Backend Engineer','',:'jd_description',:'h_raw_hash','b2-deterministic-job-intelligence-v1',jsonb_build_array(
 jsonb_build_object('semanticKey',:'k_k1','category','TOOL','importance','REQUIRED','canonicalConcept','Kubernetes is required.','sourceText',:'jd_req1','sourceTextSha256',:'h_h1','sourceOrdinal',0),
 jsonb_build_object('semanticKey',:'k_k2','category','TOOL','importance','PREFERRED','canonicalConcept','Terraform is preferred.','sourceText',:'jd_req2','sourceTextSha256',:'h_h2','sourceOrdinal',1)
));

do $$ begin
  if (select count(*) from public.job_snapshots)<>1 or (select count(*) from public.job_requirements)<>2 then raise exception 'B2_JOB_DURABILITY_OR_REPLAY_FAILED'; end if;
  if (select count(*) from public.career_evidence)<>:'before_evidence_before'::integer then raise exception 'B2_JOB_MUTATED_CANDIDATE_TRUTH'; end if;
end $$;

-- Unsupported market text cannot become a persisted requirement.
do $$ declare n integer; begin
  select count(*) into n from public.job_snapshots;
  begin
    perform * from public.cv_engine_create_job_snapshot(repeat('d',64),'Backend Engineer','','Requirements: Java',encode(digest('Requirements: Java','sha256'),'hex'),'b2-deterministic-job-intelligence-v1',jsonb_build_array(jsonb_build_object('semanticKey',repeat('e',64),'category','TOOL','importance','REQUIRED','canonicalConcept','AWS','sourceText','AWS is required.','sourceTextSha256',encode(digest('AWS is required.','sha256'),'hex'),'sourceOrdinal',0)));
    raise exception 'B2_UNSUPPORTED_REQUIREMENT_ACCEPTED';
  exception when check_violation then null; end;
  if (select count(*) from public.job_snapshots)<>n then raise exception 'B2_JOB_ATOMIC_ROLLBACK_FAILED'; end if;
end $$;
reset role;
