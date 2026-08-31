begin;

-- MatchReport is immutable after its one application-owned basis finalization.
-- Direct client UPDATE remains revoked; this narrow transition exists only so the
-- SECURITY DEFINER assessment transaction can persist counts derived from the
-- requirement matches it just created.
drop trigger if exists match_reports_immutable on public.match_reports;

create or replace function public.cv_engine_guard_match_report_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id
     or new.job_snapshot_id is distinct from old.job_snapshot_id
     or new.job_snapshot_semantic_key is distinct from old.job_snapshot_semantic_key
     or new.career_evidence_fingerprint_sha256 is distinct from old.career_evidence_fingerprint_sha256
     or new.semantic_key is distinct from old.semantic_key
     or new.engine_version is distinct from old.engine_version
     or new.created_at is distinct from old.created_at then
    raise exception 'B3_MATCH_REPORT_IMMUTABLE' using errcode = '23514';
  end if;

  if old.basis <> '{}'::jsonb or new.basis = '{}'::jsonb then
    raise exception 'B3_MATCH_REPORT_BASIS_IMMUTABLE' using errcode = '23514';
  end if;

  if not (new.basis ? 'totalRequirements' and new.basis ? 'required' and new.basis ? 'preferred' and new.basis ? 'context') then
    raise exception 'B3_MATCH_REPORT_BASIS_INVALID' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger match_reports_finalize_once
before update on public.match_reports
for each row execute function public.cv_engine_guard_match_report_update();

commit;
