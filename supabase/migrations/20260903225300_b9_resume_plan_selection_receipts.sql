begin;

alter table public.resume_plans
  drop constraint resume_plans_planner_version_check;
alter table public.resume_plans
  add constraint resume_plans_planner_version_check
  check (planner_version in ('b9-deterministic-resume-plan-v1','b9-deterministic-resume-plan-v2'));

create table public.resume_plan_source_receipts (
  id uuid primary key default gen_random_uuid(),
  resume_plan_id uuid not null,
  owner_user_id uuid not null,
  evidence_id uuid not null,
  evidence_revision integer not null check (evidence_revision > 0),
  evidence_kind text not null check (char_length(btrim(evidence_kind)) between 1 and 64),
  evidence_text_sha256 text not null check (evidence_text_sha256 ~ '^[0-9a-f]{64}$'),
  section text not null check (section in ('PROFILE','EXPERIENCE','PROJECTS','EDUCATION','CERTIFICATIONS','SKILLS','LANGUAGES')),
  decision text not null check (decision in ('INCLUDED','OMITTED_DENSITY','OMITTED_TARGET_IRRELEVANT')),
  target_match_status text check (target_match_status is null or target_match_status in ('MATCH','POTENTIAL_MATCH')),
  selected_item_id uuid,
  created_at timestamptz not null default now(),
  constraint resume_plan_source_receipts_plan_owner_fk foreign key (resume_plan_id, owner_user_id)
    references public.resume_plans(id, owner_user_id) on delete cascade,
  constraint resume_plan_source_receipts_evidence_owner_fk foreign key (evidence_id, evidence_revision, owner_user_id)
    references public.career_evidence_revisions(evidence_id, revision_number, owner_user_id) on delete restrict,
  constraint resume_plan_source_receipts_item_owner_fk foreign key (selected_item_id, owner_user_id)
    references public.resume_plan_items(id, owner_user_id) on delete restrict,
  constraint resume_plan_source_receipts_shape check (
    (decision = 'INCLUDED' and selected_item_id is not null)
    or (decision <> 'INCLUDED' and selected_item_id is null)
  ),
  constraint resume_plan_source_receipts_target_irrelevant_shape check (
    decision <> 'OMITTED_TARGET_IRRELEVANT' or target_match_status is null
  ),
  constraint resume_plan_source_receipts_one_per_evidence unique (resume_plan_id, evidence_id),
  constraint resume_plan_source_receipts_identity_owner unique (id, owner_user_id)
);

create index resume_plan_source_receipts_plan_idx
  on public.resume_plan_source_receipts(resume_plan_id, evidence_id);
create index resume_plan_source_receipts_owner_evidence_idx
  on public.resume_plan_source_receipts(owner_user_id, evidence_id, evidence_revision);

create trigger resume_plan_source_receipts_immutable
before update on public.resume_plan_source_receipts
for each row execute function public.cv_engine_reject_b9_resume_plan_update();

create or replace function public.cv_engine_guard_resume_plan_source_receipt_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_plan_mode text;
  v_match_report_id uuid;
  v_source_text text;
  v_source_status text;
  v_source_kind text;
  v_source_current_revision integer;
  v_actual_selected_item_id uuid;
  v_actual_target_status text;
  v_expected_decision text;
begin
  select rp.mode, oa.match_report_id
    into v_plan_mode, v_match_report_id
  from public.resume_plans rp
  left join public.opportunity_assessments oa
    on oa.id = rp.opportunity_assessment_id and oa.owner_user_id = rp.owner_user_id
  where rp.id = new.resume_plan_id
    and rp.owner_user_id = new.owner_user_id;

  if v_plan_mode is null then
    raise exception 'B9_RESUME_PLAN_RECEIPT_PLAN_NOT_FOUND' using errcode = '23514';
  end if;

  select cer.canonical_text, cer.verification_status, ce.kind, ce.current_revision
    into v_source_text, v_source_status, v_source_kind, v_source_current_revision
  from public.career_evidence_revisions cer
  join public.career_evidence ce
    on ce.id = cer.evidence_id and ce.owner_user_id = cer.owner_user_id
  where cer.evidence_id = new.evidence_id
    and cer.revision_number = new.evidence_revision
    and cer.owner_user_id = new.owner_user_id;

  if v_source_text is null
     or v_source_status <> 'VERIFIED'
     or v_source_current_revision is distinct from new.evidence_revision
     or v_source_kind is distinct from new.evidence_kind then
    raise exception 'B9_RESUME_PLAN_RECEIPT_SOURCE_INVALID' using errcode = '23514';
  end if;

  if public.cv_engine_sha256(v_source_text) <> new.evidence_text_sha256 then
    raise exception 'B9_RESUME_PLAN_RECEIPT_SOURCE_HASH_MISMATCH' using errcode = '23514';
  end if;

  select id into v_actual_selected_item_id
  from public.resume_plan_items
  where resume_plan_id = new.resume_plan_id
    and owner_user_id = new.owner_user_id
    and evidence_id = new.evidence_id;

  if new.selected_item_id is distinct from v_actual_selected_item_id then
    raise exception 'B9_RESUME_PLAN_RECEIPT_ITEM_BINDING_INVALID' using errcode = '23514';
  end if;

  if v_actual_selected_item_id is not null and not exists (
    select 1 from public.resume_plan_items i
    where i.id = v_actual_selected_item_id
      and i.resume_plan_id = new.resume_plan_id
      and i.owner_user_id = new.owner_user_id
      and i.evidence_revision = new.evidence_revision
      and i.evidence_kind = new.evidence_kind
      and i.evidence_text_sha256 = new.evidence_text_sha256
      and i.section = new.section
  ) then
    raise exception 'B9_RESUME_PLAN_RECEIPT_ITEM_PROVENANCE_INVALID' using errcode = '23514';
  end if;

  if v_plan_mode = 'TARGETED' then
    select case
      when exists (
        select 1 from public.requirement_matches rm
        where rm.match_report_id = v_match_report_id
          and rm.owner_user_id = new.owner_user_id
          and rm.status = 'MATCH'
          and new.evidence_id = any(rm.supporting_evidence_ids)
      ) then 'MATCH'
      when exists (
        select 1 from public.requirement_matches rm
        where rm.match_report_id = v_match_report_id
          and rm.owner_user_id = new.owner_user_id
          and rm.status = 'POTENTIAL_MATCH'
          and new.evidence_id = any(rm.supporting_evidence_ids)
      ) then 'POTENTIAL_MATCH'
      else null
    end into v_actual_target_status;
  else
    v_actual_target_status := null;
  end if;

  if new.target_match_status is distinct from v_actual_target_status then
    raise exception 'B9_RESUME_PLAN_RECEIPT_TARGET_STATUS_INVALID' using errcode = '23514';
  end if;

  v_expected_decision := case
    when v_actual_selected_item_id is not null then 'INCLUDED'
    when v_plan_mode = 'TARGETED' and v_actual_target_status is null then 'OMITTED_TARGET_IRRELEVANT'
    else 'OMITTED_DENSITY'
  end;

  if new.decision is distinct from v_expected_decision then
    raise exception 'B9_RESUME_PLAN_RECEIPT_DECISION_INVALID' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger resume_plan_source_receipts_insert_guard
before insert on public.resume_plan_source_receipts
for each row execute function public.cv_engine_guard_resume_plan_source_receipt_insert();

alter table public.resume_plan_source_receipts enable row level security;
create policy "resume_plan_source_receipts_select_own"
on public.resume_plan_source_receipts for select to authenticated
using ((select auth.uid()) = owner_user_id);

revoke all on public.resume_plan_source_receipts from public, anon, authenticated;
grant select on public.resume_plan_source_receipts to authenticated;
revoke all on function public.cv_engine_guard_resume_plan_source_receipt_insert() from public, anon, authenticated;

create or replace function public.cv_engine_create_resume_plan(
  p_mode text,
  p_job_snapshot_id uuid default null,
  p_opportunity_assessment_id uuid default null
)
returns table (resume_plan_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_current_fingerprint text;
  v_verified_count integer;
  v_match_report_id uuid;
  v_assessment_job_id uuid;
  v_assessment_fingerprint text;
  v_items jsonb;
  v_plan_id uuid;
  v_semantic_key text;
begin
  if v_owner is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if p_mode not in ('GENERAL','TARGETED') then
    raise exception 'B9_RESUME_PLAN_MODE_INVALID' using errcode = '22023';
  end if;

  if p_mode = 'GENERAL' and (p_job_snapshot_id is not null or p_opportunity_assessment_id is not null) then
    raise exception 'B9_GENERAL_TARGET_BINDING_FORBIDDEN' using errcode = '23514';
  end if;

  if p_mode = 'TARGETED' and (p_job_snapshot_id is null or p_opportunity_assessment_id is null) then
    raise exception 'B9_TARGET_ASSESSMENT_REQUIRED' using errcode = '23514';
  end if;

  select count(*) into v_verified_count
  from public.career_evidence ce
  join public.career_evidence_revisions cer
    on cer.evidence_id = ce.id and cer.owner_user_id = ce.owner_user_id
   and cer.revision_number = ce.current_revision
  where ce.owner_user_id = v_owner
    and cer.verification_status = 'VERIFIED';

  if v_verified_count = 0 then
    raise exception 'B9_RESUME_PLAN_VERIFIED_EVIDENCE_MISSING' using errcode = 'P0002';
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

  if p_mode = 'TARGETED' then
    select oa.match_report_id, oa.job_snapshot_id, mr.career_evidence_fingerprint_sha256
      into v_match_report_id, v_assessment_job_id, v_assessment_fingerprint
    from public.opportunity_assessments oa
    join public.match_reports mr
      on mr.id = oa.match_report_id and mr.owner_user_id = oa.owner_user_id
    where oa.id = p_opportunity_assessment_id
      and oa.owner_user_id = v_owner;

    if v_match_report_id is null or v_assessment_job_id is distinct from p_job_snapshot_id then
      raise exception 'B9_TARGET_ASSESSMENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_assessment_fingerprint is distinct from v_current_fingerprint then
      raise exception 'B9_TARGET_ASSESSMENT_STALE' using errcode = '40001';
    end if;
  end if;

  with candidates as (
    select
      ce.id as evidence_id,
      ce.current_revision as evidence_revision,
      ce.kind as evidence_kind,
      cer.canonical_text,
      public.cv_engine_sha256(cer.canonical_text) as evidence_text_sha256,
      case ce.kind
        when 'ACHIEVEMENT' then 'PROFILE'
        when 'METRIC' then 'PROFILE'
        when 'EMPLOYMENT' then 'EXPERIENCE'
        when 'PROJECT' then 'PROJECTS'
        when 'EDUCATION' then 'EDUCATION'
        when 'CERTIFICATION' then 'CERTIFICATIONS'
        when 'SKILL' then 'SKILLS'
        when 'LANGUAGE' then 'LANGUAGES'
        else null
      end as section,
      case
        when p_mode = 'GENERAL' then null
        when exists (
          select 1 from public.requirement_matches rm
          where rm.match_report_id = v_match_report_id
            and rm.owner_user_id = v_owner
            and rm.status = 'MATCH'
            and ce.id = any(rm.supporting_evidence_ids)
        ) then 'MATCH'
        when exists (
          select 1 from public.requirement_matches rm
          where rm.match_report_id = v_match_report_id
            and rm.owner_user_id = v_owner
            and rm.status = 'POTENTIAL_MATCH'
            and ce.id = any(rm.supporting_evidence_ids)
        ) then 'POTENTIAL_MATCH'
        else null
      end as target_match_status,
      case
        when p_mode = 'GENERAL' then 'GENERAL_VERIFIED'
        when exists (
          select 1 from public.requirement_matches rm
          where rm.match_report_id = v_match_report_id
            and rm.owner_user_id = v_owner
            and rm.status = 'MATCH'
            and ce.id = any(rm.supporting_evidence_ids)
        ) then 'TARGET_MATCH'
        else 'TARGET_POTENTIAL_MATCH'
      end as selection_reason,
      case
        when p_mode = 'GENERAL' then 99
        else coalesce((
          select min(
            (case jr.importance when 'REQUIRED' then 0 when 'PREFERRED' then 10 else 20 end)
            + (case rm.status when 'MATCH' then 0 else 1 end)
          )
          from public.requirement_matches rm
          join public.job_requirements jr
            on jr.id = rm.requirement_id and jr.owner_user_id = rm.owner_user_id
          where rm.match_report_id = v_match_report_id
            and rm.owner_user_id = v_owner
            and rm.status in ('MATCH','POTENTIAL_MATCH')
            and ce.id = any(rm.supporting_evidence_ids)
        ), 999)
      end as target_priority
    from public.career_evidence ce
    join public.career_evidence_revisions cer
      on cer.evidence_id = ce.id and cer.owner_user_id = ce.owner_user_id
     and cer.revision_number = ce.current_revision
    where ce.owner_user_id = v_owner
      and cer.verification_status = 'VERIFIED'
      and ce.kind in ('EMPLOYMENT','PROJECT','ACHIEVEMENT','EDUCATION','CERTIFICATION','SKILL','LANGUAGE','METRIC')
  ), eligible as (
    select * from candidates
    where section is not null
      and (p_mode = 'GENERAL' or target_match_status is not null)
  ), ranked as (
    select e.*,
      case e.section
        when 'PROFILE' then 0
        when 'EXPERIENCE' then 1
        when 'PROJECTS' then 2
        when 'EDUCATION' then 3
        when 'CERTIFICATIONS' then 4
        when 'SKILLS' then 5
        when 'LANGUAGES' then 6
        else 99
      end as section_priority,
      row_number() over (
        partition by e.section
        order by e.target_priority, e.evidence_id::text
      ) as section_slot
    from eligible e
  ), selected as (
    select *
    from ranked
    order by target_priority, section_slot, section_priority, evidence_id::text
    limit 20
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'section', s.section,
      'evidenceId', s.evidence_id,
      'evidenceRevision', s.evidence_revision,
      'evidenceKind', s.evidence_kind,
      'evidenceTextSha256', s.evidence_text_sha256,
      'presentationRevisionId', pr.id,
      'presentationTextSha256', pr.proposed_text_sha256,
      'renderedText', coalesce(pr.proposed_text, s.canonical_text),
      'selectionReason', s.selection_reason
    ) order by s.section_priority, s.target_priority, s.evidence_id::text
  ), '[]'::jsonb)
  into v_items
  from selected s
  left join lateral (
    select p.id, p.proposed_text, p.proposed_text_sha256
    from public.presentation_revisions p
    where p.owner_user_id = v_owner
      and p.evidence_id = s.evidence_id
      and p.evidence_revision = s.evidence_revision
      and p.source_text_sha256 = s.evidence_text_sha256
      and p.status = 'APPROVED'
    order by p.resolved_at desc nulls last, p.created_at desc, p.id desc
    limit 1
  ) pr on true;

  if jsonb_array_length(v_items) = 0 then
    if p_mode = 'TARGETED' then
      raise exception 'B9_TARGET_SUPPORT_MISSING' using errcode = 'P0002';
    end if;
    raise exception 'B9_RESUME_PLAN_VERIFIED_EVIDENCE_MISSING' using errcode = 'P0002';
  end if;

  v_semantic_key := public.cv_engine_sha256(
    p_mode || chr(31)
    || coalesce(p_job_snapshot_id::text, '') || chr(31)
    || coalesce(p_opportunity_assessment_id::text, '') || chr(31)
    || 'b9-deterministic-resume-plan-v2' || chr(31)
    || v_current_fingerprint || chr(31)
    || v_items::text
  );

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || v_semantic_key, 0));

  select id into v_plan_id
  from public.resume_plans
  where owner_user_id = v_owner and semantic_key = v_semantic_key;

  if v_plan_id is not null then
    resume_plan_id := v_plan_id;
    created := false;
    return next;
    return;
  end if;

  insert into public.resume_plans (
    owner_user_id, mode, job_snapshot_id, opportunity_assessment_id,
    planner_version, section_order, density_policy,
    career_evidence_fingerprint_sha256, semantic_key
  ) values (
    v_owner, p_mode, p_job_snapshot_id, p_opportunity_assessment_id,
    'b9-deterministic-resume-plan-v2',
    '["PROFILE","EXPERIENCE","PROJECTS","EDUCATION","CERTIFICATIONS","SKILLS","LANGUAGES"]'::jsonb,
    '{"policyVersion":"b9-one-page-density-v1","targetPages":1,"maxItems":20}'::jsonb,
    v_current_fingerprint, v_semantic_key
  ) returning id into v_plan_id;

  insert into public.resume_plan_items (
    resume_plan_id, owner_user_id, ordinal, section,
    evidence_id, evidence_revision, evidence_kind, evidence_text_sha256,
    presentation_revision_id, presentation_text_sha256,
    rendered_text, selection_reason
  )
  select
    v_plan_id,
    v_owner,
    item.ordinality::integer,
    item.value->>'section',
    (item.value->>'evidenceId')::uuid,
    (item.value->>'evidenceRevision')::integer,
    item.value->>'evidenceKind',
    item.value->>'evidenceTextSha256',
    nullif(item.value->>'presentationRevisionId', '')::uuid,
    nullif(item.value->>'presentationTextSha256', ''),
    item.value->>'renderedText',
    item.value->>'selectionReason'
  from jsonb_array_elements(v_items) with ordinality as item(value, ordinality);

  with sources as (
    select
      ce.id as evidence_id,
      ce.current_revision as evidence_revision,
      ce.kind as evidence_kind,
      public.cv_engine_sha256(cer.canonical_text) as evidence_text_sha256,
      case ce.kind
        when 'ACHIEVEMENT' then 'PROFILE'
        when 'METRIC' then 'PROFILE'
        when 'EMPLOYMENT' then 'EXPERIENCE'
        when 'PROJECT' then 'PROJECTS'
        when 'EDUCATION' then 'EDUCATION'
        when 'CERTIFICATION' then 'CERTIFICATIONS'
        when 'SKILL' then 'SKILLS'
        when 'LANGUAGE' then 'LANGUAGES'
        else null
      end as section,
      case
        when p_mode = 'GENERAL' then null
        when exists (
          select 1 from public.requirement_matches rm
          where rm.match_report_id = v_match_report_id
            and rm.owner_user_id = v_owner
            and rm.status = 'MATCH'
            and ce.id = any(rm.supporting_evidence_ids)
        ) then 'MATCH'
        when exists (
          select 1 from public.requirement_matches rm
          where rm.match_report_id = v_match_report_id
            and rm.owner_user_id = v_owner
            and rm.status = 'POTENTIAL_MATCH'
            and ce.id = any(rm.supporting_evidence_ids)
        ) then 'POTENTIAL_MATCH'
        else null
      end as target_match_status
    from public.career_evidence ce
    join public.career_evidence_revisions cer
      on cer.evidence_id = ce.id and cer.owner_user_id = ce.owner_user_id
     and cer.revision_number = ce.current_revision
    where ce.owner_user_id = v_owner
      and cer.verification_status = 'VERIFIED'
      and ce.kind in ('EMPLOYMENT','PROJECT','ACHIEVEMENT','EDUCATION','CERTIFICATION','SKILL','LANGUAGE','METRIC')
  )
  insert into public.resume_plan_source_receipts (
    resume_plan_id, owner_user_id,
    evidence_id, evidence_revision, evidence_kind, evidence_text_sha256,
    section, decision, target_match_status, selected_item_id
  )
  select
    v_plan_id,
    v_owner,
    s.evidence_id,
    s.evidence_revision,
    s.evidence_kind,
    s.evidence_text_sha256,
    s.section,
    case
      when i.id is not null then 'INCLUDED'
      when p_mode = 'TARGETED' and s.target_match_status is null then 'OMITTED_TARGET_IRRELEVANT'
      else 'OMITTED_DENSITY'
    end,
    s.target_match_status,
    i.id
  from sources s
  left join public.resume_plan_items i
    on i.resume_plan_id = v_plan_id
   and i.owner_user_id = v_owner
   and i.evidence_id = s.evidence_id
  where s.section is not null
  order by s.evidence_id::text;

  resume_plan_id := v_plan_id;
  created := true;
  return next;
end;
$$;

revoke all on function public.cv_engine_create_resume_plan(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cv_engine_create_resume_plan(text, uuid, uuid) to authenticated;

commit;
