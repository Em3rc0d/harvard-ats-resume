begin;

create table public.resume_artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  resume_plan_id uuid not null,
  mode text not null check (mode in ('GENERAL','TARGETED')),
  source_plan_semantic_key text not null check (source_plan_semantic_key ~ '^[0-9a-f]{64}$'),
  career_evidence_fingerprint_sha256 text not null check (career_evidence_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_version text not null check (artifact_version = 'b9-canonical-resume-artifact-v1'),
  composer_version text not null check (composer_version = 'b9-deterministic-resume-composition-v2'),
  renderer_contract_version text not null check (renderer_contract_version = 'b9-ats-safe-single-column-v1'),
  content_json jsonb not null check (jsonb_typeof(content_json) = 'object'),
  manifest_json jsonb not null check (jsonb_typeof(manifest_json) = 'object'),
  artifact_semantic_sha256 text not null check (artifact_semantic_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint resume_artifacts_plan_owner_fk foreign key (resume_plan_id, owner_user_id)
    references public.resume_plans(id, owner_user_id) on delete restrict,
  constraint resume_artifacts_owner_semantic_unique unique (owner_user_id, artifact_semantic_sha256),
  constraint resume_artifacts_identity_owner unique (id, owner_user_id)
);

create table public.resume_artifact_receipts (
  id uuid primary key default gen_random_uuid(),
  resume_artifact_id uuid not null,
  owner_user_id uuid not null,
  ordinal integer not null check (ordinal > 0),
  source_plan_item_id uuid not null,
  evidence_id uuid not null,
  evidence_revision integer not null check (evidence_revision > 0),
  evidence_text_sha256 text not null check (evidence_text_sha256 ~ '^[0-9a-f]{64}$'),
  presentation_revision_id uuid,
  presentation_text_sha256 text check (presentation_text_sha256 is null or presentation_text_sha256 ~ '^[0-9a-f]{64}$'),
  rendered_text_sha256 text not null check (rendered_text_sha256 ~ '^[0-9a-f]{64}$'),
  section text not null check (section in ('PROFILE','EXPERIENCE','PROJECTS','EDUCATION','CERTIFICATIONS','SKILLS','LANGUAGES')),
  selection_reason text not null check (selection_reason in ('GENERAL_VERIFIED','TARGET_MATCH','TARGET_POTENTIAL_MATCH')),
  created_at timestamptz not null default now(),
  constraint resume_artifact_receipts_artifact_owner_fk foreign key (resume_artifact_id, owner_user_id)
    references public.resume_artifacts(id, owner_user_id) on delete cascade,
  constraint resume_artifact_receipts_plan_item_owner_fk foreign key (source_plan_item_id, owner_user_id)
    references public.resume_plan_items(id, owner_user_id) on delete restrict,
  constraint resume_artifact_receipts_evidence_owner_fk foreign key (evidence_id, evidence_revision, owner_user_id)
    references public.career_evidence_revisions(evidence_id, revision_number, owner_user_id) on delete restrict,
  constraint resume_artifact_receipts_presentation_owner_fk foreign key (presentation_revision_id, owner_user_id)
    references public.presentation_revisions(id, owner_user_id) on delete restrict,
  constraint resume_artifact_receipts_presentation_shape check (
    (presentation_revision_id is null and presentation_text_sha256 is null)
    or (presentation_revision_id is not null and presentation_text_sha256 is not null)
  ),
  constraint resume_artifact_receipts_one_per_plan_item unique (resume_artifact_id, source_plan_item_id),
  constraint resume_artifact_receipts_ordinal_unique unique (resume_artifact_id, ordinal),
  constraint resume_artifact_receipts_identity_owner unique (id, owner_user_id)
);

create index resume_artifacts_owner_created_idx on public.resume_artifacts(owner_user_id, created_at desc);
create index resume_artifact_receipts_artifact_idx on public.resume_artifact_receipts(resume_artifact_id, ordinal);

create or replace function public.cv_engine_reject_b9_resume_artifact_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'B9_RESUME_ARTIFACT_IMMUTABLE' using errcode = '23514';
end;
$$;

create trigger resume_artifacts_immutable before update on public.resume_artifacts
for each row execute function public.cv_engine_reject_b9_resume_artifact_update();
create trigger resume_artifact_receipts_immutable before update on public.resume_artifact_receipts
for each row execute function public.cv_engine_reject_b9_resume_artifact_update();

alter table public.resume_artifacts enable row level security;
alter table public.resume_artifact_receipts enable row level security;
create policy "resume_artifacts_select_own" on public.resume_artifacts for select to authenticated
using ((select auth.uid()) = owner_user_id);
create policy "resume_artifact_receipts_select_own" on public.resume_artifact_receipts for select to authenticated
using ((select auth.uid()) = owner_user_id);

revoke all on public.resume_artifacts from public, anon, authenticated;
revoke all on public.resume_artifact_receipts from public, anon, authenticated;
grant select on public.resume_artifacts to authenticated;
grant select on public.resume_artifact_receipts to authenticated;
revoke all on function public.cv_engine_reject_b9_resume_artifact_update() from public, anon, authenticated;

create or replace function public.cv_engine_create_resume_artifact(p_resume_plan_id uuid)
returns table (resume_artifact_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_plan record;
  v_current_fingerprint text;
  v_summary jsonb;
  v_sections jsonb;
  v_content jsonb;
  v_receipts jsonb;
  v_manifest jsonb;
  v_semantic text;
  v_artifact_id uuid;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;

  select * into v_plan
  from public.resume_plans
  where id = p_resume_plan_id and owner_user_id = v_owner;
  if v_plan.id is null then raise exception 'B9_RESUME_PLAN_NOT_FOUND' using errcode = 'P0002'; end if;

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

  v_content := jsonb_build_object(
    'header', jsonb_build_object('status','UNAVAILABLE','displayName',null,'headline',null,'contactLines','[]'::jsonb),
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
    'artifactVersion', 'b9-canonical-resume-artifact-v1',
    'rendererContractVersion', 'b9-ats-safe-single-column-v1',
    'careerEvidenceFingerprintSha256', v_plan.career_evidence_fingerprint_sha256,
    'jobSnapshotId', v_plan.job_snapshot_id,
    'opportunityAssessmentId', v_plan.opportunity_assessment_id,
    'receipts', v_receipts
  );

  v_semantic := public.cv_engine_sha256(
    v_plan.semantic_key || chr(31) || 'b9-canonical-resume-artifact-v1' || chr(31)
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
    renderer_contract_version, content_json, manifest_json, artifact_semantic_sha256
  ) values (
    v_owner, v_plan.id, v_plan.mode, v_plan.semantic_key,
    v_plan.career_evidence_fingerprint_sha256, 'b9-canonical-resume-artifact-v1',
    'b9-deterministic-resume-composition-v2', 'b9-ats-safe-single-column-v1',
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
