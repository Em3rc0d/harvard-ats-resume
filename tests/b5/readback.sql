\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';

do $$ declare receipt_count integer; proposal_count integer; accepted_count integer; begin
  select count(*) into receipt_count from public.import_receipts;
  select count(*) into proposal_count from public.import_proposals;
  select count(*) into accepted_count from public.import_proposals where status='ACCEPTED';
  if receipt_count <> 1 then raise exception 'B5_DURABLE_RECEIPT_COUNT_MISMATCH:%', receipt_count; end if;
  if proposal_count <> 3 then raise exception 'B5_DURABLE_PROPOSAL_COUNT_MISMATCH:%', proposal_count; end if;
  if accepted_count <> 1 then raise exception 'B5_DURABLE_ACCEPTED_COUNT_MISMATCH:%', accepted_count; end if;
  if not exists (
    select 1 from public.import_proposals ip
    join public.career_evidence ce on ce.id=ip.accepted_evidence_id and ce.owner_user_id=ip.owner_user_id
    join public.career_evidence_revisions cer on cer.evidence_id=ce.id and cer.owner_user_id=ce.owner_user_id and cer.revision_number=ce.current_revision
    where ip.status='ACCEPTED' and ce.source='IMPORTED_RESUME' and cer.verification_status='NEEDS_REVIEW' and cer.canonical_text=ip.canonical_text
  ) then raise exception 'B5_DURABLE_ACCEPTED_PROVENANCE_MISMATCH'; end if;
end $$;
reset role;
