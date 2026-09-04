begin;

create table public.resume_profiles (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  current_revision integer not null default 0 check (current_revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resume_profile_revisions (
  owner_user_id uuid not null references public.resume_profiles(owner_user_id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  headline text check (headline is null or length(btrim(headline)) between 1 and 200),
  location text check (location is null or length(btrim(location)) between 1 and 160),
  email text check (email is null or length(btrim(email)) between 3 and 254),
  phone text check (phone is null or length(btrim(phone)) between 1 and 80),
  links_json jsonb not null default '[]'::jsonb check (jsonb_typeof(links_json) = 'array' and jsonb_array_length(links_json) <= 6),
  semantic_sha256 text not null check (semantic_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (owner_user_id, revision_number),
  unique (owner_user_id, semantic_sha256)
);

create or replace function public.cv_engine_reject_b9_resume_profile_revision_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'B9_RESUME_PROFILE_REVISION_IMMUTABLE' using errcode = '23514';
end;
$$;

create trigger resume_profile_revisions_immutable
before update on public.resume_profile_revisions
for each row execute function public.cv_engine_reject_b9_resume_profile_revision_update();

alter table public.resume_profiles enable row level security;
alter table public.resume_profile_revisions enable row level security;
create policy "resume_profiles_select_own" on public.resume_profiles for select to authenticated
using ((select auth.uid()) = owner_user_id);
create policy "resume_profile_revisions_select_own" on public.resume_profile_revisions for select to authenticated
using ((select auth.uid()) = owner_user_id);

revoke all on public.resume_profiles from public, anon, authenticated;
revoke all on public.resume_profile_revisions from public, anon, authenticated;
grant select on public.resume_profiles to authenticated;
grant select on public.resume_profile_revisions to authenticated;
revoke all on function public.cv_engine_reject_b9_resume_profile_revision_update() from public, anon, authenticated;

create or replace function public.cv_engine_upsert_resume_profile(
  p_display_name text,
  p_headline text,
  p_location text,
  p_email text,
  p_phone text,
  p_links text[]
)
returns table (revision_number integer, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_headline text := nullif(btrim(coalesce(p_headline, '')), '');
  v_location text := nullif(btrim(coalesce(p_location, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_links text[] := coalesce(p_links, array[]::text[]);
  v_links_json jsonb;
  v_semantic text;
  v_current integer;
  v_current_semantic text;
  v_next integer;
  v_link text;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if length(v_display_name) not between 1 and 120 then raise exception 'B9_RESUME_PROFILE_DISPLAY_NAME_INVALID' using errcode = '22023'; end if;
  if v_headline is not null and length(v_headline) > 200 then raise exception 'B9_RESUME_PROFILE_HEADLINE_INVALID' using errcode = '22023'; end if;
  if v_location is not null and length(v_location) > 160 then raise exception 'B9_RESUME_PROFILE_LOCATION_INVALID' using errcode = '22023'; end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'B9_RESUME_PROFILE_EMAIL_INVALID' using errcode = '22023';
  end if;
  if v_phone is not null and length(v_phone) > 80 then raise exception 'B9_RESUME_PROFILE_PHONE_INVALID' using errcode = '22023'; end if;
  if cardinality(v_links) > 6 then raise exception 'B9_RESUME_PROFILE_LINK_LIMIT' using errcode = '22023'; end if;

  for v_link in select btrim(x) from unnest(v_links) x loop
    if length(v_link) not between 1 and 500 or v_link !~ '^https?://[^[:space:]]+$' then
      raise exception 'B9_RESUME_PROFILE_LINK_INVALID' using errcode = '22023';
    end if;
  end loop;

  select coalesce(jsonb_agg(btrim(x) order by ord), '[]'::jsonb)
  into v_links_json
  from unnest(v_links) with ordinality as t(x, ord);

  v_semantic := public.cv_engine_sha256(
    v_display_name || chr(31) || coalesce(v_headline, '') || chr(31) || coalesce(v_location, '') || chr(31)
    || coalesce(v_email, '') || chr(31) || coalesce(v_phone, '') || chr(31) || v_links_json::text
  );

  perform pg_advisory_xact_lock(hashtextextended('b9-resume-profile:' || v_owner::text, 0));

  insert into public.resume_profiles(owner_user_id) values (v_owner)
  on conflict (owner_user_id) do nothing;

  select current_revision into v_current from public.resume_profiles where owner_user_id = v_owner;
  if v_current > 0 then
    select semantic_sha256 into v_current_semantic
    from public.resume_profile_revisions
    where owner_user_id = v_owner and revision_number = v_current;
    if v_current_semantic = v_semantic then
      revision_number := v_current; created := false; return next; return;
    end if;
  end if;

  v_next := v_current + 1;
  insert into public.resume_profile_revisions(
    owner_user_id, revision_number, display_name, headline, location, email, phone, links_json, semantic_sha256
  ) values (
    v_owner, v_next, v_display_name, v_headline, v_location, v_email, v_phone, v_links_json, v_semantic
  );

  update public.resume_profiles
  set current_revision = v_next, updated_at = now()
  where owner_user_id = v_owner;

  revision_number := v_next; created := true; return next;
end;
$$;

revoke all on function public.cv_engine_upsert_resume_profile(text,text,text,text,text,text[]) from public, anon, authenticated;
grant execute on function public.cv_engine_upsert_resume_profile(text,text,text,text,text,text[]) to authenticated;

alter table public.resume_artifacts drop constraint if exists resume_artifacts_artifact_version_check;
alter table public.resume_artifacts
  add column resume_profile_revision integer,
  add column resume_profile_semantic_sha256 text,
  add constraint resume_artifacts_artifact_version_check check (artifact_version in ('b9-canonical-resume-artifact-v1','b9-canonical-resume-artifact-v2')),
  add constraint resume_artifacts_profile_shape check (
    (artifact_version = 'b9-canonical-resume-artifact-v1' and resume_profile_revision is null and resume_profile_semantic_sha256 is null)
    or
    (artifact_version = 'b9-canonical-resume-artifact-v2' and resume_profile_revision is not null and resume_profile_revision > 0 and resume_profile_semantic_sha256 ~ '^[0-9a-f]{64}$')
  ),
  add constraint resume_artifacts_profile_revision_fk foreign key (owner_user_id, resume_profile_revision)
    references public.resume_profile_revisions(owner_user_id, revision_number) on delete restrict;

create or replace function public.cv_engine_create_resume_artifact(p_resume_plan_id uuid)
returns table (resume_artifact_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_plan record;
  v_profile record;
  v_current_fingerprint text;
  v_summary jsonb;
  v_sections jsonb;
  v_content jsonb;
  v_receipts jsonb;
  v_manifest jsonb;
  v_semantic text;
  v_artifact_id uuid;
  v_contact_parts text[] := array[]::text[];
  v_link text;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;

  select * into v_plan
  from public.resume_plans
  where id = p_resume_plan_id and owner_user_id = v_owner;
  if v_plan.id is null then raise exception 'B9_RESUME_PLAN_NOT_FOUND' using errcode = 'P0002'; end if;

  select r.* into v_profile
  from public.resume_profiles p
  join public.resume_profile_revisions r
    on r.owner_user_id = p.owner_user_id and r.revision_number = p.current_revision
  where p.owner_user_id = v_owner and p.current_revision > 0;
  if v_profile.revision_number is null then raise exception 'B9_RESUME_PROFILE_REQUIRED' using errcode = 'P0002'; end if;

  select id into v_artifact_id
  from public.resume_artifacts
  where owner_user_id = v_owner
    and resume_plan_id = v_plan.id
    and artifact_version = 'b9-canonical-resume-artifact-v2'
    and composer_version = 'b9-deterministic-resume-composition-v2'
    and renderer_contract_version = 'b9-ats-safe-single-column-v1'
    and resume_profile_revision = v_profile.revision_number
    and resume_profile_semantic_sha256 = v_profile.semantic_sha256;
  if v_artifact_id is not null then
    resume_artifact_id := v_artifact_id; created := false; return next; return;
  end if;

  select public.cv_engine_sha256(string_agg(
    ce.id::text || chr(31) || ce.kind || chr(31) || ce.source || chr(31) ||
    ce.current_revision::text || chr(31) || cer.verification_status || chr(31) || cer.canonical_text,
    chr(30) order by ce.id::text
  )) into v_current_fingerprint
  from public.career_evidence ce
  join public.career_evidence_revisions cer
    on cer.evidence_id = ce.id and cer.owner_user_id = ce.owner_user_id
   and cer.revision_number = ce.current_revision
  where ce.owner_user_id = v_owner;

  if v_current_fingerprint is distinct from v_plan.career_evidence_fingerprint_sha256 then
    raise exception 'B9_RESUME_PLAN_STALE' using errcode = '40001';
  end if;

  select case when count(*) = 0 then null else jsonb_build_object(
    'text', string_agg(rendered_text, ' ' order by ordinal),
    'sourcePlanItemIds', jsonb_agg(id order by ordinal),
    'evidenceSources', jsonb_agg(jsonb_build_object('evidenceId', evidence_id, 'evidenceRevision', evidence_revision) order by ordinal)
  ) end into v_summary
  from public.resume_plan_items
  where resume_plan_id = v_plan.id and owner_user_id = v_owner and section = 'PROFILE';

  with section_defs(section, priority, layout) as (
    values
      ('EXPERIENCE'::text, 1, 'BULLETS'::text),
      ('PROJECTS', 2, 'BULLETS'),
      ('EDUCATION', 3, 'BULLETS'),
      ('CERTIFICATIONS', 4, 'INLINE_LIST'),
      ('SKILLS', 5, 'INLINE_LIST'),
      ('LANGUAGES', 6, 'INLINE_LIST')
  ), section_rows as (
    select d.priority, jsonb_build_object(
      'section', d.section,
      'layout', d.layout,
      'entries', jsonb_agg(jsonb_build_object(
        'sourcePlanItemId', i.id,
        'evidenceId', i.evidence_id,
        'evidenceRevision', i.evidence_revision,
        'renderedText', i.rendered_text
      ) order by i.ordinal)
    ) as section_json
    from section_defs d
    join public.resume_plan_items i
      on i.resume_plan_id = v_plan.id and i.owner_user_id = v_owner and i.section = d.section
    group by d.priority, d.section, d.layout
  )
  select coalesce(jsonb_agg(section_json order by priority), '[]'::jsonb) into v_sections from section_rows;

  if v_profile.location is not null then v_contact_parts := array_append(v_contact_parts, v_profile.location); end if;
  if v_profile.phone is not null then v_contact_parts := array_append(v_contact_parts, v_profile.phone); end if;
  if v_profile.email is not null then v_contact_parts := array_append(v_contact_parts, v_profile.email); end if;
  for v_link in select jsonb_array_elements_text(v_profile.links_json) loop
    v_contact_parts := array_append(v_contact_parts, v_link);
  end loop;

  v_content := jsonb_build_object(
    'header', jsonb_build_object(
      'status','AVAILABLE',
      'displayName',v_profile.display_name,
      'headline',v_profile.headline,
      'contactLines',case when cardinality(v_contact_parts) > 0 then jsonb_build_array(array_to_string(v_contact_parts, ' | ')) else '[]'::jsonb end
    ),
    'professionalSummary', v_summary,
    'sections', v_sections
  );

  select jsonb_agg(jsonb_build_object(
    'ordinal', ordinal,
    'sourcePlanItemId', id,
    'evidenceId', evidence_id,
    'evidenceRevision', evidence_revision,
    'evidenceTextSha256', evidence_text_sha256,
    'presentationRevisionId', presentation_revision_id,
    'presentationTextSha256', presentation_text_sha256,
    'renderedTextSha256', coalesce(presentation_text_sha256, evidence_text_sha256),
    'section', section,
    'selectionReason', selection_reason
  ) order by ordinal) into v_receipts
  from public.resume_plan_items
  where resume_plan_id = v_plan.id and owner_user_id = v_owner;

  if v_receipts is null or jsonb_array_length(v_receipts) = 0 then
    raise exception 'B9_RESUME_ARTIFACT_EMPTY' using errcode = '23514';
  end if;

  v_manifest := jsonb_build_object(
    'sourceResumePlanId', v_plan.id,
    'sourceResumePlanSemanticKey', v_plan.semantic_key,
    'plannerVersion', v_plan.planner_version,
    'composerVersion', 'b9-deterministic-resume-composition-v2',
    'artifactVersion', 'b9-canonical-resume-artifact-v2',
    'rendererContractVersion', 'b9-ats-safe-single-column-v1',
    'careerEvidenceFingerprintSha256', v_plan.career_evidence_fingerprint_sha256,
    'resumeProfileRevision', v_profile.revision_number,
    'resumeProfileSemanticSha256', v_profile.semantic_sha256,
    'jobSnapshotId', v_plan.job_snapshot_id,
    'opportunityAssessmentId', v_plan.opportunity_assessment_id,
    'receipts', v_receipts
  );

  v_semantic := public.cv_engine_sha256(
    v_plan.semantic_key || chr(31) || v_profile.semantic_sha256 || chr(31) || v_profile.revision_number::text || chr(31)
    || 'b9-canonical-resume-artifact-v2' || chr(31)
    || 'b9-deterministic-resume-composition-v2' || chr(31)
    || 'b9-ats-safe-single-column-v1' || chr(31)
    || v_content::text || chr(31) || v_manifest::text
  );

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || v_semantic, 0));

  select id into v_artifact_id from public.resume_artifacts
  where owner_user_id = v_owner and artifact_semantic_sha256 = v_semantic;
  if v_artifact_id is not null then
    resume_artifact_id := v_artifact_id; created := false; return next; return;
  end if;

  insert into public.resume_artifacts(
    owner_user_id, resume_plan_id, mode, source_plan_semantic_key,
    career_evidence_fingerprint_sha256, artifact_version, composer_version,
    renderer_contract_version, resume_profile_revision, resume_profile_semantic_sha256,
    content_json, manifest_json, artifact_semantic_sha256
  ) values (
    v_owner, v_plan.id, v_plan.mode, v_plan.semantic_key,
    v_plan.career_evidence_fingerprint_sha256, 'b9-canonical-resume-artifact-v2',
    'b9-deterministic-resume-composition-v2', 'b9-ats-safe-single-column-v1',
    v_profile.revision_number, v_profile.semantic_sha256,
    v_content, v_manifest, v_semantic
  ) returning id into v_artifact_id;

  insert into public.resume_artifact_receipts(
    resume_artifact_id, owner_user_id, ordinal, source_plan_item_id,
    evidence_id, evidence_revision, evidence_text_sha256,
    presentation_revision_id, presentation_text_sha256, rendered_text_sha256,
    section, selection_reason
  )
  select v_artifact_id, v_owner, ordinal, id,
    evidence_id, evidence_revision, evidence_text_sha256,
    presentation_revision_id, presentation_text_sha256,
    coalesce(presentation_text_sha256, evidence_text_sha256), section, selection_reason
  from public.resume_plan_items
  where resume_plan_id = v_plan.id and owner_user_id = v_owner
  order by ordinal;

  resume_artifact_id := v_artifact_id; created := true; return next;
end;
$$;

revoke all on function public.cv_engine_create_resume_artifact(uuid) from public, anon, authenticated;
grant execute on function public.cv_engine_create_resume_artifact(uuid) to authenticated;

commit;
