\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';

do $$
declare
  report_count integer;
  assessment_count integer;
  fingerprint_count integer;
begin
  select count(*), count(distinct career_evidence_fingerprint_sha256)
    into report_count, fingerprint_count
  from public.match_reports;
  select count(*) into assessment_count from public.opportunity_assessments;

  if report_count <> 2 or assessment_count <> 2 or fingerprint_count <> 2 then
    raise exception 'B3_FRESH_CONNECTION_READBACK_FAILED reports=% assessments=% fingerprints=%', report_count, assessment_count, fingerprint_count;
  end if;

  if not exists (
    select 1 from public.opportunity_assessments
    where recommendation='READY_NOW'
      and policy_version='b3-opportunity-assessment-v1'
      and scope_boundary='Evidence alignment only. This is not a hiring probability, recruiter decision, or commercial ATS score.'
  ) then raise exception 'B3_READY_ASSESSMENT_NOT_DURABLE'; end if;

  if not exists (
    select 1 from public.opportunity_assessments oa
    join public.requirement_matches rm on rm.match_report_id=oa.match_report_id
    where oa.recommendation='EVIDENCE_INCOMPLETE'
      and rm.status='UNKNOWN'
      and jsonb_array_length(rm.supporting_evidence_snapshot)=0
  ) then raise exception 'B3_HISTORICAL_UNKNOWN_NOT_DURABLE'; end if;

  if exists (
    select 1 from public.requirement_matches
    where status in ('MATCH','POTENTIAL_MATCH')
      and (cardinality(supporting_evidence_ids)=0 or jsonb_array_length(supporting_evidence_snapshot)=0)
  ) then raise exception 'B3_DURABLE_MATCH_LOST_PROVENANCE'; end if;
end $$;

reset role;
