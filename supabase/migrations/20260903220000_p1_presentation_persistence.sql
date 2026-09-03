begin;

create table public.presentation_plans (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('GENERAL','TARGETED')),
  career_target_id uuid,
  job_snapshot_id uuid,
  opportunity_assessment_id uuid,
  renderer_profile text not null check (renderer_profile = 'ATS_SINGLE_COLUMN_V1'),
  selected_evidence_refs jsonb not null check (jsonb_typeof(selected_evidence_refs) = 'array' and jsonb_array_length(selected_evidence_refs) > 0),
  excluded_evidence_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(excluded_evidence_refs) = 'array'),
  sections jsonb not null check (jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) > 0),
  plan_sha256 text not null check (plan_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint presentation_plans_identity_owner unique (id, owner_user_id),
  constraint presentation_plans_target_owner_fk foreign key (career_target_id, owner_user_id)
    references public.career_targets(id, owner_user_id) on delete restrict,
  constraint presentation_plans_job_owner_fk foreign key (job_snapshot_id, owner_user_id)
    references public.job_snapshots(id, owner_user_id) on delete restrict,
  constraint presentation_plans_assessment_owner_fk foreign key (opportunity_assessment_id, owner_user_id)
    references public.opportunity_assessments(id, owner_user_id) on delete restrict,
  constraint presentation_plans_context_shape check (
    (mode = 'GENERAL' and job_snapshot_id is null and opportunity_assessment_id is null)
    or
    (mode = 'TARGETED' and job_snapshot_id is not null and opportunity_assessment_id is not null)
  )
);

create table public.presentation_plan_evidence (
  plan_id uuid not null,
  owner_user_id uuid not null,
  selection text not null check (selection in ('SELECTED','EXCLUDED')),
  ordinal integer not null check (ordinal >= 0 and ordinal < 10000),
  evidence_id uuid not null,
  evidence_revision integer not null check (evidence_revision > 0),
  evidence_text_sha256 text not null check (evidence_text_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (plan_id, selection, ordinal),
  constraint presentation_plan_evidence_plan_owner_fk foreign key (plan_id, owner_user_id)
    references public.presentation_plans(id, owner_user_id) on delete cascade,
  constraint presentation_plan_evidence_revision_owner_fk foreign key (evidence_id, evidence_revision, owner_user_id)
    references public.career_evidence_revisions(evidence_id, revision_number, owner_user_id) on delete restrict,
  constraint presentation_plan_evidence_unique_ref unique (plan_id, evidence_id, evidence_revision)
);

create table public.presentation_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null,
  status text not null check (status in ('PROPOSED','APPROVED','REJECTED')),
  purpose text not null check (purpose in ('CLAIM','SUMMARY','SECTION_HEADING')),
  source_text text not null check (char_length(btrim(source_text)) between 1 and 50000),
  proposed_text text not null check (char_length(btrim(proposed_text)) between 1 and 10000),
  transformation_types text[] not null default '{}',
  origin text not null check (origin in ('DETERMINISTIC','USER_EDIT','AI_PROPOSAL')),
  ai_provenance jsonb,
  deterministic_status text not null check (deterministic_status in ('PASS','FAIL')),
  semantic_status text not null check (semantic_status in ('SOURCE_EXACT','MODEL_ASSISTED_PASS','MANUAL_EVIDENCE_REVIEW_PASS','REVIEW_REQUIRED','NOT_RUN')),
  overall_status text not null check (overall_status in ('ACCEPTED','REJECTED','REVIEW_REQUIRED')),
  validation_findings jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_findings) = 'array'),
  validation_checked_at timestamptz not null default now(),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  proposed_sha256 text not null check (proposed_sha256 ~ '^[0-9a-f]{64}$'),
  approved_by_user_at timestamptz,
  created_at timestamptz not null default now(),
  constraint presentation_revisions_identity_owner unique (id, owner_user_id),
  constraint presentation_revisions_plan_owner_fk foreign key (plan_id, owner_user_id)
    references public.presentation_plans(id, owner_user_id) on delete restrict,
  constraint presentation_revision_hashes_valid check (
    source_sha256 = encode(digest(source_text, 'sha256'), 'hex')
    and proposed_sha256 = encode(digest(proposed_text, 'sha256'), 'hex')
  ),
  constraint presentation_revision_ai_shape check (
    (origin = 'AI_PROPOSAL' and ai_provenance is not null)
    or (origin <> 'AI_PROPOSAL' and ai_provenance is null)
  ),
  constraint presentation_revision_approval_shape check (
    (status = 'APPROVED' and approved_by_user_at is not null and overall_status = 'ACCEPTED' and deterministic_status = 'PASS')
    or (status <> 'APPROVED' and approved_by_user_at is null)
  )
);

create table public.presentation_revision_evidence (
  presentation_revision_id uuid not null,
  owner_user_id uuid not null,
  ordinal integer not null check (ordinal >= 0 and ordinal < 10000),
  evidence_id uuid not null,
  evidence_revision integer not null check (evidence_revision > 0),
  evidence_kind text not null check (evidence_kind in ('EMPLOYMENT','PROJECT','ACHIEVEMENT','EDUCATION','CERTIFICATION','SKILL','LANGUAGE','METRIC')),
  evidence_canonical_text text not null check (char_length(btrim(evidence_canonical_text)) between 1 and 10000),
  evidence_text_sha256 text not null check (evidence_text_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (presentation_revision_id, ordinal),
  constraint presentation_revision_evidence_revision_owner_fk foreign key (presentation_revision_id, owner_user_id)
    references public.presentation_revisions(id, owner_user_id) on delete cascade,
  constraint presentation_revision_evidence_source_owner_fk foreign key (evidence_id, evidence_revision, owner_user_id)
    references public.career_evidence_revisions(evidence_id, revision_number, owner_user_id) on delete restrict,
  constraint presentation_revision_evidence_unique_ref unique (presentation_revision_id, evidence_id, evidence_revision),
  constraint presentation_revision_evidence_hash_valid check (
    evidence_text_sha256 = encode(digest(evidence_canonical_text, 'sha256'), 'hex')
  )
);

create index presentation_plans_owner_created_idx on public.presentation_plans(owner_user_id, created_at desc);
create index presentation_plan_evidence_plan_idx on public.presentation_plan_evidence(plan_id, selection, ordinal);
create index presentation_revisions_owner_created_idx on public.presentation_revisions(owner_user_id, created_at desc);
create index presentation_revisions_plan_idx on public.presentation_revisions(plan_id, created_at desc);
create index presentation_revision_evidence_revision_idx on public.presentation_revision_evidence(presentation_revision_id, ordinal);

create or replace function public.cv_engine_p1_normalize(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(p_value, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.cv_engine_p1_quantitative_tokens(p_value text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(array_agg(distinct regexp_replace(lower(m[1]), '[,[:space:]]+', '', 'g') order by regexp_replace(lower(m[1]), '[,[:space:]]+', '', 'g')), '{}'::text[])
  from regexp_matches(coalesce(p_value, ''), '([$€£][[:space:]]*)?([0-9]+([.,][0-9]+)*)([[:space:]]*%)?', 'g') as m
  where m[1] is not null or m[2] is not null;
$$;

create or replace function public.cv_engine_p1_has_term(p_text text, p_term text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select position(' ' || public.cv_engine_p1_normalize(p_term) || ' ' in ' ' || public.cv_engine_p1_normalize(p_text) || ' ') > 0;
$$;

create or replace function public.cv_engine_p1_reject_immutable_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'P1_PRESENTATION_ARTIFACT_IMMUTABLE' using errcode = '23514';
end;
$$;

create trigger presentation_plans_immutable before update on public.presentation_plans
for each row execute function public.cv_engine_p1_reject_immutable_change();
create trigger presentation_plan_evidence_immutable before update on public.presentation_plan_evidence
for each row execute function public.cv_engine_p1_reject_immutable_change();
create trigger presentation_revision_evidence_immutable before update on public.presentation_revision_evidence
for each row execute function public.cv_engine_p1_reject_immutable_change();

create or replace function public.cv_engine_p1_guard_revision_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'PROPOSED' then
    raise exception 'P1_PRESENTATION_REVISION_IMMUTABLE' using errcode = '23514';
  end if;

  if new.owner_user_id is distinct from old.owner_user_id
     or new.plan_id is distinct from old.plan_id
     or new.purpose is distinct from old.purpose
     or new.source_text is distinct from old.source_text
     or new.proposed_text is distinct from old.proposed_text
     or new.transformation_types is distinct from old.transformation_types
     or new.origin is distinct from old.origin
     or new.ai_provenance is distinct from old.ai_provenance
     or new.deterministic_status is distinct from old.deterministic_status
     or new.validation_findings is distinct from old.validation_findings
     or new.source_sha256 is distinct from old.source_sha256
     or new.proposed_sha256 is distinct from old.proposed_sha256
     or new.created_at is distinct from old.created_at then
    raise exception 'P1_PRESENTATION_CONTENT_IMMUTABLE' using errcode = '23514';
  end if;

  if new.status not in ('APPROVED','REJECTED') then
    raise exception 'P1_PRESENTATION_INVALID_STATE_TRANSITION' using errcode = '23514';
  end if;

  if new.status = 'APPROVED' then
    if new.deterministic_status <> 'PASS' or new.overall_status <> 'ACCEPTED' or new.approved_by_user_at is null then
      raise exception 'P1_PRESENTATION_APPROVAL_CONTRACT_VIOLATION' using errcode = '23514';
    end if;
    if new.semantic_status not in ('SOURCE_EXACT','MODEL_ASSISTED_PASS','MANUAL_EVIDENCE_REVIEW_PASS') then
      raise exception 'P1_PRESENTATION_SEMANTIC_REVIEW_REQUIRED' using errcode = '23514';
    end if;
  else
    if new.approved_by_user_at is not null then
      raise exception 'P1_REJECTED_PRESENTATION_CANNOT_BE_APPROVED' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger presentation_revisions_controlled_update
before update on public.presentation_revisions
for each row execute function public.cv_engine_p1_guard_revision_update();

create trigger presentation_plans_no_delete before delete on public.presentation_plans
for each row execute function public.cv_engine_p1_reject_immutable_change();
create trigger presentation_plan_evidence_no_delete before delete on public.presentation_plan_evidence
for each row execute function public.cv_engine_p1_reject_immutable_change();
create trigger presentation_revisions_no_delete before delete on public.presentation_revisions
for each row execute function public.cv_engine_p1_reject_immutable_change();
create trigger presentation_revision_evidence_no_delete before delete on public.presentation_revision_evidence
for each row execute function public.cv_engine_p1_reject_immutable_change();

alter table public.presentation_plans enable row level security;
alter table public.presentation_plan_evidence enable row level security;
alter table public.presentation_revisions enable row level security;
alter table public.presentation_revision_evidence enable row level security;

create policy "presentation_plans_select_own" on public.presentation_plans for select to authenticated
using ((select auth.uid()) = owner_user_id);
create policy "presentation_plan_evidence_select_own" on public.presentation_plan_evidence for select to authenticated
using ((select auth.uid()) = owner_user_id);
create policy "presentation_revisions_select_own" on public.presentation_revisions for select to authenticated
using ((select auth.uid()) = owner_user_id);
create policy "presentation_revision_evidence_select_own" on public.presentation_revision_evidence for select to authenticated
using ((select auth.uid()) = owner_user_id);

revoke all on public.presentation_plans from anon, authenticated;
revoke all on public.presentation_plan_evidence from anon, authenticated;
revoke all on public.presentation_revisions from anon, authenticated;
revoke all on public.presentation_revision_evidence from anon, authenticated;
grant select on public.presentation_plans to authenticated;
grant select on public.presentation_plan_evidence to authenticated;
grant select on public.presentation_revisions to authenticated;
grant select on public.presentation_revision_evidence to authenticated;

create or replace function public.cv_engine_create_presentation_plan(
  p_mode text,
  p_career_target_id uuid,
  p_job_snapshot_id uuid,
  p_opportunity_assessment_id uuid,
  p_selected_evidence_refs jsonb,
  p_excluded_evidence_refs jsonb,
  p_sections jsonb,
  p_renderer_profile text default 'ATS_SINGLE_COLUMN_V1'
)
returns table (presentation_plan_id uuid, plan_sha256 text)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_plan_id uuid := gen_random_uuid();
  v_plan_sha text;
  v_ref jsonb;
  v_section jsonb;
  v_section_ref jsonb;
  v_ordinal integer := 0;
  v_evidence_id uuid;
  v_evidence_revision integer;
  v_evidence_text text;
  v_verification text;
  v_assessment_job_id uuid;
  v_identity text;
  v_selected_keys text[] := '{}';
  v_excluded_keys text[] := '{}';
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if p_mode not in ('GENERAL','TARGETED') then raise exception 'P1_INVALID_MODE' using errcode = '22023'; end if;
  if p_renderer_profile <> 'ATS_SINGLE_COLUMN_V1' then raise exception 'P1_INVALID_RENDERER_PROFILE' using errcode = '22023'; end if;
  if jsonb_typeof(p_selected_evidence_refs) <> 'array' or jsonb_array_length(p_selected_evidence_refs) = 0 then raise exception 'P1_SELECTED_EVIDENCE_REQUIRED' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_excluded_evidence_refs,'[]'::jsonb)) <> 'array' then raise exception 'P1_EXCLUDED_EVIDENCE_INVALID' using errcode = '22023'; end if;
  if jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then raise exception 'P1_SECTIONS_REQUIRED' using errcode = '22023'; end if;

  if p_career_target_id is not null and not exists(select 1 from public.career_targets where id=p_career_target_id and owner_user_id=v_owner) then
    raise exception 'P1_CAREER_TARGET_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_mode = 'GENERAL' then
    if p_job_snapshot_id is not null or p_opportunity_assessment_id is not null then raise exception 'P1_GENERAL_CONTEXT_CANNOT_BIND_JOB' using errcode = '23514'; end if;
  else
    select job_snapshot_id into v_assessment_job_id from public.opportunity_assessments
      where id=p_opportunity_assessment_id and owner_user_id=v_owner;
    if v_assessment_job_id is null then raise exception 'P1_ASSESSMENT_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_assessment_job_id is distinct from p_job_snapshot_id then raise exception 'P1_ASSESSMENT_JOB_MISMATCH' using errcode = '23514'; end if;
    if not exists(select 1 from public.job_snapshots where id=p_job_snapshot_id and owner_user_id=v_owner) then raise exception 'P1_JOB_NOT_FOUND' using errcode = 'P0002'; end if;
  end if;

  for v_ref in select value from jsonb_array_elements(p_selected_evidence_refs) loop
    v_evidence_id := (v_ref->>'evidenceId')::uuid;
    v_evidence_revision := (v_ref->>'evidenceRevision')::integer;
    v_identity := v_evidence_id::text || ':' || v_evidence_revision::text;
    if v_identity = any(v_selected_keys) then raise exception 'P1_DUPLICATE_SELECTED_EVIDENCE' using errcode = '23514'; end if;
    v_selected_keys := array_append(v_selected_keys, v_identity);

    select r.canonical_text, r.verification_status into v_evidence_text, v_verification
    from public.career_evidence_revisions r
    where r.evidence_id=v_evidence_id and r.revision_number=v_evidence_revision and r.owner_user_id=v_owner;
    if v_evidence_text is null then raise exception 'P1_EVIDENCE_REVISION_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_verification <> 'VERIFIED' then raise exception 'P1_SELECTED_EVIDENCE_NOT_VERIFIED' using errcode = '23514'; end if;
    v_ordinal := v_ordinal + 1;
  end loop;

  for v_ref in select value from jsonb_array_elements(coalesce(p_excluded_evidence_refs,'[]'::jsonb)) loop
    v_evidence_id := (v_ref->>'evidenceId')::uuid;
    v_evidence_revision := (v_ref->>'evidenceRevision')::integer;
    v_identity := v_evidence_id::text || ':' || v_evidence_revision::text;
    if v_identity = any(v_selected_keys) then raise exception 'P1_EVIDENCE_SELECTED_AND_EXCLUDED' using errcode = '23514'; end if;
    if v_identity = any(v_excluded_keys) then raise exception 'P1_DUPLICATE_EXCLUDED_EVIDENCE' using errcode = '23514'; end if;
    v_excluded_keys := array_append(v_excluded_keys, v_identity);
    if not exists(select 1 from public.career_evidence_revisions where evidence_id=v_evidence_id and revision_number=v_evidence_revision and owner_user_id=v_owner) then raise exception 'P1_EXCLUDED_EVIDENCE_NOT_FOUND' using errcode = 'P0002'; end if;
  end loop;

  for v_section in select value from jsonb_array_elements(p_sections) loop
    if jsonb_typeof(v_section->'evidenceRefs') <> 'array' or jsonb_array_length(v_section->'evidenceRefs') = 0 then raise exception 'P1_SECTION_EVIDENCE_REQUIRED' using errcode = '23514'; end if;
    for v_section_ref in select value from jsonb_array_elements(v_section->'evidenceRefs') loop
      v_identity := (v_section_ref->>'evidenceId') || ':' || (v_section_ref->>'evidenceRevision');
      if not (v_identity = any(v_selected_keys)) then raise exception 'P1_SECTION_REFERENCES_UNSELECTED_EVIDENCE' using errcode = '23514'; end if;
    end loop;
  end loop;

  v_plan_sha := encode(digest(
    p_mode || chr(31) || coalesce(p_career_target_id::text,'') || chr(31) || coalesce(p_job_snapshot_id::text,'') || chr(31) ||
    coalesce(p_opportunity_assessment_id::text,'') || chr(31) || p_renderer_profile || chr(31) ||
    p_selected_evidence_refs::text || chr(31) || coalesce(p_excluded_evidence_refs,'[]'::jsonb)::text || chr(31) || p_sections::text,
    'sha256'), 'hex');

  insert into public.presentation_plans(id,owner_user_id,mode,career_target_id,job_snapshot_id,opportunity_assessment_id,renderer_profile,selected_evidence_refs,excluded_evidence_refs,sections,plan_sha256)
  values(v_plan_id,v_owner,p_mode,p_career_target_id,p_job_snapshot_id,p_opportunity_assessment_id,p_renderer_profile,p_selected_evidence_refs,coalesce(p_excluded_evidence_refs,'[]'::jsonb),p_sections,v_plan_sha);

  v_ordinal := 0;
  for v_ref in select value from jsonb_array_elements(p_selected_evidence_refs) loop
    insert into public.presentation_plan_evidence(plan_id,owner_user_id,selection,ordinal,evidence_id,evidence_revision,evidence_text_sha256)
    select v_plan_id,v_owner,'SELECTED',v_ordinal,(v_ref->>'evidenceId')::uuid,(v_ref->>'evidenceRevision')::integer,
      encode(digest(r.canonical_text,'sha256'),'hex')
    from public.career_evidence_revisions r
    where r.evidence_id=(v_ref->>'evidenceId')::uuid and r.revision_number=(v_ref->>'evidenceRevision')::integer and r.owner_user_id=v_owner;
    v_ordinal := v_ordinal + 1;
  end loop;

  v_ordinal := 0;
  for v_ref in select value from jsonb_array_elements(coalesce(p_excluded_evidence_refs,'[]'::jsonb)) loop
    insert into public.presentation_plan_evidence(plan_id,owner_user_id,selection,ordinal,evidence_id,evidence_revision,evidence_text_sha256)
    select v_plan_id,v_owner,'EXCLUDED',v_ordinal,(v_ref->>'evidenceId')::uuid,(v_ref->>'evidenceRevision')::integer,
      encode(digest(r.canonical_text,'sha256'),'hex')
    from public.career_evidence_revisions r
    where r.evidence_id=(v_ref->>'evidenceId')::uuid and r.revision_number=(v_ref->>'evidenceRevision')::integer and r.owner_user_id=v_owner;
    v_ordinal := v_ordinal + 1;
  end loop;

  presentation_plan_id := v_plan_id; plan_sha256 := v_plan_sha; return next;
end;
$$;

create or replace function public.cv_engine_create_presentation_revision(
  p_plan_id uuid,
  p_purpose text,
  p_source_evidence_refs jsonb,
  p_proposed_text text,
  p_transformation_types text[],
  p_origin text default 'USER_EDIT'
)
returns table (presentation_revision_id uuid, review_status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_revision_id uuid := gen_random_uuid();
  v_plan public.presentation_plans%rowtype;
  v_ref jsonb;
  v_ordinal integer := 0;
  v_evidence_id uuid;
  v_evidence_revision integer;
  v_text text;
  v_kind text;
  v_verification text;
  v_source_text text := '';
  v_source_hash text;
  v_proposed_hash text;
  v_exact boolean;
  v_token text;
  v_term text;
  v_findings jsonb := '[]'::jsonb;
  v_semantic text;
  v_overall text;
  v_refs text[] := '{}';
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if p_purpose not in ('CLAIM','SUMMARY','SECTION_HEADING') then raise exception 'P1_INVALID_PURPOSE' using errcode = '22023'; end if;
  if p_origin not in ('DETERMINISTIC','USER_EDIT') then raise exception 'P1_AI_PROPOSAL_REQUIRES_GATEWAY_PATH' using errcode = '23514'; end if;
  if char_length(btrim(coalesce(p_proposed_text,''))) = 0 then raise exception 'P1_PROPOSED_TEXT_REQUIRED' using errcode = '22023'; end if;
  if jsonb_typeof(p_source_evidence_refs) <> 'array' or jsonb_array_length(p_source_evidence_refs) = 0 then raise exception 'P1_SOURCE_EVIDENCE_REQUIRED' using errcode = '22023'; end if;

  select * into v_plan from public.presentation_plans where id=p_plan_id and owner_user_id=v_owner;
  if v_plan.id is null then raise exception 'P1_PLAN_NOT_FOUND' using errcode = 'P0002'; end if;

  for v_ref in select value from jsonb_array_elements(p_source_evidence_refs) loop
    v_evidence_id := (v_ref->>'evidenceId')::uuid;
    v_evidence_revision := (v_ref->>'evidenceRevision')::integer;
    if (v_evidence_id::text || ':' || v_evidence_revision::text) = any(v_refs) then raise exception 'P1_DUPLICATE_REVISION_EVIDENCE' using errcode = '23514'; end if;
    v_refs := array_append(v_refs, v_evidence_id::text || ':' || v_evidence_revision::text);
    if not exists(select 1 from public.presentation_plan_evidence where plan_id=p_plan_id and owner_user_id=v_owner and selection='SELECTED' and evidence_id=v_evidence_id and evidence_revision=v_evidence_revision) then
      raise exception 'P1_REVISION_EVIDENCE_NOT_SELECTED' using errcode = '23514';
    end if;
    select r.canonical_text,r.verification_status,e.kind into v_text,v_verification,v_kind
    from public.career_evidence_revisions r join public.career_evidence e on e.id=r.evidence_id and e.owner_user_id=r.owner_user_id
    where r.evidence_id=v_evidence_id and r.revision_number=v_evidence_revision and r.owner_user_id=v_owner;
    if v_text is null then raise exception 'P1_EVIDENCE_REVISION_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_verification <> 'VERIFIED' then raise exception 'P1_REVISION_EVIDENCE_NOT_VERIFIED' using errcode = '23514'; end if;
    if v_source_text <> '' then v_source_text := v_source_text || E'\n'; end if;
    v_source_text := v_source_text || v_text;
    v_ordinal := v_ordinal + 1;
  end loop;

  foreach v_token in array public.cv_engine_p1_quantitative_tokens(p_proposed_text) loop
    if not (v_token = any(public.cv_engine_p1_quantitative_tokens(v_source_text))) then
      raise exception 'P1_UNSUPPORTED_QUANTITATIVE_TOKEN:%', v_token using errcode = '23514';
    end if;
  end loop;

  foreach v_term in array array['led','owned','spearheaded','architected','managed','mentored','expert','senior','principal','director','head of','drove','increased','reduced','grew','best','top','leading','world-class','exceptional','industry-leading'] loop
    if public.cv_engine_p1_has_term(p_proposed_text,v_term) and not public.cv_engine_p1_has_term(v_source_text,v_term) then
      raise exception 'P1_UNSUPPORTED_STRENGTHENING:%', v_term using errcode = '23514';
    end if;
  end loop;

  if v_plan.mode='TARGETED' then
    for v_term in select canonical_concept from public.job_requirements
      where snapshot_id=v_plan.job_snapshot_id and owner_user_id=v_owner
        and category in ('HARD_SKILL','TOOL','CERTIFICATION','SENIORITY','LANGUAGE','DOMAIN')
    loop
      if char_length(btrim(v_term)) <= 120 and public.cv_engine_p1_has_term(p_proposed_text,v_term) and not public.cv_engine_p1_has_term(v_source_text,v_term) then
        raise exception 'P1_MARKET_TERM_PROMOTED_TO_CANDIDATE:%', v_term using errcode = '23514';
      end if;
    end loop;
  end if;

  v_source_hash := encode(digest(v_source_text,'sha256'),'hex');
  v_proposed_hash := encode(digest(btrim(p_proposed_text),'sha256'),'hex');
  v_exact := public.cv_engine_p1_normalize(v_source_text) = public.cv_engine_p1_normalize(p_proposed_text);
  v_semantic := case when v_exact then 'SOURCE_EXACT' else 'REVIEW_REQUIRED' end;
  v_overall := case when v_exact then 'ACCEPTED' else 'REVIEW_REQUIRED' end;

  insert into public.presentation_revisions(id,owner_user_id,plan_id,status,purpose,source_text,proposed_text,transformation_types,origin,ai_provenance,deterministic_status,semantic_status,overall_status,validation_findings,source_sha256,proposed_sha256)
  values(v_revision_id,v_owner,p_plan_id,'PROPOSED',p_purpose,v_source_text,btrim(p_proposed_text),coalesce(p_transformation_types,'{}'),p_origin,null,'PASS',v_semantic,v_overall,v_findings,v_source_hash,v_proposed_hash);

  v_ordinal := 0;
  for v_ref in select value from jsonb_array_elements(p_source_evidence_refs) loop
    insert into public.presentation_revision_evidence(presentation_revision_id,owner_user_id,ordinal,evidence_id,evidence_revision,evidence_kind,evidence_canonical_text,evidence_text_sha256)
    select v_revision_id,v_owner,v_ordinal,e.id,r.revision_number,e.kind,r.canonical_text,encode(digest(r.canonical_text,'sha256'),'hex')
    from public.career_evidence e join public.career_evidence_revisions r on r.evidence_id=e.id and r.owner_user_id=e.owner_user_id
    where e.id=(v_ref->>'evidenceId')::uuid and r.revision_number=(v_ref->>'evidenceRevision')::integer and e.owner_user_id=v_owner;
    v_ordinal := v_ordinal + 1;
  end loop;

  presentation_revision_id := v_revision_id; review_status := v_overall; return next;
end;
$$;

create or replace function public.cv_engine_approve_presentation_revision(p_presentation_revision_id uuid)
returns table (presentation_revision_id uuid, status text, semantic_status text, approved_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_row public.presentation_revisions%rowtype;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  select * into v_row from public.presentation_revisions where id=p_presentation_revision_id and owner_user_id=v_owner for update;
  if v_row.id is null then raise exception 'P1_PRESENTATION_REVISION_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_row.status <> 'PROPOSED' then raise exception 'P1_PRESENTATION_REVISION_ALREADY_FINAL' using errcode = '23514'; end if;
  if v_row.deterministic_status <> 'PASS' then raise exception 'P1_DETERMINISTIC_VALIDATION_REQUIRED' using errcode = '23514'; end if;

  if v_row.semantic_status='REVIEW_REQUIRED' then
    update public.presentation_revisions
      set status='APPROVED', semantic_status='MANUAL_EVIDENCE_REVIEW_PASS', overall_status='ACCEPTED', validation_checked_at=now(), approved_by_user_at=now()
      where id=p_presentation_revision_id and owner_user_id=v_owner;
  elsif v_row.semantic_status='SOURCE_EXACT' and v_row.overall_status='ACCEPTED' then
    update public.presentation_revisions
      set status='APPROVED', validation_checked_at=now(), approved_by_user_at=now()
      where id=p_presentation_revision_id and owner_user_id=v_owner;
  else
    raise exception 'P1_PRESENTATION_SEMANTIC_REVIEW_REQUIRED' using errcode = '23514';
  end if;

  return query select r.id,r.status,r.semantic_status,r.approved_by_user_at from public.presentation_revisions r where r.id=p_presentation_revision_id and r.owner_user_id=v_owner;
end;
$$;

revoke all on function public.cv_engine_create_presentation_plan(text,uuid,uuid,uuid,jsonb,jsonb,jsonb,text) from public, anon;
revoke all on function public.cv_engine_create_presentation_revision(uuid,text,jsonb,text,text[],text) from public, anon;
revoke all on function public.cv_engine_approve_presentation_revision(uuid) from public, anon;
grant execute on function public.cv_engine_create_presentation_plan(text,uuid,uuid,uuid,jsonb,jsonb,jsonb,text) to authenticated;
grant execute on function public.cv_engine_create_presentation_revision(uuid,text,jsonb,text,text[],text) to authenticated;
grant execute on function public.cv_engine_approve_presentation_revision(uuid) to authenticated;

commit;
