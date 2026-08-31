begin;

alter table public.job_requirements
  add constraint job_requirements_identity_owner unique (id, owner_user_id);

create table public.match_reports (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  job_snapshot_id uuid not null,
  job_snapshot_semantic_key text not null check (job_snapshot_semantic_key ~ '^[0-9a-f]{64}$'),
  career_evidence_fingerprint_sha256 text not null check (career_evidence_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  semantic_key text not null check (semantic_key ~ '^[0-9a-f]{64}$'),
  engine_version text not null check (engine_version = 'b3-deterministic-evidence-match-v1'),
  basis jsonb not null check (jsonb_typeof(basis) = 'object'),
  created_at timestamptz not null default now(),
  constraint match_reports_job_owner_fk foreign key (job_snapshot_id, owner_user_id)
    references public.job_snapshots(id, owner_user_id) on delete restrict,
  constraint match_reports_owner_semantic_unique unique (owner_user_id, semantic_key),
  constraint match_reports_identity_owner unique (id, owner_user_id)
);

create table public.requirement_matches (
  id uuid primary key default gen_random_uuid(),
  match_report_id uuid not null,
  owner_user_id uuid not null,
  requirement_id uuid not null,
  requirement_semantic_key text not null check (requirement_semantic_key ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('MATCH','POTENTIAL_MATCH','GAP','UNKNOWN','BLOCKER')),
  supporting_evidence_ids uuid[] not null default '{}',
  supporting_evidence_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(supporting_evidence_snapshot) = 'array'),
  rationale text not null check (char_length(btrim(rationale)) between 1 and 5000),
  created_at timestamptz not null default now(),
  constraint requirement_matches_report_owner_fk foreign key (match_report_id, owner_user_id)
    references public.match_reports(id, owner_user_id) on delete cascade,
  constraint requirement_matches_requirement_owner_fk foreign key (requirement_id, owner_user_id)
    references public.job_requirements(id, owner_user_id) on delete restrict,
  constraint requirement_matches_one_per_requirement unique (match_report_id, requirement_id),
  constraint requirement_matches_support_state check (
    (status in ('MATCH','POTENTIAL_MATCH') and cardinality(supporting_evidence_ids) > 0 and jsonb_array_length(supporting_evidence_snapshot) > 0)
    or (status = 'UNKNOWN' and cardinality(supporting_evidence_ids) = 0 and jsonb_array_length(supporting_evidence_snapshot) = 0)
    or status in ('GAP','BLOCKER')
  )
);

create table public.opportunity_assessments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  match_report_id uuid not null,
  job_snapshot_id uuid not null,
  semantic_key text not null check (semantic_key ~ '^[0-9a-f]{64}$'),
  policy_version text not null check (policy_version = 'b3-opportunity-assessment-v1'),
  recommendation text not null check (recommendation in ('READY_NOW','STRONG_STRETCH','EVIDENCE_INCOMPLETE','BUILDABLE','LOW_ALIGNMENT')),
  decision text not null check (decision in ('YES','CONSIDER','NOT_YET','NO')),
  action text not null check (action in ('APPLY','APPLY_WITH_CAUTION','CLARIFY_EVIDENCE','BUILD_FIRST','DEPRIORITIZE')),
  eligibility text not null check (eligibility in ('CLEAR','UNCERTAIN','BLOCKED')),
  evidence_strength text not null check (evidence_strength in ('STRONG','MODERATE','LIMITED')),
  critical_gap_requirement_ids uuid[] not null default '{}',
  optional_gap_requirement_ids uuid[] not null default '{}',
  uncertain_requirement_ids uuid[] not null default '{}',
  rationale text not null check (char_length(btrim(rationale)) between 1 and 10000),
  scope_boundary text not null check (scope_boundary = 'Evidence alignment only. This is not a hiring probability, recruiter decision, or commercial ATS score.'),
  created_at timestamptz not null default now(),
  constraint opportunity_assessments_report_owner_fk foreign key (match_report_id, owner_user_id)
    references public.match_reports(id, owner_user_id) on delete cascade,
  constraint opportunity_assessments_job_owner_fk foreign key (job_snapshot_id, owner_user_id)
    references public.job_snapshots(id, owner_user_id) on delete restrict,
  constraint opportunity_assessments_owner_semantic_unique unique (owner_user_id, semantic_key),
  constraint opportunity_assessments_one_per_report unique (match_report_id),
  constraint opportunity_assessments_identity_owner unique (id, owner_user_id)
);

create index match_reports_owner_created_idx on public.match_reports(owner_user_id, created_at desc);
create index requirement_matches_report_idx on public.requirement_matches(match_report_id, created_at);
create index opportunity_assessments_owner_created_idx on public.opportunity_assessments(owner_user_id, created_at desc);

create or replace function public.cv_engine_b3_normalize(p_value text)
returns text
language sql
immutable
parallel safe
return lower(regexp_replace(regexp_replace(btrim(coalesce(p_value, '')), '[^[:alnum:]+#./-]+', ' ', 'g'), '\s+', ' ', 'g'));

create or replace function public.cv_engine_b3_tokens(p_value text)
returns text[]
language sql
immutable
parallel safe
as $$
  select coalesce(array_agg(distinct token order by token), '{}'::text[])
  from regexp_split_to_table(public.cv_engine_b3_normalize(p_value), '\s+') as token
  where char_length(token) >= 2
    and token <> all(array[
      'and','the','for','with','from','that','this','your','you','our','are','will','have','has','must','required','preferred','minimum','at','least','experience','years','year','work','role','ability','skills','skill','is','a','an','of','to','in','on','or',
      'con','para','los','las','una','uno','que','del','por','debe','requerido','requerida','preferido','preferida','experiencia','anos','trabajo','habilidad','habilidades','minimo'
    ]::text[]);
$$;

create or replace function public.cv_engine_b3_overlap(p_requirement text, p_evidence text)
returns numeric
language sql
immutable
parallel safe
as $$
  with req as (
    select unnest(public.cv_engine_b3_tokens(p_requirement)) token
  ), ev as (
    select unnest(public.cv_engine_b3_tokens(p_evidence)) token
  ), counts as (
    select (select count(*) from req) total,
           (select count(*) from req where token in (select token from ev)) matched
  )
  select case when total = 0 then 0::numeric else matched::numeric / total::numeric end from counts;
$$;

create or replace function public.cv_engine_reject_b3_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'B3_DERIVED_ARTIFACT_IMMUTABLE' using errcode = '23514';
end;
$$;

create trigger match_reports_immutable before update on public.match_reports
for each row execute function public.cv_engine_reject_b3_update();
create trigger requirement_matches_immutable before update on public.requirement_matches
for each row execute function public.cv_engine_reject_b3_update();
create trigger opportunity_assessments_immutable before update on public.opportunity_assessments
for each row execute function public.cv_engine_reject_b3_update();

create or replace function public.cv_engine_guard_requirement_match_insert()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_job_snapshot_id uuid;
  v_requirement_snapshot_id uuid;
  v_evidence_id uuid;
  v_snapshot_item jsonb;
begin
  select job_snapshot_id into v_job_snapshot_id
  from public.match_reports
  where id = new.match_report_id and owner_user_id = new.owner_user_id;

  select snapshot_id into v_requirement_snapshot_id
  from public.job_requirements
  where id = new.requirement_id and owner_user_id = new.owner_user_id
    and semantic_key = new.requirement_semantic_key;

  if v_job_snapshot_id is null or v_requirement_snapshot_id is distinct from v_job_snapshot_id then
    raise exception 'B3_REQUIREMENT_REPORT_MISMATCH' using errcode = '23514';
  end if;

  if cardinality(new.supporting_evidence_ids) <> jsonb_array_length(new.supporting_evidence_snapshot) then
    raise exception 'B3_SUPPORT_SNAPSHOT_COUNT_MISMATCH' using errcode = '23514';
  end if;

  foreach v_evidence_id in array new.supporting_evidence_ids loop
    if not exists (
      select 1 from public.career_evidence
      where id = v_evidence_id and owner_user_id = new.owner_user_id
    ) then
      raise exception 'B3_SUPPORT_EVIDENCE_OWNER_MISMATCH' using errcode = '23514';
    end if;
  end loop;

  for v_snapshot_item in select value from jsonb_array_elements(new.supporting_evidence_snapshot) loop
    if not ((v_snapshot_item->>'id')::uuid = any(new.supporting_evidence_ids)) then
      raise exception 'B3_SUPPORT_SNAPSHOT_ID_MISMATCH' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

create trigger requirement_matches_insert_guard before insert on public.requirement_matches
for each row execute function public.cv_engine_guard_requirement_match_insert();

alter table public.match_reports enable row level security;
alter table public.requirement_matches enable row level security;
alter table public.opportunity_assessments enable row level security;

create policy "match_reports_select_own" on public.match_reports for select to authenticated
using ((select auth.uid()) = owner_user_id);
create policy "requirement_matches_select_own" on public.requirement_matches for select to authenticated
using ((select auth.uid()) = owner_user_id);
create policy "opportunity_assessments_select_own" on public.opportunity_assessments for select to authenticated
using ((select auth.uid()) = owner_user_id);

revoke all on public.match_reports from anon, authenticated;
revoke all on public.requirement_matches from anon, authenticated;
revoke all on public.opportunity_assessments from anon, authenticated;
grant select on public.match_reports to authenticated;
grant select on public.requirement_matches to authenticated;
grant select on public.opportunity_assessments to authenticated;

create or replace function public.cv_engine_create_opportunity_assessment(p_job_snapshot_id uuid)
returns table (match_report_id uuid, assessment_id uuid, created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_job_semantic_key text;
  v_evidence_count integer;
  v_requirement_count integer;
  v_evidence_fingerprint text;
  v_report_semantic_key text;
  v_report_id uuid;
  v_assessment_id uuid;
  v_requirement record;
  v_support_ids uuid[];
  v_support_snapshot jsonb;
  v_status text;
  v_rationale text;
  v_basis jsonb;
  v_required_total integer;
  v_required_match integer;
  v_required_potential integer;
  v_required_gap integer;
  v_required_unknown integer;
  v_required_blocker integer;
  v_support_count integer;
  v_all_support_verified boolean;
  v_recommendation text;
  v_decision text;
  v_action text;
  v_eligibility text;
  v_evidence_strength text;
  v_critical_gaps uuid[];
  v_optional_gaps uuid[];
  v_uncertain uuid[];
  v_assessment_semantic_key text;
  v_assessment_rationale text;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;

  select semantic_key into v_job_semantic_key
  from public.job_snapshots
  where id = p_job_snapshot_id and owner_user_id = v_owner;
  if v_job_semantic_key is null then
    raise exception 'JOB_SNAPSHOT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*) into v_requirement_count
  from public.job_requirements
  where snapshot_id = p_job_snapshot_id and owner_user_id = v_owner;
  if v_requirement_count = 0 then
    raise exception 'JOB_REQUIREMENTS_MISSING' using errcode = 'P0002';
  end if;

  select count(*) into v_evidence_count
  from public.career_evidence
  where owner_user_id = v_owner;
  if v_evidence_count = 0 then
    raise exception 'CAREER_EVIDENCE_MISSING' using errcode = 'P0002';
  end if;

  select public.cv_engine_sha256(string_agg(
    ce.id::text || chr(31) || ce.kind || chr(31) || ce.source || chr(31) ||
    ce.current_revision::text || chr(31) || cer.verification_status || chr(31) || cer.canonical_text,
    chr(30) order by ce.id::text
  )) into v_evidence_fingerprint
  from public.career_evidence ce
  join public.career_evidence_revisions cer
    on cer.evidence_id = ce.id and cer.owner_user_id = ce.owner_user_id
   and cer.revision_number = ce.current_revision
  where ce.owner_user_id = v_owner;

  v_report_semantic_key := public.cv_engine_sha256(
    v_job_semantic_key || chr(31) || v_evidence_fingerprint || chr(31) || 'b3-deterministic-evidence-match-v1'
  );

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || p_job_snapshot_id::text, 0));

  select id into v_report_id from public.match_reports
  where owner_user_id = v_owner and semantic_key = v_report_semantic_key;
  if v_report_id is not null then
    select id into v_assessment_id from public.opportunity_assessments
    where owner_user_id = v_owner and match_report_id = v_report_id;
    match_report_id := v_report_id;
    assessment_id := v_assessment_id;
    created := false;
    return next;
    return;
  end if;

  insert into public.match_reports (
    owner_user_id, job_snapshot_id, job_snapshot_semantic_key,
    career_evidence_fingerprint_sha256, semantic_key, engine_version, basis
  ) values (
    v_owner, p_job_snapshot_id, v_job_semantic_key,
    v_evidence_fingerprint, v_report_semantic_key, 'b3-deterministic-evidence-match-v1', '{}'::jsonb
  ) returning id into v_report_id;

  for v_requirement in
    select * from public.job_requirements
    where snapshot_id = p_job_snapshot_id and owner_user_id = v_owner
    order by source_ordinal
  loop
    select coalesce(array_agg(ce.id order by ce.id), '{}'::uuid[]),
           coalesce(jsonb_agg(jsonb_build_object(
             'id', ce.id,
             'revision', ce.current_revision,
             'kind', ce.kind,
             'verificationStatus', cer.verification_status,
             'canonicalText', cer.canonical_text
           ) order by ce.id), '[]'::jsonb)
      into v_support_ids, v_support_snapshot
    from public.career_evidence ce
    join public.career_evidence_revisions cer
      on cer.evidence_id = ce.id and cer.owner_user_id = ce.owner_user_id
     and cer.revision_number = ce.current_revision
    where ce.owner_user_id = v_owner
      and public.cv_engine_b3_overlap(v_requirement.canonical_concept, cer.canonical_text) = 1;

    if cardinality(v_support_ids) > 0 then
      v_status := 'MATCH';
      v_rationale := 'Current Career Evidence contains all meaningful terms in the job requirement concept.';
    else
      select coalesce(array_agg(ce.id order by ce.id), '{}'::uuid[]),
             coalesce(jsonb_agg(jsonb_build_object(
               'id', ce.id,
               'revision', ce.current_revision,
               'kind', ce.kind,
               'verificationStatus', cer.verification_status,
               'canonicalText', cer.canonical_text
             ) order by ce.id), '[]'::jsonb)
        into v_support_ids, v_support_snapshot
      from public.career_evidence ce
      join public.career_evidence_revisions cer
        on cer.evidence_id = ce.id and cer.owner_user_id = ce.owner_user_id
       and cer.revision_number = ce.current_revision
      where ce.owner_user_id = v_owner
        and public.cv_engine_b3_overlap(v_requirement.canonical_concept, cer.canonical_text) >= 0.5;

      if cardinality(v_support_ids) > 0 then
        v_status := 'POTENTIAL_MATCH';
        v_rationale := 'Current Career Evidence materially overlaps this requirement, but the relationship is not strong enough for MATCH.';
      else
        v_status := 'UNKNOWN';
        v_rationale := 'No current Career Evidence defensibly supports this requirement. Absence of evidence is not treated as a capability gap.';
      end if;
    end if;

    insert into public.requirement_matches (
      match_report_id, owner_user_id, requirement_id, requirement_semantic_key,
      status, supporting_evidence_ids, supporting_evidence_snapshot, rationale
    ) values (
      v_report_id, v_owner, v_requirement.id, v_requirement.semantic_key,
      v_status, v_support_ids, v_support_snapshot, v_rationale
    );
  end loop;

  select jsonb_build_object(
    'totalRequirements', count(*),
    'required', jsonb_build_object(
      'MATCH', count(*) filter (where jr.importance='REQUIRED' and rm.status='MATCH'),
      'POTENTIAL_MATCH', count(*) filter (where jr.importance='REQUIRED' and rm.status='POTENTIAL_MATCH'),
      'GAP', count(*) filter (where jr.importance='REQUIRED' and rm.status='GAP'),
      'UNKNOWN', count(*) filter (where jr.importance='REQUIRED' and rm.status='UNKNOWN'),
      'BLOCKER', count(*) filter (where jr.importance='REQUIRED' and rm.status='BLOCKER')
    ),
    'preferred', jsonb_build_object(
      'MATCH', count(*) filter (where jr.importance='PREFERRED' and rm.status='MATCH'),
      'POTENTIAL_MATCH', count(*) filter (where jr.importance='PREFERRED' and rm.status='POTENTIAL_MATCH'),
      'GAP', count(*) filter (where jr.importance='PREFERRED' and rm.status='GAP'),
      'UNKNOWN', count(*) filter (where jr.importance='PREFERRED' and rm.status='UNKNOWN'),
      'BLOCKER', count(*) filter (where jr.importance='PREFERRED' and rm.status='BLOCKER')
    ),
    'context', jsonb_build_object(
      'MATCH', count(*) filter (where jr.importance='CONTEXT' and rm.status='MATCH'),
      'POTENTIAL_MATCH', count(*) filter (where jr.importance='CONTEXT' and rm.status='POTENTIAL_MATCH'),
      'GAP', count(*) filter (where jr.importance='CONTEXT' and rm.status='GAP'),
      'UNKNOWN', count(*) filter (where jr.importance='CONTEXT' and rm.status='UNKNOWN'),
      'BLOCKER', count(*) filter (where jr.importance='CONTEXT' and rm.status='BLOCKER')
    )
  ) into v_basis
  from public.requirement_matches rm
  join public.job_requirements jr on jr.id = rm.requirement_id and jr.owner_user_id = rm.owner_user_id
  where rm.match_report_id = v_report_id and rm.owner_user_id = v_owner;

  update public.match_reports set basis = v_basis where id = v_report_id;

  select
    count(*) filter (where jr.importance='REQUIRED'),
    count(*) filter (where jr.importance='REQUIRED' and rm.status='MATCH'),
    count(*) filter (where jr.importance='REQUIRED' and rm.status='POTENTIAL_MATCH'),
    count(*) filter (where jr.importance='REQUIRED' and rm.status='GAP'),
    count(*) filter (where jr.importance='REQUIRED' and rm.status='UNKNOWN'),
    count(*) filter (where jr.importance='REQUIRED' and rm.status='BLOCKER'),
    count(*) filter (where rm.status in ('MATCH','POTENTIAL_MATCH')),
    coalesce(array_agg(rm.requirement_id order by jr.source_ordinal) filter (where jr.importance='REQUIRED' and rm.status in ('GAP','BLOCKER')), '{}'::uuid[]),
    coalesce(array_agg(rm.requirement_id order by jr.source_ordinal) filter (where jr.importance='PREFERRED' and rm.status in ('GAP','BLOCKER')), '{}'::uuid[]),
    coalesce(array_agg(rm.requirement_id order by jr.source_ordinal) filter (where rm.status='UNKNOWN'), '{}'::uuid[])
  into v_required_total, v_required_match, v_required_potential, v_required_gap,
       v_required_unknown, v_required_blocker, v_support_count,
       v_critical_gaps, v_optional_gaps, v_uncertain
  from public.requirement_matches rm
  join public.job_requirements jr on jr.id = rm.requirement_id and jr.owner_user_id = rm.owner_user_id
  where rm.match_report_id = v_report_id and rm.owner_user_id = v_owner;

  select coalesce(bool_and((item->>'verificationStatus') = 'VERIFIED'), false)
  into v_all_support_verified
  from public.requirement_matches rm
  cross join lateral jsonb_array_elements(rm.supporting_evidence_snapshot) item
  where rm.match_report_id = v_report_id and rm.owner_user_id = v_owner
    and rm.status in ('MATCH','POTENTIAL_MATCH');

  if v_required_blocker > 0 then
    v_recommendation := 'LOW_ALIGNMENT'; v_decision := 'NO'; v_action := 'DEPRIORITIZE'; v_eligibility := 'BLOCKED';
    v_assessment_rationale := 'At least one explicit required constraint is contradicted by defensible evidence. The opportunity is blocked until that constraint changes or new evidence supersedes it.';
  elsif v_required_unknown > 0 then
    v_recommendation := 'EVIDENCE_INCOMPLETE'; v_decision := 'NOT_YET'; v_action := 'CLARIFY_EVIDENCE'; v_eligibility := 'UNCERTAIN';
    v_assessment_rationale := v_required_unknown::text || ' required requirement(s) lack defensible supporting evidence. CV Engine does not convert missing evidence into a pass or a factual gap.';
  elsif v_required_gap > 0 then
    v_recommendation := 'BUILDABLE'; v_decision := 'NOT_YET'; v_action := 'BUILD_FIRST'; v_eligibility := 'CLEAR';
    v_assessment_rationale := v_required_gap::text || ' required requirement(s) are explicit evidence-backed gaps. Strengthen those capabilities before treating this as a primary application target.';
  elsif v_required_total > 0 and v_required_match = v_required_total and v_all_support_verified then
    v_recommendation := 'READY_NOW'; v_decision := 'YES'; v_action := 'APPLY'; v_eligibility := 'CLEAR';
    v_assessment_rationale := 'Every explicit required requirement is supported by verified Career Evidence. This is evidence alignment only, not a prediction of hiring outcome.';
  elsif v_required_total > 0 and (v_required_match + v_required_potential) = v_required_total then
    v_recommendation := 'STRONG_STRETCH'; v_decision := 'CONSIDER'; v_action := 'APPLY_WITH_CAUTION'; v_eligibility := 'CLEAR';
    v_assessment_rationale := 'Every explicit required requirement has evidence support, but at least one relationship is potential or relies on evidence that is not fully verified.';
  elsif v_required_total = 0 then
    v_recommendation := 'EVIDENCE_INCOMPLETE'; v_decision := 'CONSIDER'; v_action := 'CLARIFY_EVIDENCE'; v_eligibility := 'UNCERTAIN';
    v_assessment_rationale := 'The Job Snapshot contains no explicit REQUIRED requirements, so CV Engine withholds READY_NOW rather than inventing requirement criticality.';
  elsif v_support_count > 0 then
    v_recommendation := 'EVIDENCE_INCOMPLETE'; v_decision := 'NOT_YET'; v_action := 'CLARIFY_EVIDENCE'; v_eligibility := 'UNCERTAIN';
    v_assessment_rationale := 'Some evidence overlap exists, but the available evidence is insufficient for a stronger application recommendation.';
  else
    v_recommendation := 'EVIDENCE_INCOMPLETE'; v_decision := 'NOT_YET'; v_action := 'CLARIFY_EVIDENCE'; v_eligibility := 'UNCERTAIN';
    v_assessment_rationale := 'No defensible evidence support was found. CV Engine records uncertainty rather than claiming low capability from missing evidence.';
  end if;

  if v_required_total > 0 and v_required_match = v_required_total and v_all_support_verified then
    v_evidence_strength := 'STRONG';
  elsif v_support_count > 0 then
    v_evidence_strength := 'MODERATE';
  else
    v_evidence_strength := 'LIMITED';
  end if;

  v_assessment_semantic_key := public.cv_engine_sha256(v_report_semantic_key || chr(31) || 'b3-opportunity-assessment-v1');

  insert into public.opportunity_assessments (
    owner_user_id, match_report_id, job_snapshot_id, semantic_key, policy_version,
    recommendation, decision, action, eligibility, evidence_strength,
    critical_gap_requirement_ids, optional_gap_requirement_ids, uncertain_requirement_ids,
    rationale, scope_boundary
  ) values (
    v_owner, v_report_id, p_job_snapshot_id, v_assessment_semantic_key, 'b3-opportunity-assessment-v1',
    v_recommendation, v_decision, v_action, v_eligibility, v_evidence_strength,
    v_critical_gaps, v_optional_gaps, v_uncertain,
    v_assessment_rationale,
    'Evidence alignment only. This is not a hiring probability, recruiter decision, or commercial ATS score.'
  ) returning id into v_assessment_id;

  match_report_id := v_report_id;
  assessment_id := v_assessment_id;
  created := true;
  return next;
end;
$$;

revoke all on function public.cv_engine_b3_normalize(text) from public;
revoke all on function public.cv_engine_b3_tokens(text) from public;
revoke all on function public.cv_engine_b3_overlap(text,text) from public;
revoke all on function public.cv_engine_create_opportunity_assessment(uuid) from public;
grant execute on function public.cv_engine_create_opportunity_assessment(uuid) to authenticated;

commit;
