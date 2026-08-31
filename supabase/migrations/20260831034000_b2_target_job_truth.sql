begin;

create table public.career_targets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  semantic_key text not null check (semantic_key ~ '^[0-9a-f]{64}$'),
  target_role text not null check (char_length(btrim(target_role)) between 1 and 300),
  job_family text check (job_family is null or char_length(btrim(job_family)) between 1 and 200),
  preferred_seniorities text[] not null default '{}',
  preferred_locations text[] not null default '{}',
  work_models text[] not null default '{}',
  employment_types text[] not null default '{}',
  industries text[] not null default '{}',
  relocation_preference text not null check (relocation_preference in ('UNSPECIFIED','NO','OPEN','YES')),
  priority text not null check (priority in ('PRIMARY','SECONDARY','EXPLORATORY')),
  is_active boolean not null default false,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint career_targets_owner_semantic_unique unique (owner_user_id, semantic_key),
  constraint career_targets_identity_owner unique (id, owner_user_id),
  constraint career_targets_seniority_values check (preferred_seniorities <@ array['INTERN','JUNIOR','MID','SENIOR','LEAD','STAFF','PRINCIPAL','MANAGER','DIRECTOR','EXECUTIVE']::text[]),
  constraint career_targets_work_model_values check (work_models <@ array['ONSITE','HYBRID','REMOTE']::text[]),
  constraint career_targets_employment_values check (employment_types <@ array['FULL_TIME','PART_TIME','CONTRACT','INTERNSHIP','TEMPORARY']::text[]),
  constraint career_targets_list_limits check (
    coalesce(cardinality(preferred_seniorities), 0) <= 10
    and coalesce(cardinality(preferred_locations), 0) <= 25
    and coalesce(cardinality(work_models), 0) <= 3
    and coalesce(cardinality(employment_types), 0) <= 5
    and coalesce(cardinality(industries), 0) <= 25
  )
);

create unique index career_targets_one_active_per_owner
  on public.career_targets(owner_user_id) where is_active;
create index career_targets_owner_created_idx
  on public.career_targets(owner_user_id, created_at desc);

create table public.job_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  semantic_key text not null check (semantic_key ~ '^[0-9a-f]{64}$'),
  source text not null check (source = 'MANUAL_JOB_DESCRIPTION'),
  role_title text not null check (char_length(btrim(role_title)) between 1 and 300),
  company text check (company is null or char_length(btrim(company)) between 1 and 300),
  raw_description text not null check (char_length(btrim(raw_description)) between 1 and 100000),
  raw_description_sha256 text not null check (raw_description_sha256 ~ '^[0-9a-f]{64}$'),
  analyzer_version text not null check (analyzer_version = 'b2-deterministic-job-intelligence-v1'),
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint job_snapshots_owner_semantic_unique unique (owner_user_id, semantic_key),
  constraint job_snapshots_identity_owner unique (id, owner_user_id),
  constraint job_snapshots_raw_hash_valid check (
    raw_description_sha256 = encode(digest(raw_description, 'sha256'), 'hex')
  )
);

create table public.job_requirements (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null,
  owner_user_id uuid not null,
  semantic_key text not null check (semantic_key ~ '^[0-9a-f]{64}$'),
  category text not null check (category in ('HARD_SKILL','SOFT_SKILL','RESPONSIBILITY','EXPERIENCE','EDUCATION','CERTIFICATION','DOMAIN','LANGUAGE','LOCATION','TOOL','SENIORITY')),
  importance text not null check (importance in ('REQUIRED','PREFERRED','CONTEXT')),
  canonical_concept text not null check (char_length(btrim(canonical_concept)) between 1 and 500),
  source_text text not null check (char_length(btrim(source_text)) between 1 and 5000),
  source_text_sha256 text not null check (source_text_sha256 ~ '^[0-9a-f]{64}$'),
  source_ordinal integer not null check (source_ordinal between 0 and 249),
  created_at timestamptz not null default now(),
  constraint job_requirements_snapshot_owner_fk foreign key (snapshot_id, owner_user_id)
    references public.job_snapshots(id, owner_user_id) on delete cascade,
  constraint job_requirements_ordinal_unique unique (snapshot_id, source_ordinal),
  constraint job_requirements_semantic_unique unique (snapshot_id, semantic_key),
  constraint job_requirements_source_hash_valid check (
    source_text_sha256 = encode(digest(source_text, 'sha256'), 'hex')
  )
);

create index job_snapshots_owner_created_idx on public.job_snapshots(owner_user_id, created_at desc);
create index job_requirements_snapshot_idx on public.job_requirements(snapshot_id, source_ordinal);

create or replace function public.cv_engine_guard_career_target_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id
     or new.semantic_key is distinct from old.semantic_key
     or new.target_role is distinct from old.target_role
     or new.job_family is distinct from old.job_family
     or new.preferred_seniorities is distinct from old.preferred_seniorities
     or new.preferred_locations is distinct from old.preferred_locations
     or new.work_models is distinct from old.work_models
     or new.employment_types is distinct from old.employment_types
     or new.industries is distinct from old.industries
     or new.relocation_preference is distinct from old.relocation_preference
     or new.priority is distinct from old.priority
     or new.created_at is distinct from old.created_at then
    raise exception 'CAREER_TARGET_SEMANTIC_FIELDS_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger career_targets_controlled_update
before update on public.career_targets
for each row execute function public.cv_engine_guard_career_target_update();

create or replace function public.cv_engine_reject_job_snapshot_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'JOB_SNAPSHOT_IMMUTABLE' using errcode = '23514';
end;
$$;

create trigger job_snapshots_immutable
before update on public.job_snapshots
for each row execute function public.cv_engine_reject_job_snapshot_update();

create trigger job_requirements_immutable
before update on public.job_requirements
for each row execute function public.cv_engine_reject_job_snapshot_update();

create or replace function public.cv_engine_validate_requirement_source()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_description text;
begin
  select raw_description into v_description
  from public.job_snapshots
  where id = new.snapshot_id and owner_user_id = new.owner_user_id;

  if v_description is null or position(new.source_text in v_description) = 0 then
    raise exception 'JOB_REQUIREMENT_SOURCE_NOT_IN_DESCRIPTION' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger job_requirements_source_guard
before insert on public.job_requirements
for each row execute function public.cv_engine_validate_requirement_source();

alter table public.career_targets enable row level security;
alter table public.job_snapshots enable row level security;
alter table public.job_requirements enable row level security;

create policy "career_targets_select_own" on public.career_targets for select to authenticated
using ((select auth.uid()) = owner_user_id);
create policy "job_snapshots_select_own" on public.job_snapshots for select to authenticated
using ((select auth.uid()) = owner_user_id);
create policy "job_requirements_select_own" on public.job_requirements for select to authenticated
using ((select auth.uid()) = owner_user_id);

revoke all on public.career_targets from anon, authenticated;
revoke all on public.job_snapshots from anon, authenticated;
revoke all on public.job_requirements from anon, authenticated;
grant select on public.career_targets to authenticated;
grant select on public.job_snapshots to authenticated;
grant select on public.job_requirements to authenticated;

create or replace function public.cv_engine_save_career_target(
  p_semantic_key text,
  p_target_role text,
  p_job_family text,
  p_preferred_seniorities text[],
  p_preferred_locations text[],
  p_work_models text[],
  p_employment_types text[],
  p_industries text[],
  p_relocation_preference text,
  p_priority text,
  p_activate boolean default true
)
returns table (target_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_target_id uuid;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));

  insert into public.career_targets (
    owner_user_id, semantic_key, target_role, job_family, preferred_seniorities,
    preferred_locations, work_models, employment_types, industries,
    relocation_preference, priority, is_active
  ) values (
    v_owner, p_semantic_key, p_target_role, nullif(btrim(p_job_family), ''),
    coalesce(p_preferred_seniorities, '{}'), coalesce(p_preferred_locations, '{}'),
    coalesce(p_work_models, '{}'), coalesce(p_employment_types, '{}'), coalesce(p_industries, '{}'),
    p_relocation_preference, p_priority, false
  )
  on conflict (owner_user_id, semantic_key) do nothing
  returning id into v_target_id;

  if v_target_id is null then
    select id into v_target_id from public.career_targets
    where owner_user_id = v_owner and semantic_key = p_semantic_key;
  end if;

  if p_activate then
    update public.career_targets set is_active = false
    where owner_user_id = v_owner and id <> v_target_id and is_active;
    update public.career_targets
    set is_active = true, activated_at = coalesce(activated_at, now())
    where id = v_target_id and owner_user_id = v_owner and not is_active;
  end if;

  target_id := v_target_id;
  return next;
end;
$$;

create or replace function public.cv_engine_activate_career_target(p_target_id uuid)
returns table (target_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_exists boolean;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  select exists(select 1 from public.career_targets where id = p_target_id and owner_user_id = v_owner) into v_exists;
  if not v_exists then raise exception 'CAREER_TARGET_NOT_FOUND' using errcode = 'P0002'; end if;

  update public.career_targets set is_active = false
  where owner_user_id = v_owner and id <> p_target_id and is_active;
  update public.career_targets
  set is_active = true, activated_at = coalesce(activated_at, now())
  where id = p_target_id and owner_user_id = v_owner and not is_active;

  target_id := p_target_id;
  return next;
end;
$$;

create or replace function public.cv_engine_create_job_snapshot(
  p_semantic_key text,
  p_role_title text,
  p_company text,
  p_raw_description text,
  p_raw_description_sha256 text,
  p_analyzer_version text,
  p_requirements jsonb
)
returns table (snapshot_id uuid, created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_snapshot_id uuid;
  v_created boolean := false;
  v_requirement jsonb;
  v_expected_requirement_key text;
  v_requirement_keys text := '';
  v_expected_snapshot_key text;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if jsonb_typeof(p_requirements) <> 'array' or jsonb_array_length(p_requirements) > 250 then
    raise exception 'JOB_REQUIREMENTS_INVALID' using errcode = '22023';
  end if;
  if p_raw_description_sha256 <> encode(digest(p_raw_description, 'sha256'), 'hex') then
    raise exception 'JOB_DESCRIPTION_HASH_MISMATCH' using errcode = '23514';
  end if;

  for v_requirement in select value from jsonb_array_elements(p_requirements) loop
    if position(v_requirement->>'sourceText' in p_raw_description) = 0 then
      raise exception 'JOB_REQUIREMENT_SOURCE_NOT_IN_DESCRIPTION' using errcode = '23514';
    end if;
    if (v_requirement->>'sourceTextSha256') <> encode(digest(v_requirement->>'sourceText', 'sha256'), 'hex') then
      raise exception 'JOB_REQUIREMENT_HASH_MISMATCH' using errcode = '23514';
    end if;
    v_expected_requirement_key := encode(digest(
      (v_requirement->>'category') || chr(31) ||
      (v_requirement->>'importance') || chr(31) ||
      lower(regexp_replace(btrim(v_requirement->>'canonicalConcept'), '\s+', ' ', 'g')) || chr(31) ||
      (v_requirement->>'sourceTextSha256') || chr(31) ||
      (v_requirement->>'sourceOrdinal'), 'sha256'), 'hex');
    if v_expected_requirement_key <> (v_requirement->>'semanticKey') then
      raise exception 'JOB_REQUIREMENT_SEMANTIC_KEY_MISMATCH' using errcode = '23514';
    end if;
    if v_requirement_keys <> '' then v_requirement_keys := v_requirement_keys || ','; end if;
    v_requirement_keys := v_requirement_keys || (v_requirement->>'semanticKey');
  end loop;

  v_expected_snapshot_key := encode(digest(
    'MANUAL_JOB_DESCRIPTION' || chr(31) ||
    lower(regexp_replace(btrim(p_role_title), '\s+', ' ', 'g')) || chr(31) ||
    case when p_company is null then '' else lower(regexp_replace(btrim(p_company), '\s+', ' ', 'g')) end || chr(31) ||
    p_raw_description_sha256 || chr(31) || p_analyzer_version || chr(31) || v_requirement_keys,
    'sha256'), 'hex');
  if v_expected_snapshot_key <> p_semantic_key then
    raise exception 'JOB_SNAPSHOT_SEMANTIC_KEY_MISMATCH' using errcode = '23514';
  end if;

  insert into public.job_snapshots (
    owner_user_id, semantic_key, source, role_title, company,
    raw_description, raw_description_sha256, analyzer_version
  ) values (
    v_owner, p_semantic_key, 'MANUAL_JOB_DESCRIPTION', p_role_title, nullif(btrim(p_company), ''),
    p_raw_description, p_raw_description_sha256, p_analyzer_version
  ) on conflict (owner_user_id, semantic_key) do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is not null then
    v_created := true;
    for v_requirement in select value from jsonb_array_elements(p_requirements) loop
      insert into public.job_requirements (
        snapshot_id, owner_user_id, semantic_key, category, importance,
        canonical_concept, source_text, source_text_sha256, source_ordinal
      ) values (
        v_snapshot_id, v_owner, v_requirement->>'semanticKey', v_requirement->>'category',
        v_requirement->>'importance', v_requirement->>'canonicalConcept', v_requirement->>'sourceText',
        v_requirement->>'sourceTextSha256', (v_requirement->>'sourceOrdinal')::integer
      );
    end loop;
  else
    select id into v_snapshot_id from public.job_snapshots
    where owner_user_id = v_owner and semantic_key = p_semantic_key;
    if not exists (
      select 1 from public.job_snapshots
      where id = v_snapshot_id and owner_user_id = v_owner
        and role_title = p_role_title
        and coalesce(company, '') = coalesce(nullif(btrim(p_company), ''), '')
        and raw_description_sha256 = p_raw_description_sha256
        and analyzer_version = p_analyzer_version
    ) then
      raise exception 'JOB_SNAPSHOT_SEMANTIC_COLLISION' using errcode = '23514';
    end if;
  end if;

  snapshot_id := v_snapshot_id;
  created := v_created;
  return next;
end;
$$;

revoke all on function public.cv_engine_save_career_target(text,text,text,text[],text[],text[],text[],text[],text,text,boolean) from public;
revoke all on function public.cv_engine_activate_career_target(uuid) from public;
revoke all on function public.cv_engine_create_job_snapshot(text,text,text,text,text,text,jsonb) from public;
grant execute on function public.cv_engine_save_career_target(text,text,text,text[],text[],text[],text[],text[],text,text,boolean) to authenticated;
grant execute on function public.cv_engine_activate_career_target(uuid) to authenticated;
grant execute on function public.cv_engine_create_job_snapshot(text,text,text,text,text,text,jsonb) to authenticated;

commit;
