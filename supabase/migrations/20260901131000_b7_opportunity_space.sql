begin;

create table public.market_observations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  job_snapshot_id uuid not null,
  job_snapshot_semantic_key text not null check (job_snapshot_semantic_key ~ '^[0-9a-f]{64}$'),
  raw_description_sha256 text not null check (raw_description_sha256 ~ '^[0-9a-f]{64}$'),
  role_title text not null check (char_length(btrim(role_title)) between 1 and 300),
  company text,
  observed_at timestamptz not null,
  captured_at timestamptz not null default now(),
  lifecycle_version text not null check (lifecycle_version = 'b7-market-observation-v1'),
  constraint market_observations_job_owner_fk foreign key (job_snapshot_id, owner_user_id)
    references public.job_snapshots(id, owner_user_id) on delete restrict,
  constraint market_observations_owner_job_unique unique (owner_user_id, job_snapshot_id),
  constraint market_observations_identity_owner unique (id, owner_user_id)
);

create table public.opportunity_space_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  market_observation_id uuid not null,
  opportunity_assessment_id uuid not null,
  job_snapshot_id uuid not null,
  recommendation text not null check (recommendation in ('READY_NOW','STRONG_STRETCH','EVIDENCE_INCOMPLETE','BUILDABLE','LOW_ALIGNMENT')),
  decision text not null check (decision in ('YES','CONSIDER','NOT_YET','NO')),
  action text not null check (action in ('APPLY','APPLY_WITH_CAUTION','CLARIFY_EVIDENCE','BUILD_FIRST','DEPRIORITIZE')),
  evidence_strength text not null check (evidence_strength in ('STRONG','MODERATE','LIMITED')),
  assessment_semantic_key text not null check (assessment_semantic_key ~ '^[0-9a-f]{64}$'),
  selected_at timestamptz not null default now(),
  comparison_policy_version text not null check (comparison_policy_version = 'b7-opportunity-space-v1'),
  constraint opportunity_space_observation_owner_fk foreign key (market_observation_id, owner_user_id)
    references public.market_observations(id, owner_user_id) on delete restrict,
  constraint opportunity_space_assessment_owner_fk foreign key (opportunity_assessment_id, owner_user_id)
    references public.opportunity_assessments(id, owner_user_id) on delete restrict,
  constraint opportunity_space_job_owner_fk foreign key (job_snapshot_id, owner_user_id)
    references public.job_snapshots(id, owner_user_id) on delete restrict,
  constraint opportunity_space_selection_unique unique (owner_user_id, market_observation_id, opportunity_assessment_id),
  constraint opportunity_space_identity_owner unique (id, owner_user_id)
);

create index market_observations_owner_observed_idx on public.market_observations(owner_user_id, observed_at desc);
create index opportunity_space_owner_selected_idx on public.opportunity_space_items(owner_user_id, selected_at desc);

create or replace function public.cv_engine_reject_b7_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'B7_HISTORICAL_ARTIFACT_IMMUTABLE' using errcode = '23514';
end;
$$;

create trigger market_observations_immutable before update on public.market_observations
for each row execute function public.cv_engine_reject_b7_update();
create trigger opportunity_space_items_immutable before update on public.opportunity_space_items
for each row execute function public.cv_engine_reject_b7_update();

create or replace function public.cv_engine_capture_market_observation(p_job_snapshot_id uuid)
returns table (observation_id uuid, created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_job record;
  v_observation_id uuid;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;

  select id, semantic_key, raw_description_sha256, role_title, company, captured_at
  into v_job
  from public.job_snapshots
  where id = p_job_snapshot_id and owner_user_id = v_owner;

  if v_job.id is null then raise exception 'JOB_SNAPSHOT_NOT_FOUND' using errcode = 'P0002'; end if;

  select id into v_observation_id
  from public.market_observations
  where owner_user_id = v_owner and job_snapshot_id = p_job_snapshot_id;

  if v_observation_id is not null then
    return query select v_observation_id, false;
    return;
  end if;

  insert into public.market_observations (
    owner_user_id, job_snapshot_id, job_snapshot_semantic_key, raw_description_sha256,
    role_title, company, observed_at, lifecycle_version
  ) values (
    v_owner, v_job.id, v_job.semantic_key, v_job.raw_description_sha256,
    v_job.role_title, v_job.company, v_job.captured_at, 'b7-market-observation-v1'
  ) returning id into v_observation_id;

  return query select v_observation_id, true;
end;
$$;

create or replace function public.cv_engine_select_opportunity(p_market_observation_id uuid)
returns table (space_item_id uuid, created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_observation record;
  v_assessment record;
  v_item_id uuid;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;

  select id, job_snapshot_id into v_observation
  from public.market_observations
  where id = p_market_observation_id and owner_user_id = v_owner;
  if v_observation.id is null then raise exception 'MARKET_OBSERVATION_NOT_FOUND' using errcode = 'P0002'; end if;

  select id, job_snapshot_id, recommendation, decision, action, evidence_strength, semantic_key
  into v_assessment
  from public.opportunity_assessments
  where owner_user_id = v_owner and job_snapshot_id = v_observation.job_snapshot_id
  order by created_at desc, id desc
  limit 1;

  if v_assessment.id is null then raise exception 'ASSESSMENT_REQUIRED_BEFORE_SELECTION' using errcode = '23514'; end if;
  if v_assessment.job_snapshot_id is distinct from v_observation.job_snapshot_id then
    raise exception 'B7_MARKET_ASSESSMENT_JOB_MISMATCH' using errcode = '23514';
  end if;

  select id into v_item_id
  from public.opportunity_space_items
  where owner_user_id = v_owner
    and market_observation_id = p_market_observation_id
    and opportunity_assessment_id = v_assessment.id;

  if v_item_id is not null then
    return query select v_item_id, false;
    return;
  end if;

  insert into public.opportunity_space_items (
    owner_user_id, market_observation_id, opportunity_assessment_id, job_snapshot_id,
    recommendation, decision, action, evidence_strength, assessment_semantic_key,
    comparison_policy_version
  ) values (
    v_owner, v_observation.id, v_assessment.id, v_observation.job_snapshot_id,
    v_assessment.recommendation, v_assessment.decision, v_assessment.action,
    v_assessment.evidence_strength, v_assessment.semantic_key,
    'b7-opportunity-space-v1'
  ) returning id into v_item_id;

  return query select v_item_id, true;
end;
$$;

alter table public.market_observations enable row level security;
alter table public.opportunity_space_items enable row level security;

create policy "market_observations_select_own" on public.market_observations for select to authenticated
using ((select auth.uid()) = owner_user_id);
create policy "opportunity_space_items_select_own" on public.opportunity_space_items for select to authenticated
using ((select auth.uid()) = owner_user_id);

revoke all on public.market_observations from anon, authenticated;
revoke all on public.opportunity_space_items from anon, authenticated;
grant select on public.market_observations to authenticated;
grant select on public.opportunity_space_items to authenticated;

revoke all on function public.cv_engine_capture_market_observation(uuid) from public, anon;
revoke all on function public.cv_engine_select_opportunity(uuid) from public, anon;
grant execute on function public.cv_engine_capture_market_observation(uuid) to authenticated;
grant execute on function public.cv_engine_select_opportunity(uuid) to authenticated;

commit;
