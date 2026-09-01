\set ON_ERROR_STOP on

select public.cv_engine_sha256('synthetic-resume-source') source_hash,
       public.cv_engine_sha256('Kubernetes operations\nDocker delivery\nAWS exposure') extracted_hash,
       public.cv_engine_sha256('Kubernetes operations') h1,
       public.cv_engine_sha256('Docker delivery') h2,
       public.cv_engine_sha256('AWS exposure') h3,
       public.cv_engine_sha256('bad-source') bad_source_hash \gset hashes_

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';

create temporary table b5_first as
select * from public.cv_engine_record_resume_import(
  'resume.pdf','PDF',1234,:'hashes_source_hash',:'hashes_extracted_hash','EXTRACTED',null,
  jsonb_build_array(
    jsonb_build_object('ordinal',1,'sourceLine',1,'canonicalText','Kubernetes operations','sourceTextSha256',:'hashes_h1'),
    jsonb_build_object('ordinal',2,'sourceLine',2,'canonicalText','Docker delivery','sourceTextSha256',:'hashes_h2'),
    jsonb_build_object('ordinal',3,'sourceLine',3,'canonicalText','AWS exposure','sourceTextSha256',:'hashes_h3')
  )
);

create temporary table b5_replay as
select * from public.cv_engine_record_resume_import(
  'renamed-resume.pdf','PDF',1234,:'hashes_source_hash',:'hashes_extracted_hash','EXTRACTED',null,
  jsonb_build_array(
    jsonb_build_object('ordinal',1,'sourceLine',1,'canonicalText','Kubernetes operations','sourceTextSha256',:'hashes_h1'),
    jsonb_build_object('ordinal',2,'sourceLine',2,'canonicalText','Docker delivery','sourceTextSha256',:'hashes_h2'),
    jsonb_build_object('ordinal',3,'sourceLine',3,'canonicalText','AWS exposure','sourceTextSha256',:'hashes_h3')
  )
);

create temporary table b5_state as
select
  f.receipt_id,
  (select id from public.import_proposals where receipt_id=f.receipt_id and ordinal=1) proposal_1_id,
  (select id from public.import_proposals where receipt_id=f.receipt_id and ordinal=2) proposal_2_id,
  (select id from public.import_proposals where receipt_id=f.receipt_id and ordinal=3) proposal_3_id
from b5_first f;

create temporary table b5_accepted as
select evidence_id
from public.cv_engine_accept_import_proposal((select proposal_1_id from b5_state),'SKILL');

select public.cv_engine_dismiss_import_proposal((select proposal_2_id from b5_state));

do $$
declare
  first_id uuid;
  replay_id uuid;
  replay_created boolean;
begin
  select receipt_id into first_id from b5_first;
  select receipt_id, created into replay_id, replay_created from b5_replay;
  if first_id <> replay_id or replay_created then
    raise exception 'B5_IMPORT_REPLAY_NOT_IDEMPOTENT';
  end if;
  if (select count(*) from public.import_proposals where receipt_id=first_id) <> 3 then
    raise exception 'B5_PROPOSAL_COUNT_MISMATCH';
  end if;
end $$;

do $$
declare
  accepted_id uuid := (select evidence_id from b5_accepted);
  receipt_id_value uuid := (select receipt_id from b5_state);
  dismissed_id uuid := (select proposal_2_id from b5_state);
begin
  if not exists (
    select 1
    from public.career_evidence ce
    join public.career_evidence_revisions cer
      on cer.evidence_id=ce.id
     and cer.owner_user_id=ce.owner_user_id
     and cer.revision_number=ce.current_revision
    where ce.id=accepted_id
      and ce.source='IMPORTED_RESUME'
      and ce.kind='SKILL'
      and cer.verification_status='NEEDS_REVIEW'
      and cer.canonical_text='Kubernetes operations'
      and cer.source_document_id=receipt_id_value
  ) then
    raise exception 'B5_ACCEPTED_PROPOSAL_DID_NOT_CREATE_REVIEWABLE_IMPORTED_EVIDENCE';
  end if;

  if exists (
    select 1
    from public.career_evidence ce
    join public.career_evidence_revisions cer
      on cer.evidence_id=ce.id
     and cer.owner_user_id=ce.owner_user_id
     and cer.revision_number=ce.current_revision
    where ce.id=accepted_id
      and cer.verification_status='VERIFIED'
  ) then
    raise exception 'B5_IMPORT_AUTO_VERIFIED_CANDIDATE_TRUTH';
  end if;

  if not exists (
    select 1
    from public.import_proposals
    where id=dismissed_id
      and status='DISMISSED'
      and accepted_evidence_id is null
  ) then
    raise exception 'B5_DISMISS_FAILED';
  end if;
end $$;

do $$
declare
  dismissed_id uuid := (select proposal_2_id from b5_state);
begin
  begin
    perform * from public.cv_engine_accept_import_proposal(dismissed_id,'PROJECT');
    raise exception 'B5_DISMISSED_PROPOSAL_ACCEPTED';
  exception
    when check_violation then null;
  end;
end $$;

-- Proposal-hash mismatch must roll the entire receipt transaction back.
create temporary table b5_bad_hash as
select :'hashes_bad_source_hash'::text source_hash,
       :'hashes_extracted_hash'::text extracted_hash;

do $$
declare
  source_hash_value text := (select source_hash from b5_bad_hash);
  extracted_hash_value text := (select extracted_hash from b5_bad_hash);
begin
  begin
    perform * from public.cv_engine_record_resume_import(
      'bad.pdf','PDF',10,source_hash_value,extracted_hash_value,'EXTRACTED',null,
      jsonb_build_array(
        jsonb_build_object(
          'ordinal',1,
          'sourceLine',1,
          'canonicalText','Injected text',
          'sourceTextSha256',repeat('0',64)
        )
      )
    );
    raise exception 'B5_BAD_PROPOSAL_HASH_ACCEPTED';
  exception
    when check_violation then null;
  end;
end $$;

reset role;

do $$
declare
  bad_source_hash_value text := (select source_hash from b5_bad_hash);
begin
  if exists (
    select 1 from public.import_receipts where source_sha256=bad_source_hash_value
  ) then
    raise exception 'B5_BAD_IMPORT_PARTIAL_RECEIPT_SURVIVED';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name in ('import_receipts','import_proposals')
      and data_type='bytea'
  ) then
    raise exception 'B5_RAW_SOURCE_BYTES_ARE_DURABLE';
  end if;
end $$;
