begin;

-- B9 production hardening. These indexes cover every foreign-key access path
-- introduced by B9 without changing truth, selection, rendering, or lifecycle
-- semantics. Column order follows the referencing FK exactly so PostgreSQL can
-- use the index for parent updates/deletes and integrity checks.

create index presentation_revisions_source_owner_fk_idx
  on public.presentation_revisions(evidence_id, evidence_revision, owner_user_id);

create index resume_artifact_receipts_artifact_owner_fk_idx
  on public.resume_artifact_receipts(resume_artifact_id, owner_user_id);
create index resume_artifact_receipts_evidence_owner_fk_idx
  on public.resume_artifact_receipts(evidence_id, evidence_revision, owner_user_id);
create index resume_artifact_receipts_plan_item_owner_fk_idx
  on public.resume_artifact_receipts(source_plan_item_id, owner_user_id);
create index resume_artifact_receipts_presentation_owner_fk_idx
  on public.resume_artifact_receipts(presentation_revision_id, owner_user_id);

create index resume_artifacts_plan_owner_fk_idx
  on public.resume_artifacts(resume_plan_id, owner_user_id);
create index resume_artifacts_profile_revision_fk_idx
  on public.resume_artifacts(owner_user_id, resume_profile_revision);

create index resume_plan_items_evidence_owner_fk_idx
  on public.resume_plan_items(evidence_id, evidence_revision, owner_user_id);
create index resume_plan_items_plan_owner_fk_idx
  on public.resume_plan_items(resume_plan_id, owner_user_id);
create index resume_plan_items_presentation_owner_fk_idx
  on public.resume_plan_items(presentation_revision_id, owner_user_id);

create index resume_plan_source_receipts_evidence_owner_fk_idx
  on public.resume_plan_source_receipts(evidence_id, evidence_revision, owner_user_id);
create index resume_plan_source_receipts_item_owner_fk_idx
  on public.resume_plan_source_receipts(selected_item_id, owner_user_id);
create index resume_plan_source_receipts_plan_owner_fk_idx
  on public.resume_plan_source_receipts(resume_plan_id, owner_user_id);

create index resume_plans_assessment_owner_fk_idx
  on public.resume_plans(opportunity_assessment_id, owner_user_id);
create index resume_plans_job_owner_fk_idx
  on public.resume_plans(job_snapshot_id, owner_user_id);

commit;
