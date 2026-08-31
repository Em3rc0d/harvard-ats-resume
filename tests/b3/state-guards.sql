\set ON_ERROR_STOP on

begin;

do $$
declare
  v_source_report public.match_reports%rowtype;
  v_guard_report_id uuid;
  v_requirement record;
begin
  select * into v_source_report
  from public.match_reports
  where owner_user_id='00000000-0000-4000-8000-000000000101'
  order by created_at
  limit 1;

  if v_source_report.id is null then
    raise exception 'B3_STATE_GUARD_SOURCE_REPORT_MISSING';
  end if;

  insert into public.match_reports(
    owner_user_id, job_snapshot_id, job_snapshot_semantic_key,
    career_evidence_fingerprint_sha256, semantic_key, engine_version, basis
  ) values (
    v_source_report.owner_user_id,
    v_source_report.job_snapshot_id,
    v_source_report.job_snapshot_semantic_key,
    repeat('e',64),
    repeat('d',64),
    'b3-deterministic-evidence-match-v1',
    '{}'::jsonb
  ) returning id into v_guard_report_id;

  select id, semantic_key into v_requirement
  from public.job_requirements
  where owner_user_id=v_source_report.owner_user_id
    and snapshot_id=v_source_report.job_snapshot_id
  order by source_ordinal
  limit 1;

  begin
    insert into public.requirement_matches(
      match_report_id, owner_user_id, requirement_id, requirement_semantic_key,
      status, supporting_evidence_ids, supporting_evidence_snapshot, rationale
    ) values (
      v_guard_report_id, v_source_report.owner_user_id, v_requirement.id, v_requirement.semantic_key,
      'GAP', '{}'::uuid[], '[]'::jsonb, 'Forged unsupported gap'
    );
    raise exception 'B3_UNSUPPORTED_GAP_ACCEPTED';
  exception when check_violation then null;
  end;

  begin
    insert into public.requirement_matches(
      match_report_id, owner_user_id, requirement_id, requirement_semantic_key,
      status, supporting_evidence_ids, supporting_evidence_snapshot, rationale
    ) values (
      v_guard_report_id, v_source_report.owner_user_id, v_requirement.id, v_requirement.semantic_key,
      'BLOCKER', '{}'::uuid[], '[]'::jsonb, 'Forged unsupported blocker'
    );
    raise exception 'B3_UNSUPPORTED_BLOCKER_ACCEPTED';
  exception when check_violation then null;
  end;
end $$;

rollback;
