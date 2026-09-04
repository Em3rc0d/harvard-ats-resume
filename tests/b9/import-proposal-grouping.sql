\set ON_ERROR_STOP on

reset role;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000404') on conflict do nothing;
select public.cv_engine_sha256('synthetic-grouping-source') source_hash,
       public.cv_engine_sha256(E'Project Alpha\nBuilt API.\nAdded tests.\nUnrelated skill') extracted_hash,
       public.cv_engine_sha256('Project Alpha') p1_hash,
       public.cv_engine_sha256('Built API.') p2_hash,
       public.cv_engine_sha256('Added tests.') p3_hash,
       public.cv_engine_sha256('Unrelated skill') p4_hash
\gset h_

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000404';

select receipt_id from public.cv_engine_record_resume_import(
  'synthetic-grouping.docx','DOCX',1024,
  :'h_source_hash',:'h_extracted_hash','EXTRACTED',null,
  jsonb_build_array(
    jsonb_build_object('ordinal',1,'sourceLine',1,'canonicalText','Project Alpha','sourceTextSha256',:'h_p1_hash'),
    jsonb_build_object('ordinal',2,'sourceLine',2,'canonicalText','Built API.','sourceTextSha256',:'h_p2_hash'),
    jsonb_build_object('ordinal',3,'sourceLine',3,'canonicalText','Added tests.','sourceTextSha256',:'h_p3_hash'),
    jsonb_build_object('ordinal',4,'sourceLine',4,'canonicalText','Unrelated skill','sourceTextSha256',:'h_p4_hash')
  )
) \gset receipt_

select id from public.import_proposals where receipt_id = :'receipt_receipt_id'::uuid and ordinal = 1 \gset p1_
select id from public.import_proposals where receipt_id = :'receipt_receipt_id'::uuid and ordinal = 2 \gset p2_
select id from public.import_proposals where receipt_id = :'receipt_receipt_id'::uuid and ordinal = 3 \gset p3_
select id from public.import_proposals where receipt_id = :'receipt_receipt_id'::uuid and ordinal = 4 \gset p4_

create temporary table b9_import_group_context(
  p1 uuid,
  p2 uuid,
  p3 uuid,
  p4 uuid,
  receipt_id uuid,
  evidence_id uuid,
  plan_id uuid
) on commit preserve rows;
insert into b9_import_group_context(p1,p2,p3,p4,receipt_id)
values (:'p1_id'::uuid,:'p2_id'::uuid,:'p3_id'::uuid,:'p4_id'::uuid,:'receipt_receipt_id'::uuid);

do $$
begin
  begin
    perform * from public.cv_engine_accept_import_proposal_group(
      array[(select p1 from b9_import_group_context),(select p3 from b9_import_group_context)],
      'PROJECT'
    );
    raise exception 'B9_IMPORT_NONCONTIGUOUS_GROUP_ALLOWED';
  exception when check_violation then null;
  end;
end;
$$;

select accepted_evidence_id from public.cv_engine_accept_import_proposal_group(
  array[:'p1_id'::uuid,:'p2_id'::uuid,:'p3_id'::uuid],
  'PROJECT'
) \gset grouped_
update b9_import_group_context set evidence_id = :'grouped_accepted_evidence_id'::uuid;

do $$
declare
  v_text text;
  v_status text;
  v_source text;
  v_linked integer;
  v_pending integer;
begin
  select cer.canonical_text, cer.verification_status, ce.source
    into v_text, v_status, v_source
  from public.career_evidence ce
  join public.career_evidence_revisions cer
    on cer.evidence_id = ce.id and cer.owner_user_id = ce.owner_user_id and cer.revision_number = ce.current_revision
  where ce.id = (select evidence_id from b9_import_group_context);

  select count(*) into v_linked
  from public.import_proposals
  where accepted_evidence_id = (select evidence_id from b9_import_group_context)
    and status = 'ACCEPTED';

  select count(*) into v_pending
  from public.import_proposals
  where id = (select p4 from b9_import_group_context)
    and status = 'PENDING';

  if v_text <> E'Project Alpha\nBuilt API.\nAdded tests.'
     or v_status <> 'NEEDS_REVIEW'
     or v_source <> 'IMPORTED_RESUME'
     or v_linked <> 3
     or v_pending <> 1 then
    raise exception 'B9_IMPORT_GROUP_SOURCE_PRESERVATION_FAILED text=% status=% source=% linked=% pending=%',
      v_text, v_status, v_source, v_linked, v_pending;
  end if;
end;
$$;

select * from public.cv_engine_revise_career_evidence(
  :'grouped_accepted_evidence_id'::uuid,
  1,
  'VERIFIED',
  E'Project Alpha\nBuilt API.\nAdded tests.',
  null
);
select resume_plan_id from public.cv_engine_create_resume_plan('GENERAL',null,null) \gset plan_
update b9_import_group_context set plan_id = :'plan_resume_plan_id'::uuid;

do $$
declare
  v_projects integer;
  v_text text;
begin
  select count(*), min(rendered_text)
    into v_projects, v_text
  from public.resume_plan_items
  where resume_plan_id = (select plan_id from b9_import_group_context)
    and section = 'PROJECTS';
  if v_projects <> 1 or v_text <> E'Project Alpha\nBuilt API.\nAdded tests.' then
    raise exception 'B9_IMPORT_GROUP_PLANNER_GRANULARITY_FAILED projects=% text=%', v_projects, v_text;
  end if;
end;
$$;

select public.cv_engine_delete_account();

reset role;
do $$
declare v_imports integer; v_evidence integer; begin
  select count(*) into v_imports from public.import_receipts where owner_user_id = '00000000-0000-4000-8000-000000000404'::uuid;
  select count(*) into v_evidence from public.career_evidence where owner_user_id = '00000000-0000-4000-8000-000000000404'::uuid;
  if v_imports <> 0 or v_evidence <> 0 then
    raise exception 'B9_IMPORT_GROUP_ACCOUNT_DELETE_FAILED imports=% evidence=%', v_imports, v_evidence;
  end if;
end;
$$;
