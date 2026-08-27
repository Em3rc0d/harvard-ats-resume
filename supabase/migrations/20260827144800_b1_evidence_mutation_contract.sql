begin;

create or replace function public.cv_engine_guard_evidence_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id
     or new.vault_id is distinct from old.vault_id
     or new.kind is distinct from old.kind
     or new.source is distinct from old.source
     or new.created_at is distinct from old.created_at then
    raise exception 'CAREER_EVIDENCE_STABLE_FIELDS_IMMUTABLE' using errcode = '23514';
  end if;

  if new.current_revision <> old.current_revision + 1 then
    raise exception 'CAREER_EVIDENCE_REVISION_MUST_ADVANCE_BY_ONE' using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists career_evidence_owner_immutable on public.career_evidence;

create trigger career_evidence_controlled_update
before update on public.career_evidence
for each row execute function public.cv_engine_guard_evidence_update();

create or replace function public.cv_engine_create_career_evidence(
  p_kind text,
  p_source text,
  p_verification_status text,
  p_canonical_text text,
  p_source_document_id uuid default null
)
returns table (
  evidence_id uuid,
  revision_id uuid,
  revision_number integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_vault_id uuid;
  v_evidence_id uuid := gen_random_uuid();
  v_revision_id uuid := gen_random_uuid();
begin
  if v_owner is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  insert into public.career_vaults (owner_user_id)
  values (v_owner)
  on conflict (owner_user_id) do update
    set updated_at = public.career_vaults.updated_at
  returning id into v_vault_id;

  insert into public.career_evidence (
    id, vault_id, owner_user_id, kind, source, current_revision
  ) values (
    v_evidence_id, v_vault_id, v_owner, p_kind, p_source, 1
  );

  insert into public.career_evidence_revisions (
    id,
    evidence_id,
    owner_user_id,
    revision_number,
    verification_status,
    canonical_text,
    source_document_id
  ) values (
    v_revision_id,
    v_evidence_id,
    v_owner,
    1,
    p_verification_status,
    p_canonical_text,
    p_source_document_id
  );

  evidence_id := v_evidence_id;
  revision_id := v_revision_id;
  revision_number := 1;
  return next;
end;
$$;

create or replace function public.cv_engine_revise_career_evidence(
  p_evidence_id uuid,
  p_expected_revision integer,
  p_verification_status text,
  p_canonical_text text,
  p_source_document_id uuid default null
)
returns table (
  evidence_id uuid,
  revision_id uuid,
  revision_number integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_current integer;
  v_next integer;
  v_revision_id uuid := gen_random_uuid();
begin
  if v_owner is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  select current_revision
    into v_current
  from public.career_evidence
  where id = p_evidence_id
    and owner_user_id = v_owner
  for update;

  if not found then
    raise exception 'CAREER_EVIDENCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_current <> p_expected_revision then
    raise exception 'CAREER_EVIDENCE_REVISION_CONFLICT' using errcode = '40001';
  end if;

  v_next := v_current + 1;

  insert into public.career_evidence_revisions (
    id,
    evidence_id,
    owner_user_id,
    revision_number,
    verification_status,
    canonical_text,
    source_document_id
  ) values (
    v_revision_id,
    p_evidence_id,
    v_owner,
    v_next,
    p_verification_status,
    p_canonical_text,
    p_source_document_id
  );

  update public.career_evidence
  set current_revision = v_next
  where id = p_evidence_id
    and owner_user_id = v_owner;

  evidence_id := p_evidence_id;
  revision_id := v_revision_id;
  revision_number := v_next;
  return next;
end;
$$;

revoke all on function public.cv_engine_create_career_evidence(text, text, text, text, uuid) from public;
revoke all on function public.cv_engine_revise_career_evidence(uuid, integer, text, text, uuid) from public;

grant execute on function public.cv_engine_create_career_evidence(text, text, text, text, uuid) to authenticated;
grant execute on function public.cv_engine_revise_career_evidence(uuid, integer, text, text, uuid) to authenticated;

commit;
