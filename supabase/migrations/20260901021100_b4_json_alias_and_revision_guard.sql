begin;

do $$
declare
  v_def text;
  v_fixed text;
begin
  select pg_get_functiondef('public.cv_engine_create_resume_version(text,uuid)'::regprocedure) into v_def;
  if strpos(v_def, 'from jsonb_array_elements(v_claims) item') = 0 then
    raise exception 'B4_ALIAS_FIX_EXPECTED_PATTERN_MISSING';
  end if;
  v_fixed := replace(v_def, 'from jsonb_array_elements(v_claims) item', 'from jsonb_array_elements(v_claims) as items(item)');
  execute v_fixed;
end $$;

create or replace function public.cv_engine_guard_resume_claim_insert()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_current_revision integer;
  v_kind text;
  v_status text;
  v_text text;
begin
  select ce.current_revision, ce.kind, cer.verification_status, cer.canonical_text
    into v_current_revision, v_kind, v_status, v_text
  from public.career_evidence ce
  join public.career_evidence_revisions cer
    on cer.evidence_id = ce.id and cer.owner_user_id = ce.owner_user_id
   and cer.revision_number = new.evidence_revision
  where ce.id = new.evidence_id and ce.owner_user_id = new.owner_user_id;

  if v_current_revision is null then raise exception 'B4_EVIDENCE_NOT_FOUND' using errcode = '23514'; end if;
  if v_current_revision <> new.evidence_revision then raise exception 'B4_STALE_EVIDENCE_REVISION' using errcode = '23514'; end if;
  if v_kind is distinct from new.evidence_kind or v_status <> 'VERIFIED' or new.evidence_verification_status <> 'VERIFIED' then
    raise exception 'B4_EVIDENCE_PROVENANCE_MISMATCH' using errcode = '23514';
  end if;
  if v_text is distinct from new.evidence_canonical_text or new.rendered_text is distinct from v_text then
    raise exception 'B4_SOURCE_PRESERVATION_VIOLATION' using errcode = '23514';
  end if;
  if public.cv_engine_sha256(v_text) <> new.evidence_text_sha256 then raise exception 'B4_EVIDENCE_HASH_MISMATCH' using errcode = '23514'; end if;
  if public.cv_engine_sha256(new.evidence_id::text || chr(31) || new.evidence_revision::text || chr(31) || v_text) <> new.claim_sha256 then
    raise exception 'B4_CLAIM_HASH_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;

commit;
