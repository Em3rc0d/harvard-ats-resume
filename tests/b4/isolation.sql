\set ON_ERROR_STOP on

-- Artifact immutability is database-enforced even for the migration owner.
do $$ declare v_id uuid; begin
  select id into v_id from public.resume_versions where owner_user_id='00000000-0000-4000-8000-000000000101' order by created_at limit 1;
  begin
    update public.resume_versions set plain_text='tampered' where id=v_id;
    raise exception 'B4_ADMIN_UPDATE_ACCEPTED';
  exception when check_violation then null; end;
end $$;

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000202';

do $$ begin
  if exists (select 1 from public.resume_versions) then raise exception 'B4_CROSS_USER_RESUME_READ'; end if;
  if exists (select 1 from public.resume_claims) then raise exception 'B4_CROSS_USER_CLAIM_READ'; end if;
  begin
    insert into public.resume_versions(owner_user_id,mode,evidence_fingerprint_sha256,semantic_key,composer_version,renderer_version,manifest,document_json,plain_text)
    values ('00000000-0000-4000-8000-000000000202','GENERAL',repeat('a',64),repeat('b',64),'b4-deterministic-resume-v1','b4-plain-text-v1','{}','{}','fake');
    raise exception 'B4_DIRECT_CLIENT_INSERT_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set role anon;
set request.jwt.claim.sub='';
do $$ begin
  begin
    perform * from public.cv_engine_create_resume_version('GENERAL',null);
    raise exception 'B4_ANON_RPC_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
