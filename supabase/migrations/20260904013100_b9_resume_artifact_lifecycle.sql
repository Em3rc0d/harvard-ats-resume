begin;

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
    'resumePlans', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]'::jsonb) from public.resume_plans t where t.owner_user_id = v_owner),
    'resumePlanItems', (select coalesce(jsonb_agg(to_jsonb(t) order by t.resume_plan_id, t.ordinal), '[]'::jsonb) from public.resume_plan_items t where t.owner_user_id = v_owner),
    'resumePlanSourceReceipts', (select coalesce(jsonb_agg(to_jsonb(t) order by t.resume_plan_id, t.evidence_id), '[]'::jsonb) from public.resume_plan_source_receipts t where t.owner_user_id = v_owner),
    'resumeArtifacts', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]'::jsonb) from public.resume_artifacts t where t.owner_user_id = v_owner),
    'resumeArtifactReceipts', (select coalesce(jsonb_agg(to_jsonb(t) order by t.resume_artifact_id, t.ordinal), '[]'::jsonb) from public.resume_artifact_receipts t where t.owner_user_id = v_owner),
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
  delete from public.resume_artifact_receipts where owner_user_id = v_owner;
  delete from public.resume_artifacts where owner_user_id = v_owner;
  delete from public.resume_plan_source_receipts where owner_user_id = v_owner;
  delete from public.resume_plan_items where owner_user_id = v_owner;
  delete from public.resume_plans where owner_user_id = v_owner;
  delete from public.opportunity_space_items where owner_user_id = v_owner;
  delete from public.market_observations where owner_user_id = v_owner;
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
