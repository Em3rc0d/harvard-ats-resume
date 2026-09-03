begin;

-- B8 production performance hardening. These indexes cover composite foreign
-- keys flagged by the Supabase advisor. They do not alter domain semantics.
create index if not exists career_evidence_current_revision_fk_idx
  on public.career_evidence(id, current_revision, owner_user_id);
create index if not exists career_evidence_vault_owner_fk_idx
  on public.career_evidence(vault_id, owner_user_id);
create index if not exists career_evidence_revisions_owner_fk_idx
  on public.career_evidence_revisions(evidence_id, owner_user_id);
create index if not exists import_proposals_evidence_owner_fk_idx
  on public.import_proposals(accepted_evidence_id, owner_user_id);
create index if not exists import_proposals_receipt_owner_fk_idx
  on public.import_proposals(receipt_id, owner_user_id);
create index if not exists job_requirements_snapshot_owner_fk_idx
  on public.job_requirements(snapshot_id, owner_user_id);
create index if not exists market_observations_job_owner_fk_idx
  on public.market_observations(job_snapshot_id, owner_user_id);
create index if not exists match_reports_job_owner_fk_idx
  on public.match_reports(job_snapshot_id, owner_user_id);
create index if not exists opportunity_assessments_job_owner_fk_idx
  on public.opportunity_assessments(job_snapshot_id, owner_user_id);
create index if not exists opportunity_assessments_report_owner_fk_idx
  on public.opportunity_assessments(match_report_id, owner_user_id);
create index if not exists opportunity_space_assessment_owner_fk_idx
  on public.opportunity_space_items(opportunity_assessment_id, owner_user_id);
create index if not exists opportunity_space_job_owner_fk_idx
  on public.opportunity_space_items(job_snapshot_id, owner_user_id);
create index if not exists opportunity_space_observation_owner_fk_idx
  on public.opportunity_space_items(market_observation_id, owner_user_id);
create index if not exists requirement_matches_report_owner_fk_idx
  on public.requirement_matches(match_report_id, owner_user_id);
create index if not exists requirement_matches_requirement_owner_fk_idx
  on public.requirement_matches(requirement_id, owner_user_id);
create index if not exists resume_claims_evidence_owner_fk_idx
  on public.resume_claims(evidence_id, owner_user_id);
create index if not exists resume_claims_version_owner_fk_idx
  on public.resume_claims(resume_version_id, owner_user_id);
create index if not exists resume_versions_assessment_owner_fk_idx
  on public.resume_versions(opportunity_assessment_id, owner_user_id);
create index if not exists resume_versions_job_owner_fk_idx
  on public.resume_versions(job_snapshot_id, owner_user_id);

commit;
