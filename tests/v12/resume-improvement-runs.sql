\set ON_ERROR_STOP on

reset role;
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000202')
on conflict do nothing;

select public.cv_engine_sha256('v12-source') source_hash,
       public.cv_engine_sha256('Senior Backend Engineer') extracted_hash,
       public.cv_engine_sha256('Senior Backend Engineer') line_hash \gset v12_hash_

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';

select receipt_id from public.cv_engine_record_resume_import(
  'resume-v12.pdf','PDF',1024,:'v12_hash_source_hash',:'v12_hash_extracted_hash','EXTRACTED',null,
  jsonb_build_array(
    jsonb_build_object(
      'ordinal',1,
      'sourceLine',1,
      'canonicalText','Senior Backend Engineer',
      'sourceTextSha256',:'v12_hash_line_hash'
    )
  )
) \gset v12_import_

select resume_improvement_run_id from public.cv_engine_record_resume_improvement_run(
  :'v12_import_receipt_id'::uuid,
  '{"version":"candidate-resume-document-v1","employment":[{"role":"Senior Backend Engineer","sourceOrdinals":[1]}]}'::jsonb,
  '{"provider":"gemini","model":"quality-model","requestId":"synthetic"}'::jsonb,
  '{"summary":"Senior Backend Engineer focused on reliable systems.","sourceOrdinals":[1]}'::jsonb,
  '{"unsupportedNewClaims":0,"status":"PASS"}'::jsonb,
  'IMPROVED',
  null,
  null
) \gset v12_run_

create temporary table v12_context as
select
  :'v12_import_receipt_id'::uuid as receipt_id,
  :'v12_run_resume_improvement_run_id'::uuid as run_id,
  :'v12_hash_source_hash'::text as source_hash;

do $$
declare
  v_run public.resume_improvement_runs%rowtype;
begin
  select * into v_run from public.resume_improvement_runs where id=(select run_id from v12_context);
  if v_run.owner_user_id <> '00000000-0000-4000-8000-000000000101'::uuid then
    raise exception 'V12_RUN_OWNER_MISMATCH';
  end if;
  if v_run.source_sha256 <> (select source_hash from v12_context) then
    raise exception 'V12_SOURCE_HASH_NOT_DERIVED_FROM_RECEIPT';
  end if;
  if v_run.semantic_document_sha256 <> public.cv_engine_sha256(v_run.semantic_document_json::text)
     or v_run.generated_document_sha256 <> public.cv_engine_sha256(v_run.generated_document_json::text)
     or v_run.guardian_report_sha256 <> public.cv_engine_sha256(v_run.guardian_report_json::text) then
    raise exception 'V12_DURABLE_HASH_MISMATCH';
  end if;
end $$;

-- Direct mutation is denied; the terminal run is RPC-owned and immutable to the application role.
do $$ begin
  begin
    update public.resume_improvement_runs set status='PARTIALLY_IMPROVED'
    where id=(select run_id from v12_context);
    raise exception 'V12_DIRECT_UPDATE_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;

do $$ begin
  begin
    delete from public.resume_improvement_runs where id=(select run_id from v12_context);
    raise exception 'V12_DIRECT_DELETE_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;

do $$ begin
  begin
    insert into public.resume_improvement_runs(
      owner_user_id,source_receipt_id,source_sha256,status
    ) values (
      auth.uid(), (select receipt_id from v12_context), (select source_hash from v12_context), 'FAILED_SOURCE_UNREADABLE'
    );
    raise exception 'V12_DIRECT_INSERT_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;

-- Cross-owner reads are hidden and cross-owner source receipts cannot be used by the RPC.
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000202';

do $$ declare v_count integer; begin
  select count(*) into v_count from public.resume_improvement_runs
  where id=(select run_id from v12_context);
  if v_count <> 0 then raise exception 'V12_CROSS_OWNER_READ_ALLOWED'; end if;
end $$;

do $$ begin
  begin
    perform * from public.cv_engine_record_resume_improvement_run(
      (select receipt_id from v12_context),
      null,null,null,null,
      'FAILED_SOURCE_UNREADABLE',
      null,null
    );
    raise exception 'V12_CROSS_OWNER_SOURCE_ALLOWED';
  exception when no_data_found then null; end;
end $$;

-- Anonymous use is denied by function ACL.
reset role;
set role anon;
set request.jwt.claim.sub = '';
do $$ begin
  begin
    perform * from public.cv_engine_record_resume_improvement_run(
      (select receipt_id from v12_context),
      null,null,null,null,
      'FAILED_SOURCE_UNREADABLE',
      null,null
    );
    raise exception 'V12_ANON_RPC_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;

-- Export and deletion include the new authority without changing the legacy export schema identifier.
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';
do $$ declare v_export jsonb; begin
  v_export := public.cv_engine_export_account();
  if v_export->>'schemaVersion' <> 'b8-account-export-v1'
     or jsonb_array_length(v_export->'resumeImprovementRuns') <> 1 then
    raise exception 'V12_ACCOUNT_EXPORT_MISSING_IMPROVEMENT_RUN';
  end if;
end $$;

select public.cv_engine_delete_account();

reset role;
do $$ begin
  if exists(
    select 1 from public.resume_improvement_runs
    where owner_user_id='00000000-0000-4000-8000-000000000101'::uuid
  ) then
    raise exception 'V12_ACCOUNT_DELETE_LEFT_IMPROVEMENT_RUN';
  end if;
end $$;
