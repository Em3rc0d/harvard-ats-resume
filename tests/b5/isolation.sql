\set ON_ERROR_STOP on

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000202';

do $$ begin
  if exists (select 1 from public.import_receipts) then raise exception 'B5_CROSS_USER_RECEIPT_READ'; end if;
  if exists (select 1 from public.import_proposals) then raise exception 'B5_CROSS_USER_PROPOSAL_READ'; end if;
  begin
    insert into public.import_receipts(owner_user_id,source_name,media_type,source_size_bytes,source_sha256,extractor_version,proposal_version,status,proposal_count)
    values ('00000000-0000-4000-8000-000000000202','fake.pdf','PDF',10,repeat('a',64),'b5-mechanical-resume-extractor-v1','b5-line-proposals-v1','UNSUPPORTED',0);
    raise exception 'B5_DIRECT_RECEIPT_INSERT_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role anon;
set request.jwt.claim.sub='';
do $$ begin
  begin
    perform * from public.cv_engine_record_resume_import('a.pdf','PDF',10,repeat('a',64),null,'UNSUPPORTED','PDF_TEXT_NOT_EXTRACTABLE','[]'::jsonb);
    raise exception 'B5_ANON_IMPORT_RPC_ACCEPTED';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.cv_engine_accept_import_proposal(gen_random_uuid(),'SKILL');
    raise exception 'B5_ANON_ACCEPT_RPC_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Stable proposal/source metadata cannot be rewritten even by the migration owner.
do $$ declare v_id uuid; begin
  select id into v_id from public.import_proposals order by created_at limit 1;
  begin
    update public.import_proposals set canonical_text='tampered' where id=v_id;
    raise exception 'B5_PROPOSAL_STABLE_FIELD_UPDATE_ACCEPTED';
  exception when check_violation then null; end;
end $$;
