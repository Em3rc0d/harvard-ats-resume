begin;

create table public.presentation_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  evidence_id uuid not null,
  evidence_revision integer not null check (evidence_revision > 0),
  source_text_sha256 text not null check (source_text_sha256 ~ '^[0-9a-f]{64}$'),
  proposed_text text not null check (char_length(btrim(proposed_text)) between 1 and 10000),
  proposed_text_sha256 text not null check (proposed_text_sha256 ~ '^[0-9a-f]{64}$'),
  capability text not null check (capability = 'INLINE_WORDING_OPTIMIZATION'),
  provider text not null check (provider in ('gemini','ollama')),
  model text not null check (char_length(btrim(model)) between 1 and 200),
  provider_contract_version text not null check (char_length(btrim(provider_contract_version)) between 1 and 200),
  provider_attempt integer not null check (provider_attempt between 1 and 3),
  provider_fallback_used boolean not null,
  provider_credential_mode text not null check (provider_credential_mode in ('PLATFORM','BYOK','LOCAL_ONLY')),
  provider_request_id text not null check (char_length(btrim(provider_request_id)) between 1 and 200),
  validator_version text not null check (validator_version = 'b9-presentation-validator-v1'),
  validation_result jsonb not null check (jsonb_typeof(validation_result) = 'object'),
  status text not null default 'PROPOSED' check (status in ('PROPOSED','APPROVED','REJECTED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint presentation_revisions_source_owner_fk
    foreign key (evidence_id, evidence_revision, owner_user_id)
    references public.career_evidence_revisions(evidence_id, revision_number, owner_user_id)
    on delete restrict,
  constraint presentation_revisions_identity_owner unique (id, owner_user_id),
  constraint presentation_revisions_semantic_unique unique (
    owner_user_id, evidence_id, evidence_revision, proposed_text_sha256, validator_version
  ),
  constraint presentation_revisions_resolution_shape check (
    (status = 'PROPOSED' and resolved_at is null)
    or
    (status in ('APPROVED','REJECTED') and resolved_at is not null)
  ),
  constraint presentation_revisions_validation_pass check (
    validation_result->>'status' = 'PASS'
    and jsonb_typeof(validation_result->'reasonCodes') = 'array'
    and jsonb_array_length(validation_result->'reasonCodes') = 0
  )
);

create index presentation_revisions_owner_created_idx
  on public.presentation_revisions(owner_user_id, created_at desc);
create index presentation_revisions_evidence_idx
  on public.presentation_revisions(owner_user_id, evidence_id, evidence_revision, created_at desc);

create or replace function public.cv_engine_guard_presentation_revision_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.owner_user_id <> old.owner_user_id
     or new.evidence_id <> old.evidence_id
     or new.evidence_revision <> old.evidence_revision
     or new.source_text_sha256 <> old.source_text_sha256
     or new.proposed_text <> old.proposed_text
     or new.proposed_text_sha256 <> old.proposed_text_sha256
     or new.capability <> old.capability
     or new.provider <> old.provider
     or new.model <> old.model
     or new.provider_contract_version <> old.provider_contract_version
     or new.provider_attempt <> old.provider_attempt
     or new.provider_fallback_used <> old.provider_fallback_used
     or new.provider_credential_mode <> old.provider_credential_mode
     or new.provider_request_id <> old.provider_request_id
     or new.validator_version <> old.validator_version
     or new.validation_result <> old.validation_result
     or new.created_at <> old.created_at then
    raise exception 'B9_PRESENTATION_STABLE_FIELDS_IMMUTABLE' using errcode = '23514';
  end if;

  if old.status <> 'PROPOSED'
     or new.status not in ('APPROVED','REJECTED')
     or old.resolved_at is not null
     or new.resolved_at is null then
    raise exception 'B9_PRESENTATION_INVALID_TRANSITION' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger presentation_revisions_update_guard
before update on public.presentation_revisions
for each row execute function public.cv_engine_guard_presentation_revision_update();

alter table public.presentation_revisions enable row level security;

create policy "presentation_revisions_select_own"
on public.presentation_revisions for select to authenticated
using ((select auth.uid()) = owner_user_id);

revoke all on public.presentation_revisions from public, anon, authenticated;
grant select on public.presentation_revisions to authenticated;

create or replace function public.cv_engine_record_presentation_proposal(
  p_evidence_id uuid,
  p_evidence_revision integer,
  p_source_text_sha256 text,
  p_proposed_text text,
  p_proposed_text_sha256 text,
  p_provider text,
  p_model text,
  p_provider_contract_version text,
  p_provider_attempt integer,
  p_provider_fallback_used boolean,
  p_provider_credential_mode text,
  p_provider_request_id text,
  p_validator_version text,
  p_validation_result jsonb
)
returns table (presentation_revision_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_current_revision integer;
  v_verification_status text;
  v_source_text text;
  v_existing_id uuid;
  v_id uuid;
begin
  if v_owner is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  select ce.current_revision, cer.verification_status, cer.canonical_text
    into v_current_revision, v_verification_status, v_source_text
  from public.career_evidence ce
  join public.career_evidence_revisions cer
    on cer.evidence_id = ce.id
   and cer.owner_user_id = ce.owner_user_id
   and cer.revision_number = p_evidence_revision
  where ce.id = p_evidence_id
    and ce.owner_user_id = v_owner;

  if v_current_revision is null then
    raise exception 'B9_EVIDENCE_REVISION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current_revision <> p_evidence_revision then
    raise exception 'B9_SOURCE_REVISION_STALE' using errcode = '40001';
  end if;
  if v_verification_status <> 'VERIFIED' then
    raise exception 'B9_SOURCE_NOT_VERIFIED' using errcode = '23514';
  end if;
  if public.cv_engine_sha256(v_source_text) <> p_source_text_sha256 then
    raise exception 'B9_SOURCE_HASH_MISMATCH' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_proposed_text,''))) not between 1 and 10000 then
    raise exception 'B9_PROPOSED_TEXT_INVALID' using errcode = '22023';
  end if;
  if btrim(p_proposed_text) = btrim(v_source_text) then
    raise exception 'B9_PROPOSAL_NO_CHANGE' using errcode = '22023';
  end if;
  if public.cv_engine_sha256(btrim(p_proposed_text)) <> p_proposed_text_sha256 then
    raise exception 'B9_PROPOSED_HASH_MISMATCH' using errcode = '23514';
  end if;
  if p_provider not in ('gemini','ollama') then
    raise exception 'B9_PROVIDER_INVALID' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_model,''))) not between 1 and 200 then
    raise exception 'B9_MODEL_INVALID' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_provider_contract_version,''))) not between 1 and 200 then
    raise exception 'B9_PROVIDER_CONTRACT_INVALID' using errcode = '22023';
  end if;
  if p_provider_attempt not between 1 and 3 then
    raise exception 'B9_PROVIDER_ATTEMPT_INVALID' using errcode = '22023';
  end if;
  if p_provider_credential_mode not in ('PLATFORM','BYOK','LOCAL_ONLY') then
    raise exception 'B9_CREDENTIAL_MODE_INVALID' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_provider_request_id,''))) not between 1 and 200 then
    raise exception 'B9_PROVIDER_REQUEST_ID_INVALID' using errcode = '22023';
  end if;
  if p_validator_version <> 'b9-presentation-validator-v1' then
    raise exception 'B9_VALIDATOR_VERSION_INVALID' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_validation_result, 'null'::jsonb)) <> 'object'
     or p_validation_result->>'status' <> 'PASS'
     or jsonb_typeof(p_validation_result->'reasonCodes') <> 'array'
     or jsonb_array_length(p_validation_result->'reasonCodes') <> 0 then
    raise exception 'B9_VALIDATION_NOT_PASS' using errcode = '23514';
  end if;

  select pr.id into v_existing_id
  from public.presentation_revisions pr
  where pr.owner_user_id = v_owner
    and pr.evidence_id = p_evidence_id
    and pr.evidence_revision = p_evidence_revision
    and pr.proposed_text_sha256 = p_proposed_text_sha256
    and pr.validator_version = p_validator_version;

  if v_existing_id is not null then
    presentation_revision_id := v_existing_id;
    created := false;
    return next;
    return;
  end if;

  insert into public.presentation_revisions(
    owner_user_id, evidence_id, evidence_revision,
    source_text_sha256, proposed_text, proposed_text_sha256,
    capability, provider, model, provider_contract_version,
    provider_attempt, provider_fallback_used, provider_credential_mode,
    provider_request_id, validator_version, validation_result
  ) values (
    v_owner, p_evidence_id, p_evidence_revision,
    p_source_text_sha256, btrim(p_proposed_text), p_proposed_text_sha256,
    'INLINE_WORDING_OPTIMIZATION', p_provider, btrim(p_model), btrim(p_provider_contract_version),
    p_provider_attempt, p_provider_fallback_used, p_provider_credential_mode,
    btrim(p_provider_request_id), p_validator_version, p_validation_result
  ) returning id into v_id;

  presentation_revision_id := v_id;
  created := true;
  return next;
end;
$$;

create or replace function public.cv_engine_resolve_presentation_revision(
  p_presentation_revision_id uuid,
  p_decision text
)
returns table (presentation_revision_id uuid, status text, resolved_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_row public.presentation_revisions%rowtype;
  v_current_revision integer;
  v_verification_status text;
  v_decision text := upper(coalesce(p_decision,''));
begin
  if v_owner is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if v_decision not in ('APPROVE','REJECT') then
    raise exception 'B9_DECISION_INVALID' using errcode = '22023';
  end if;

  select * into v_row
  from public.presentation_revisions pr
  where pr.id = p_presentation_revision_id
    and pr.owner_user_id = v_owner
  for update;

  if v_row.id is null then
    raise exception 'B9_PRESENTATION_REVISION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_row.status <> 'PROPOSED' then
    raise exception 'B9_PRESENTATION_ALREADY_RESOLVED' using errcode = '23514';
  end if;

  if v_decision = 'APPROVE' then
    select ce.current_revision, cer.verification_status
      into v_current_revision, v_verification_status
    from public.career_evidence ce
    join public.career_evidence_revisions cer
      on cer.evidence_id = ce.id
     and cer.owner_user_id = ce.owner_user_id
     and cer.revision_number = v_row.evidence_revision
    where ce.id = v_row.evidence_id
      and ce.owner_user_id = v_owner;

    if v_current_revision is null
       or v_current_revision <> v_row.evidence_revision
       or v_verification_status <> 'VERIFIED' then
      raise exception 'B9_APPROVAL_SOURCE_STALE' using errcode = '40001';
    end if;
  end if;

  update public.presentation_revisions
  set status = case when v_decision = 'APPROVE' then 'APPROVED' else 'REJECTED' end,
      resolved_at = now()
  where id = v_row.id
  returning id, presentation_revisions.status, presentation_revisions.resolved_at
    into presentation_revision_id, status, resolved_at;

  return next;
end;
$$;

revoke all on function public.cv_engine_record_presentation_proposal(
  uuid, integer, text, text, text, text, text, text, integer, boolean, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.cv_engine_resolve_presentation_revision(uuid, text)
  from public, anon, authenticated;

grant execute on function public.cv_engine_record_presentation_proposal(
  uuid, integer, text, text, text, text, text, text, integer, boolean, text, text, text, jsonb
) to authenticated;
grant execute on function public.cv_engine_resolve_presentation_revision(uuid, text)
  to authenticated;

commit;
