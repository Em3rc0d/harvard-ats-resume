begin;

create table public.resume_improvement_runs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_receipt_id uuid not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  semantic_document_json jsonb,
  semantic_document_sha256 text check (semantic_document_sha256 is null or semantic_document_sha256 ~ '^[0-9a-f]{64}$'),
  editor_provenance_json jsonb,
  generated_document_json jsonb,
  generated_document_sha256 text check (generated_document_sha256 is null or generated_document_sha256 ~ '^[0-9a-f]{64}$'),
  guardian_report_json jsonb,
  guardian_report_sha256 text check (guardian_report_sha256 is null or guardian_report_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in (
    'IMPROVED',
    'PARTIALLY_IMPROVED',
    'ORIGINAL_PRESERVED_AI_UNAVAILABLE',
    'FAILED_SOURCE_UNREADABLE'
  )),
  target_job_snapshot_id uuid,
  target_text_hash text check (target_text_hash is null or target_text_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint resume_improvement_runs_identity_owner unique (id, owner_user_id),
  constraint resume_improvement_runs_source_owner_fk
    foreign key (source_receipt_id, owner_user_id)
    references public.import_receipts(id, owner_user_id)
    on delete cascade,
  constraint resume_improvement_runs_target_owner_fk
    foreign key (target_job_snapshot_id, owner_user_id)
    references public.job_snapshots(id, owner_user_id)
    on delete restrict,
  constraint resume_improvement_runs_semantic_hash_pair check (
    (semantic_document_json is null) = (semantic_document_sha256 is null)
  ),
  constraint resume_improvement_runs_generated_hash_pair check (
    (generated_document_json is null) = (generated_document_sha256 is null)
  ),
  constraint resume_improvement_runs_guardian_hash_pair check (
    (guardian_report_json is null) = (guardian_report_sha256 is null)
  ),
  constraint resume_improvement_runs_terminal_shape check (
    (
      status = 'FAILED_SOURCE_UNREADABLE'
      and semantic_document_json is null
      and editor_provenance_json is null
      and generated_document_json is null
      and guardian_report_json is null
    )
    or
    (
      status in ('IMPROVED', 'PARTIALLY_IMPROVED')
      and semantic_document_json is not null
      and editor_provenance_json is not null
      and generated_document_json is not null
      and guardian_report_json is not null
    )
    or
    (
      status = 'ORIGINAL_PRESERVED_AI_UNAVAILABLE'
      and semantic_document_json is not null
      and generated_document_json is not null
      and guardian_report_json is not null
    )
  )
);

create index resume_improvement_runs_owner_created_idx
  on public.resume_improvement_runs(owner_user_id, created_at desc);
create index resume_improvement_runs_source_receipt_idx
  on public.resume_improvement_runs(source_receipt_id);
create index resume_improvement_runs_target_snapshot_idx
  on public.resume_improvement_runs(target_job_snapshot_id)
  where target_job_snapshot_id is not null;

alter table public.resume_improvement_runs enable row level security;

create policy "resume_improvement_runs_select_own"
on public.resume_improvement_runs for select to authenticated
using ((select auth.uid()) = owner_user_id);

revoke all on public.resume_improvement_runs from public, anon, authenticated;
grant select on public.resume_improvement_runs to authenticated;

create or replace function public.cv_engine_record_resume_improvement_run(
  p_source_receipt_id uuid,
  p_semantic_document_json jsonb,
  p_editor_provenance_json jsonb,
  p_generated_document_json jsonb,
  p_guardian_report_json jsonb,
  p_status text,
  p_target_job_snapshot_id uuid default null,
  p_target_text_hash text default null
)
returns table(resume_improvement_run_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_source_sha256 text;
  v_id uuid;
begin
  if v_owner is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if p_status not in (
    'IMPROVED',
    'PARTIALLY_IMPROVED',
    'ORIGINAL_PRESERVED_AI_UNAVAILABLE',
    'FAILED_SOURCE_UNREADABLE'
  ) then
    raise exception 'RESUME_IMPROVEMENT_STATUS_INVALID' using errcode = '23514';
  end if;

  select r.source_sha256
    into v_source_sha256
  from public.import_receipts r
  where r.id = p_source_receipt_id
    and r.owner_user_id = v_owner;

  if v_source_sha256 is null then
    raise exception 'SOURCE_RECEIPT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_target_job_snapshot_id is not null and not exists (
    select 1 from public.job_snapshots j
    where j.id = p_target_job_snapshot_id and j.owner_user_id = v_owner
  ) then
    raise exception 'TARGET_JOB_SNAPSHOT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_target_text_hash is not null and p_target_text_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'TARGET_TEXT_HASH_INVALID' using errcode = '23514';
  end if;

  insert into public.resume_improvement_runs(
    owner_user_id,
    source_receipt_id,
    source_sha256,
    semantic_document_json,
    semantic_document_sha256,
    editor_provenance_json,
    generated_document_json,
    generated_document_sha256,
    guardian_report_json,
    guardian_report_sha256,
    status,
    target_job_snapshot_id,
    target_text_hash
  ) values (
    v_owner,
    p_source_receipt_id,
    v_source_sha256,
    p_semantic_document_json,
    case when p_semantic_document_json is null then null else encode(digest(p_semantic_document_json::text, 'sha256'), 'hex') end,
    p_editor_provenance_json,
    p_generated_document_json,
    case when p_generated_document_json is null then null else encode(digest(p_generated_document_json::text, 'sha256'), 'hex') end,
    p_guardian_report_json,
    case when p_guardian_report_json is null then null else encode(digest(p_guardian_report_json::text, 'sha256'), 'hex') end,
    p_status,
    p_target_job_snapshot_id,
    p_target_text_hash
  ) returning id into v_id;

  return query select v_id, true;
end;
$$;

revoke all on function public.cv_engine_record_resume_improvement_run(uuid,jsonb,jsonb,jsonb,jsonb,text,uuid,text) from public, anon, authenticated;
grant execute on function public.cv_engine_record_resume_improvement_run(uuid,jsonb,jsonb,jsonb,jsonb,text,uuid,text) to authenticated;

create or replace function public.cv_engine_export_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  return jsonb_build_object(
    'schemaVersion', 'b8-account-export-v1',
    'ownerUserId', v_owner,
    'exportedAt', now(),
    'careerVaults', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.career_vaults t where t.owner_user_id = v_owner),
    'careerEvidence', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.career_evidence t where t.owner_user_id = v_owner),
    'careerEvidenceRevisions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.evidence_id, t.revision_number), '[]'::jsonb) from public.career_evidence_revisions t where t.owner_user_id = v_owner),
    'presentationRevisions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.evidence_id, t.evidence_revision, t.created_at, t.id), '[]'::jsonb) from public.presentation_revisions t where t.owner_user_id = v_owner),
    'resumeProfiles', (select coalesce(jsonb_agg(to_jsonb(t) order by t.owner_user_id), '[]'::jsonb) from public.resume_profiles t where t.owner_user_id = v_owner),
    'resumeProfileRevisions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.revision_number), '[]'::jsonb) from public.resume_profile_revisions t where t.owner_user_id = v_owner),
    'resumePlans', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]'::jsonb) from public.resume_plans t where t.owner_user_id = v_owner),
    'resumePlanItems', (select coalesce(jsonb_agg(to_jsonb(t) order by t.resume_plan_id, t.ordinal), '[]'::jsonb) from public.resume_plan_items t where t.owner_user_id = v_owner),
    'resumePlanSourceReceipts', (select coalesce(jsonb_agg(to_jsonb(t) order by t.resume_plan_id, t.evidence_id), '[]'::jsonb) from public.resume_plan_source_receipts t where t.owner_user_id = v_owner),
    'resumeArtifacts', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]'::jsonb) from public.resume_artifacts t where t.owner_user_id = v_owner),
    'resumeArtifactReceipts', (select coalesce(jsonb_agg(to_jsonb(t) order by t.resume_artifact_id, t.ordinal), '[]'::jsonb) from public.resume_artifact_receipts t where t.owner_user_id = v_owner),
    'resumeImprovementRuns', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]'::jsonb) from public.resume_improvement_runs t where t.owner_user_id = v_owner),
    'consentReceipts', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.consent_receipts t where t.owner_user_id = v_owner),
    'careerTargets', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.career_targets t where t.owner_user_id = v_owner),
    'jobSnapshots', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.job_snapshots t where t.owner_user_id = v_owner),
    'jobRequirements', (select coalesce(jsonb_agg(to_jsonb(t) order by t.snapshot_id, t.source_ordinal), '[]'::jsonb) from public.job_requirements t where t.owner_user_id = v_owner),
    'matchReports', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.match_reports t where t.owner_user_id = v_owner),
    'requirementMatches', (select coalesce(jsonb_agg(to_jsonb(t) order by t.match_report_id, t.id), '[]'::jsonb) from public.requirement_matches t where t.owner_user_id = v_owner),
    'opportunityAssessments', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.opportunity_assessments t where t.owner_user_id = v_owner),
    'resumeVersions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.resume_versions t where t.owner_user_id = v_owner),
    'resumeClaims', (select coalesce(jsonb_agg(to_jsonb(t) order by t.resume_version_id, t.ordinal), '[]'::jsonb) from public.resume_claims t where t.owner_user_id = v_owner),
    'importReceipts', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.import_receipts t where t.owner_user_id = v_owner),
    'importProposals', (select coalesce(jsonb_agg(to_jsonb(t) order by t.receipt_id, t.ordinal), '[]'::jsonb) from public.import_proposals t where t.owner_user_id = v_owner),
    'importReviewStructures', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]'::jsonb) from public.import_review_structures t where t.owner_user_id = v_owner),
    'marketObservations', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.market_observations t where t.owner_user_id = v_owner),
    'opportunitySpaceItems', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.opportunity_space_items t where t.owner_user_id = v_owner)
  );
end;
$$;

create or replace function public.cv_engine_delete_account()
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  delete from public.resume_improvement_runs where owner_user_id = v_owner;
  delete from public.resume_artifact_receipts where owner_user_id = v_owner;
  delete from public.resume_artifacts where owner_user_id = v_owner;
  delete from public.resume_plan_source_receipts where owner_user_id = v_owner;
  delete from public.resume_plan_items where owner_user_id = v_owner;
  delete from public.resume_plans where owner_user_id = v_owner;
  delete from public.opportunity_space_items where owner_user_id = v_owner;
  delete from public.market_observations where owner_user_id = v_owner;
  delete from public.import_review_structures where owner_user_id = v_owner;
  delete from public.import_proposals where owner_user_id = v_owner;
  delete from public.import_receipts where owner_user_id = v_owner;
  delete from public.resume_claims where owner_user_id = v_owner;
  delete from public.resume_versions where owner_user_id = v_owner;
  delete from public.requirement_matches where owner_user_id = v_owner;
  delete from public.opportunity_assessments where owner_user_id = v_owner;
  delete from public.match_reports where owner_user_id = v_owner;
  delete from public.job_requirements where owner_user_id = v_owner;
  delete from public.job_snapshots where owner_user_id = v_owner;
  delete from public.career_targets where owner_user_id = v_owner;
  delete from public.presentation_revisions where owner_user_id = v_owner;
  delete from public.resume_profile_revisions where owner_user_id = v_owner;
  delete from public.resume_profiles where owner_user_id = v_owner;
  delete from public.career_evidence_revisions where owner_user_id = v_owner;
  delete from public.career_evidence where owner_user_id = v_owner;
  delete from public.career_vaults where owner_user_id = v_owner;
  delete from public.consent_receipts where owner_user_id = v_owner;
  delete from auth.users where id = v_owner;
  if not found then raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002'; end if;
  return true;
end;
$$;

revoke all on function public.cv_engine_export_account() from public, anon, authenticated;
revoke all on function public.cv_engine_delete_account() from public, anon, authenticated;
grant execute on function public.cv_engine_export_account() to authenticated;
grant execute on function public.cv_engine_delete_account() to authenticated;

commit;
