\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';

do $$ declare bad_count integer; begin
  if (select count(*) from public.resume_versions) < 3 then raise exception 'B4_DURABLE_RESUME_READBACK_MISSING'; end if;
  if (select count(*) from public.resume_claims) < 6 then raise exception 'B4_DURABLE_CLAIM_READBACK_MISSING'; end if;

  select count(*) into bad_count
  from public.resume_versions rv
  where jsonb_array_length(rv.document_json->'claims') <> (select count(*) from public.resume_claims rc where rc.resume_version_id=rv.id)
     or (rv.manifest->>'claimCount')::integer <> (select count(*) from public.resume_claims rc where rc.resume_version_id=rv.id)
     or rv.plain_text <> (select string_agg(rc.rendered_text,E'\n' order by rc.ordinal) from public.resume_claims rc where rc.resume_version_id=rv.id);
  if bad_count <> 0 then raise exception 'B4_RENDERER_OR_MANIFEST_READBACK_MISMATCH:%', bad_count; end if;

  if exists (select 1 from public.resume_claims where evidence_verification_status <> 'VERIFIED' or rendered_text <> evidence_canonical_text) then
    raise exception 'B4_SOURCE_PROVENANCE_READBACK_MISMATCH';
  end if;
end $$;
reset role;

-- Hash helpers are intentionally unavailable to authenticated clients. Verify hashes as the migration owner without weakening that boundary.
do $$ begin
  if exists (
    select 1 from public.resume_claims rc
    where rc.evidence_text_sha256 <> public.cv_engine_sha256(rc.evidence_canonical_text)
       or rc.claim_sha256 <> public.cv_engine_sha256(rc.evidence_id::text || chr(31) || rc.evidence_revision::text || chr(31) || rc.evidence_canonical_text)
  ) then raise exception 'B4_HASH_PROVENANCE_READBACK_MISMATCH'; end if;
end $$;
