begin;

create or replace function public.cv_engine_accept_import_proposal_group(
  p_proposal_ids uuid[],
  p_kind text
)
returns table (accepted_evidence_id uuid, source_receipt_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_requested integer := coalesce(cardinality(p_proposal_ids), 0);
  v_total integer;
  v_pending integer;
  v_receipts integer;
  v_min_ordinal integer;
  v_max_ordinal integer;
  v_receipt_id uuid;
  v_canonical_text text;
  v_evidence_id uuid;
begin
  if v_owner is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if p_kind not in ('EMPLOYMENT','PROJECT','ACHIEVEMENT','EDUCATION','CERTIFICATION','SKILL','LANGUAGE','METRIC') then
    raise exception 'B5_EVIDENCE_KIND_INVALID' using errcode = '22023';
  end if;
  if v_requested < 2 or v_requested > 20 then
    raise exception 'B5_IMPORT_GROUP_SIZE_INVALID' using errcode = '22023';
  end if;
  if v_requested <> (
    select count(distinct requested.id)
    from unnest(p_proposal_ids) as requested(id)
  ) then
    raise exception 'B5_IMPORT_GROUP_DUPLICATE_ID' using errcode = '22023';
  end if;

  perform 1
  from public.import_proposals ip
  where ip.owner_user_id = v_owner
    and ip.id = any(p_proposal_ids)
  order by ip.id
  for update;

  select count(*),
         count(*) filter (where ip.status = 'PENDING'),
         count(distinct ip.receipt_id),
         min(ip.ordinal),
         max(ip.ordinal),
         string_agg(ip.canonical_text, E'\n' order by ip.ordinal)
    into v_total, v_pending, v_receipts, v_min_ordinal, v_max_ordinal, v_canonical_text
  from public.import_proposals ip
  where ip.owner_user_id = v_owner
    and ip.id = any(p_proposal_ids);

  if v_total <> v_requested then
    raise exception 'B5_IMPORT_GROUP_PROPOSAL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_pending <> v_total then
    raise exception 'B5_IMPORT_PROPOSAL_ALREADY_RESOLVED' using errcode = '23514';
  end if;
  if v_receipts <> 1 then
    raise exception 'B5_IMPORT_GROUP_RECEIPT_MISMATCH' using errcode = '23514';
  end if;
  if v_max_ordinal - v_min_ordinal + 1 <> v_total then
    raise exception 'B5_IMPORT_GROUP_NONCONTIGUOUS' using errcode = '23514';
  end if;
  if char_length(v_canonical_text) > 10000 then
    raise exception 'B5_IMPORT_GROUP_TEXT_TOO_LONG' using errcode = '22023';
  end if;

  select ip.receipt_id into v_receipt_id
  from public.import_proposals ip
  where ip.owner_user_id = v_owner
    and ip.id = any(p_proposal_ids)
  order by ip.ordinal
  limit 1;

  select created.evidence_id into v_evidence_id
  from public.cv_engine_create_career_evidence(
    p_kind,
    'IMPORTED_RESUME',
    'NEEDS_REVIEW',
    v_canonical_text,
    v_receipt_id
  ) created
  limit 1;

  update public.import_proposals ip
  set status = 'ACCEPTED', accepted_evidence_id = v_evidence_id
  where ip.owner_user_id = v_owner
    and ip.id = any(p_proposal_ids);

  accepted_evidence_id := v_evidence_id;
  source_receipt_id := v_receipt_id;
  return next;
end;
$$;

revoke all on function public.cv_engine_accept_import_proposal_group(uuid[], text) from public, anon, authenticated;
grant execute on function public.cv_engine_accept_import_proposal_group(uuid[], text) to authenticated;

commit;
