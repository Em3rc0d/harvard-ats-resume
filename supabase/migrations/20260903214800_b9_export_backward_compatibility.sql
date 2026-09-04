begin;

-- B9 extends the existing account export additively. Keep the B8 schemaVersion
-- stable so existing consumers do not need to understand a new envelope merely
-- because a new optional collection is present.
create or replace function public.cv_engine_export_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'schemaVersion', 'b8-account-export-v1',
    'ownerUserId', v_owner,
    'exportedAt', now(),
    'careerVaults', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.career_vaults t where t.owner_user_id = v_owner),
    'careerEvidence', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.career_evidence t where t.owner_user_id = v_owner),
    'careerEvidenceRevisions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.evidence_id, t.revision_number), '[]'::jsonb) from public.career_evidence_revisions t where t.owner_user_id = v_owner),
    'presentationRevisions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.evidence_id, t.evidence_revision, t.created_at, t.id), '[]'::jsonb) from public.presentation_revisions t where t.owner_user_id = v_owner),
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

revoke all on function public.cv_engine_export_account() from public, anon, authenticated;
grant execute on function public.cv_engine_export_account() to authenticated;

commit;
