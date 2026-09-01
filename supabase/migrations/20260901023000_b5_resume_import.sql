begin;

create table public.import_receipts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_name text not null check (char_length(btrim(source_name)) between 1 and 255),
  media_type text not null check (media_type in ('PDF','DOCX')),
  source_size_bytes integer not null check (source_size_bytes between 1 and 5242880),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  extracted_text_sha256 text check (extracted_text_sha256 is null or extracted_text_sha256 ~ '^[0-9a-f]{64}$'),
  extractor_version text not null check (extractor_version = 'b5-mechanical-resume-extractor-v1'),
  proposal_version text not null check (proposal_version = 'b5-line-proposals-v1'),
  status text not null check (status in ('EXTRACTED','UNSUPPORTED','EMPTY','REJECTED')),
  warning_code text check (warning_code is null or char_length(btrim(warning_code)) between 1 and 100),
  proposal_count integer not null check (proposal_count between 0 and 100),
  created_at timestamptz not null default now(),
  constraint import_receipts_extraction_shape check (
    (status = 'EXTRACTED' and extracted_text_sha256 is not null and proposal_count > 0)
    or
    (status <> 'EXTRACTED' and proposal_count = 0)
  ),
  constraint import_receipts_owner_source_unique unique (owner_user_id, source_sha256, extractor_version),
  constraint import_receipts_identity_owner unique (id, owner_user_id)
);

create table public.import_proposals (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null,
  owner_user_id uuid not null,
  ordinal integer not null check (ordinal between 1 and 100),
  source_line integer not null check (source_line > 0),
  canonical_text text not null check (char_length(btrim(canonical_text)) between 1 and 1000),
  source_text_sha256 text not null check (source_text_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','DISMISSED')),
  accepted_evidence_id uuid,
  created_at timestamptz not null default now(),
  constraint import_proposals_receipt_owner_fk foreign key (receipt_id, owner_user_id)
    references public.import_receipts(id, owner_user_id) on delete cascade,
  constraint import_proposals_evidence_owner_fk foreign key (accepted_evidence_id, owner_user_id)
    references public.career_evidence(id, owner_user_id) on delete restrict,
  constraint import_proposals_acceptance_shape check (
    (status = 'ACCEPTED' and accepted_evidence_id is not null)
    or
    (status in ('PENDING','DISMISSED') and accepted_evidence_id is null)
  ),
  constraint import_proposals_receipt_ordinal_unique unique (receipt_id, ordinal)
);

create index import_receipts_owner_created_idx on public.import_receipts(owner_user_id, created_at desc);
create index import_proposals_owner_receipt_idx on public.import_proposals(owner_user_id, receipt_id, ordinal);

create or replace function public.cv_engine_guard_import_receipt_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'B5_IMPORT_RECEIPT_IMMUTABLE' using errcode = '23514';
end;
$$;
create trigger import_receipts_immutable before update on public.import_receipts
for each row execute function public.cv_engine_guard_import_receipt_update();

create or replace function public.cv_engine_guard_import_proposal_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id
     or new.receipt_id <> old.receipt_id
     or new.owner_user_id <> old.owner_user_id
     or new.ordinal <> old.ordinal
     or new.source_line <> old.source_line
     or new.canonical_text <> old.canonical_text
     or new.source_text_sha256 <> old.source_text_sha256
     or new.created_at <> old.created_at then
    raise exception 'B5_IMPORT_PROPOSAL_STABLE_FIELDS_IMMUTABLE' using errcode = '23514';
  end if;
  if old.status <> 'PENDING' or new.status not in ('ACCEPTED','DISMISSED') then
    raise exception 'B5_IMPORT_PROPOSAL_INVALID_TRANSITION' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger import_proposals_transition_guard before update on public.import_proposals
for each row execute function public.cv_engine_guard_import_proposal_update();

alter table public.import_receipts enable row level security;
alter table public.import_proposals enable row level security;

create policy "import_receipts_select_own" on public.import_receipts for select to authenticated
using ((select auth.uid()) = owner_user_id);
create policy "import_proposals_select_own" on public.import_proposals for select to authenticated
using ((select auth.uid()) = owner_user_id);

revoke all on public.import_receipts from anon, authenticated;
revoke all on public.import_proposals from anon, authenticated;
grant select on public.import_receipts to authenticated;
grant select on public.import_proposals to authenticated;

create or replace function public.cv_engine_record_resume_import(
  p_source_name text,
  p_media_type text,
  p_source_size_bytes integer,
  p_source_sha256 text,
  p_extracted_text_sha256 text,
  p_status text,
  p_warning_code text,
  p_proposals jsonb
)
returns table (receipt_id uuid, created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_receipt_id uuid;
  v_count integer;
  v_item jsonb;
  v_expected_ordinal integer := 1;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if char_length(btrim(coalesce(p_source_name,''))) not between 1 and 255 then raise exception 'B5_SOURCE_NAME_INVALID' using errcode = '22023'; end if;
  if p_media_type not in ('PDF','DOCX') then raise exception 'B5_MEDIA_TYPE_INVALID' using errcode = '22023'; end if;
  if p_source_size_bytes not between 1 and 5242880 then raise exception 'B5_SOURCE_SIZE_INVALID' using errcode = '22023'; end if;
  if p_source_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'B5_SOURCE_HASH_INVALID' using errcode = '22023'; end if;
  if p_status not in ('EXTRACTED','UNSUPPORTED','EMPTY','REJECTED') then raise exception 'B5_STATUS_INVALID' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_proposals,'[]'::jsonb)) <> 'array' then raise exception 'B5_PROPOSALS_INVALID' using errcode = '22023'; end if;
  v_count := jsonb_array_length(coalesce(p_proposals,'[]'::jsonb));
  if v_count > 100 then raise exception 'B5_PROPOSAL_LIMIT_EXCEEDED' using errcode = '22023'; end if;
  if p_status = 'EXTRACTED' and (p_extracted_text_sha256 is null or p_extracted_text_sha256 !~ '^[0-9a-f]{64}$' or v_count = 0) then
    raise exception 'B5_EXTRACTED_SHAPE_INVALID' using errcode = '22023';
  end if;
  if p_status <> 'EXTRACTED' and v_count <> 0 then raise exception 'B5_NONEXTRACTED_PROPOSALS_FORBIDDEN' using errcode = '22023'; end if;

  select ir.id into v_receipt_id
  from public.import_receipts ir
  where ir.owner_user_id = v_owner and ir.source_sha256 = p_source_sha256 and ir.extractor_version = 'b5-mechanical-resume-extractor-v1';
  if v_receipt_id is not null then
    receipt_id := v_receipt_id; created := false; return next; return;
  end if;

  insert into public.import_receipts(
    owner_user_id, source_name, media_type, source_size_bytes, source_sha256,
    extracted_text_sha256, extractor_version, proposal_version, status, warning_code, proposal_count
  ) values (
    v_owner, btrim(p_source_name), p_media_type, p_source_size_bytes, p_source_sha256,
    p_extracted_text_sha256, 'b5-mechanical-resume-extractor-v1', 'b5-line-proposals-v1', p_status,
    nullif(btrim(coalesce(p_warning_code,'')),''), v_count
  ) returning id into v_receipt_id;

  if p_status = 'EXTRACTED' then
    for v_item in select value from jsonb_array_elements(p_proposals) loop
      if (v_item->>'ordinal')::integer <> v_expected_ordinal then raise exception 'B5_PROPOSAL_ORDINAL_INVALID' using errcode = '22023'; end if;
      if (v_item->>'sourceLine')::integer <= 0 then raise exception 'B5_PROPOSAL_SOURCE_LINE_INVALID' using errcode = '22023'; end if;
      if char_length(btrim(coalesce(v_item->>'canonicalText',''))) not between 1 and 1000 then raise exception 'B5_PROPOSAL_TEXT_INVALID' using errcode = '22023'; end if;
      if public.cv_engine_sha256(btrim(v_item->>'canonicalText')) <> v_item->>'sourceTextSha256' then raise exception 'B5_PROPOSAL_HASH_MISMATCH' using errcode = '23514'; end if;
      insert into public.import_proposals(receipt_id, owner_user_id, ordinal, source_line, canonical_text, source_text_sha256)
      values (v_receipt_id, v_owner, v_expected_ordinal, (v_item->>'sourceLine')::integer, btrim(v_item->>'canonicalText'), v_item->>'sourceTextSha256');
      v_expected_ordinal := v_expected_ordinal + 1;
    end loop;
  end if;

  receipt_id := v_receipt_id; created := true; return next;
end;
$$;

create or replace function public.cv_engine_accept_import_proposal(p_proposal_id uuid, p_kind text)
returns table (evidence_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_proposal public.import_proposals%rowtype;
  v_evidence_id uuid;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if p_kind not in ('EMPLOYMENT','PROJECT','ACHIEVEMENT','EDUCATION','CERTIFICATION','SKILL','LANGUAGE','METRIC') then
    raise exception 'B5_EVIDENCE_KIND_INVALID' using errcode = '22023';
  end if;
  select * into v_proposal from public.import_proposals ip
  where ip.id = p_proposal_id and ip.owner_user_id = v_owner
  for update;
  if v_proposal.id is null then raise exception 'IMPORT_PROPOSAL_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_proposal.status <> 'PENDING' then raise exception 'B5_IMPORT_PROPOSAL_ALREADY_RESOLVED' using errcode = '23514'; end if;

  select x.evidence_id into v_evidence_id
  from public.cv_engine_create_career_evidence(
    p_kind,
    'IMPORTED_RESUME',
    'NEEDS_REVIEW',
    v_proposal.canonical_text,
    v_proposal.receipt_id
  ) x limit 1;

  update public.import_proposals
  set status = 'ACCEPTED', accepted_evidence_id = v_evidence_id
  where id = v_proposal.id;

  evidence_id := v_evidence_id; return next;
end;
$$;

create or replace function public.cv_engine_dismiss_import_proposal(p_proposal_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_status text;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  select ip.status into v_status from public.import_proposals ip
  where ip.id = p_proposal_id and ip.owner_user_id = v_owner for update;
  if v_status is null then raise exception 'IMPORT_PROPOSAL_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_status <> 'PENDING' then raise exception 'B5_IMPORT_PROPOSAL_ALREADY_RESOLVED' using errcode = '23514'; end if;
  update public.import_proposals set status = 'DISMISSED', accepted_evidence_id = null where id = p_proposal_id;
end;
$$;

revoke all on function public.cv_engine_record_resume_import(text,text,integer,text,text,text,text,jsonb) from public, anon;
revoke all on function public.cv_engine_accept_import_proposal(uuid,text) from public, anon;
revoke all on function public.cv_engine_dismiss_import_proposal(uuid) from public, anon;
grant execute on function public.cv_engine_record_resume_import(text,text,integer,text,text,text,text,jsonb) to authenticated;
grant execute on function public.cv_engine_accept_import_proposal(uuid,text) to authenticated;
grant execute on function public.cv_engine_dismiss_import_proposal(uuid) to authenticated;

commit;
