begin;

-- B8 cloud hardening discovered against a real Supabase project.
-- Supabase grants EXECUTE to API roles by default, so revoking PUBLIC alone is
-- insufficient. This migration makes every cv_engine_* function deny-by-default
-- and then grants only the intentional authenticated RPC surface.

alter function public.cv_engine_sha256(text) set search_path = '';
alter function public.cv_engine_b3_normalize(text) set search_path = '';
alter function public.cv_engine_b3_tokens(text) set search_path = '';
alter function public.cv_engine_b3_overlap(text, text) set search_path = '';

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
returns boolean
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

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));

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
  delete from public.career_evidence_revisions where owner_user_id = v_owner;
  delete from public.career_evidence where owner_user_id = v_owner;
  delete from public.career_vaults where owner_user_id = v_owner;
  delete from public.consent_receipts where owner_user_id = v_owner;
  delete from auth.users where id = v_owner;

  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return true;
end;
$$;

-- Deny-by-default across the complete CV Engine public function namespace.
do $b8_acl$
declare
  v_function record;
begin
  for v_function in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'cv_engine_%'
  loop
    execute format('revoke all on function %s from PUBLIC, anon, authenticated', v_function.oid::regprocedure);
  end loop;
end
$b8_acl$;

-- Intentional application RPC surface. Helpers and trigger functions remain
-- inaccessible to API roles and are invoked only inside trusted database code.
grant execute on function public.cv_engine_acknowledge_consent(text, timestamptz, text) to authenticated;
grant execute on function public.cv_engine_create_career_evidence(text, text, text, text, uuid) to authenticated;
grant execute on function public.cv_engine_revise_career_evidence(uuid, integer, text, text, uuid) to authenticated;
grant execute on function public.cv_engine_save_career_target(text,text,text,text[],text[],text[],text[],text[],text,text,boolean) to authenticated;
grant execute on function public.cv_engine_activate_career_target(uuid) to authenticated;
grant execute on function public.cv_engine_create_job_snapshot(text,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.cv_engine_create_opportunity_assessment(uuid) to authenticated;
grant execute on function public.cv_engine_create_resume_version(text, uuid) to authenticated;
grant execute on function public.cv_engine_record_resume_import(text,text,integer,text,text,text,text,jsonb) to authenticated;
grant execute on function public.cv_engine_accept_import_proposal(uuid,text) to authenticated;
grant execute on function public.cv_engine_dismiss_import_proposal(uuid) to authenticated;
grant execute on function public.cv_engine_capture_market_observation(uuid) to authenticated;
grant execute on function public.cv_engine_select_opportunity(uuid) to authenticated;
grant execute on function public.cv_engine_export_account() to authenticated;
grant execute on function public.cv_engine_delete_account() to authenticated;

commit;
