begin;

create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('GENERAL','TARGETED')),
  job_snapshot_id uuid,
  opportunity_assessment_id uuid,
  evidence_fingerprint_sha256 text not null check (evidence_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  semantic_key text not null check (semantic_key ~ '^[0-9a-f]{64}$'),
  composer_version text not null check (composer_version = 'b4-deterministic-resume-v1'),
  renderer_version text not null check (renderer_version = 'b4-plain-text-v1'),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  document_json jsonb not null check (jsonb_typeof(document_json) = 'object'),
  plain_text text not null check (char_length(btrim(plain_text)) > 0),
  created_at timestamptz not null default now(),
  constraint resume_versions_mode_binding check (
    (mode = 'GENERAL' and job_snapshot_id is null and opportunity_assessment_id is null)
    or
    (mode = 'TARGETED' and job_snapshot_id is not null and opportunity_assessment_id is not null)
  ),
  constraint resume_versions_job_owner_fk foreign key (job_snapshot_id, owner_user_id)
    references public.job_snapshots(id, owner_user_id) on delete restrict,
  constraint resume_versions_assessment_owner_fk foreign key (opportunity_assessment_id, owner_user_id)
    references public.opportunity_assessments(id, owner_user_id) on delete restrict,
  constraint resume_versions_owner_semantic_unique unique (owner_user_id, semantic_key),
  constraint resume_versions_identity_owner unique (id, owner_user_id)
);

create table public.resume_claims (
  id uuid primary key default gen_random_uuid(),
  resume_version_id uuid not null,
  owner_user_id uuid not null,
  ordinal integer not null check (ordinal > 0),
  evidence_id uuid not null,
  evidence_revision integer not null check (evidence_revision > 0),
  evidence_kind text not null check (evidence_kind in ('EMPLOYMENT','PROJECT','ACHIEVEMENT','EDUCATION','CERTIFICATION','SKILL','LANGUAGE','METRIC')),
  evidence_verification_status text not null check (evidence_verification_status = 'VERIFIED'),
  evidence_canonical_text text not null check (char_length(btrim(evidence_canonical_text)) between 1 and 10000),
  rendered_text text not null check (char_length(btrim(rendered_text)) between 1 and 10000),
  evidence_text_sha256 text not null check (evidence_text_sha256 ~ '^[0-9a-f]{64}$'),
  claim_sha256 text not null check (claim_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint resume_claims_version_owner_fk foreign key (resume_version_id, owner_user_id)
    references public.resume_versions(id, owner_user_id) on delete cascade,
  constraint resume_claims_evidence_owner_fk foreign key (evidence_id, owner_user_id)
    references public.career_evidence(id, owner_user_id) on delete restrict,
  constraint resume_claims_source_preserving check (rendered_text = evidence_canonical_text),
  constraint resume_claims_one_ordinal unique (resume_version_id, ordinal),
  constraint resume_claims_one_evidence_revision unique (resume_version_id, evidence_id, evidence_revision)
);

create index resume_versions_owner_created_idx on public.resume_versions(owner_user_id, created_at desc);
create index resume_claims_version_ordinal_idx on public.resume_claims(resume_version_id, ordinal);

create or replace function public.cv_engine_reject_b4_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'B4_RESUME_ARTIFACT_IMMUTABLE' using errcode = '23514';
end;
$$;

create trigger resume_versions_immutable before update on public.resume_versions
for each row execute function public.cv_engine_reject_b4_update();
create trigger resume_claims_immutable before update on public.resume_claims
for each row execute function public.cv_engine_reject_b4_update();

create or replace function public.cv_engine_guard_resume_claim_insert()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_current_revision integer;
  v_kind text;
  v_status text;
  v_text text;
begin
  select ce.current_revision, ce.kind, cer.verification_status, cer.canonical_text
    into v_current_revision, v_kind, v_status, v_text
  from public.career_evidence ce
  join public.career_evidence_revisions cer
    on cer.evidence_id = ce.id and cer.owner_user_id = ce.owner_user_id
   and cer.revision_number = new.evidence_revision
  where ce.id = new.evidence_id and ce.owner_user_id = new.owner_user_id;

  if v_current_revision is null then
    raise exception 'B4_EVIDENCE_NOT_FOUND' using errcode = '23514';
  end if;
  if v_kind is distinct from new.evidence_kind or v_status <> 'VERIFIED' or new.evidence_verification_status <> 'VERIFIED' then
    raise exception 'B4_EVIDENCE_PROVENANCE_MISMATCH' using errcode = '23514';
  end if;
  if v_text is distinct from new.evidence_canonical_text or new.rendered_text is distinct from v_text then
    raise exception 'B4_SOURCE_PRESERVATION_VIOLATION' using errcode = '23514';
  end if;
  if public.cv_engine_sha256(v_text) <> new.evidence_text_sha256 then
    raise exception 'B4_EVIDENCE_HASH_MISMATCH' using errcode = '23514';
  end if;
  if public.cv_engine_sha256(new.evidence_id::text || chr(31) || new.evidence_revision::text || chr(31) || v_text) <> new.claim_sha256 then
    raise exception 'B4_CLAIM_HASH_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger resume_claims_insert_guard before insert on public.resume_claims
for each row execute function public.cv_engine_guard_resume_claim_insert();

alter table public.resume_versions enable row level security;
alter table public.resume_claims enable row level security;

create policy "resume_versions_select_own" on public.resume_versions for select to authenticated
using ((select auth.uid()) = owner_user_id);
create policy "resume_claims_select_own" on public.resume_claims for select to authenticated
using ((select auth.uid()) = owner_user_id);

revoke all on public.resume_versions from anon, authenticated;
revoke all on public.resume_claims from anon, authenticated;
grant select on public.resume_versions to authenticated;
grant select on public.resume_claims to authenticated;

create or replace function public.cv_engine_create_resume_version(
  p_mode text,
  p_job_snapshot_id uuid default null
)
returns table (resume_version_id uuid, created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_mode text := upper(coalesce(p_mode, ''));
  v_report_id uuid;
  v_assessment_id uuid;
  v_assessment_semantic_key text;
  v_job_semantic_key text;
  v_claims jsonb;
  v_claim_count integer;
  v_evidence_fingerprint text;
  v_semantic_key text;
  v_manifest jsonb;
  v_document jsonb;
  v_plain_text text;
  v_resume_id uuid;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if v_mode not in ('GENERAL','TARGETED') then raise exception 'B4_INVALID_MODE' using errcode = '22023'; end if;
  if v_mode = 'GENERAL' and p_job_snapshot_id is not null then raise exception 'B4_GENERAL_JOB_FORBIDDEN' using errcode = '22023'; end if;
  if v_mode = 'TARGETED' and p_job_snapshot_id is null then raise exception 'B4_TARGETED_JOB_REQUIRED' using errcode = '22023'; end if;

  if v_mode = 'TARGETED' then
    select js.semantic_key into v_job_semantic_key
    from public.job_snapshots js
    where js.id = p_job_snapshot_id and js.owner_user_id = v_owner;
    if v_job_semantic_key is null then raise exception 'JOB_SNAPSHOT_NOT_FOUND' using errcode = 'P0002'; end if;

    select x.match_report_id, x.assessment_id
      into v_report_id, v_assessment_id
    from public.cv_engine_create_opportunity_assessment(p_job_snapshot_id) x
    limit 1;

    select oa.semantic_key into v_assessment_semantic_key
    from public.opportunity_assessments oa
    where oa.id = v_assessment_id and oa.owner_user_id = v_owner;

    with support as (
      select distinct unnest(rm.supporting_evidence_ids) as evidence_id
      from public.requirement_matches rm
      where rm.owner_user_id = v_owner
        and rm.match_report_id = v_report_id
        and rm.status in ('MATCH','POTENTIAL_MATCH')
    ), eligible as (
      select ce.id, ce.current_revision, ce.kind, cer.canonical_text
      from support s
      join public.career_evidence ce on ce.id = s.evidence_id and ce.owner_user_id = v_owner
      join public.career_evidence_revisions cer
        on cer.evidence_id = ce.id and cer.owner_user_id = ce.owner_user_id
       and cer.revision_number = ce.current_revision
      where cer.verification_status = 'VERIFIED'
    ), ordered as (
      select row_number() over (order by kind, id)::integer as ordinal, * from eligible
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'ordinal', ordinal,
      'evidenceId', id,
      'evidenceRevision', current_revision,
      'evidenceKind', kind,
      'evidenceVerificationStatus', 'VERIFIED',
      'evidenceCanonicalText', canonical_text,
      'renderedText', canonical_text,
      'evidenceTextSha256', public.cv_engine_sha256(canonical_text),
      'claimSha256', public.cv_engine_sha256(id::text || chr(31) || current_revision::text || chr(31) || canonical_text)
    ) order by ordinal), '[]'::jsonb) into v_claims from ordered;
  else
    with eligible as (
      select ce.id, ce.current_revision, ce.kind, cer.canonical_text
      from public.career_evidence ce
      join public.career_evidence_revisions cer
        on cer.evidence_id = ce.id and cer.owner_user_id = ce.owner_user_id
       and cer.revision_number = ce.current_revision
      where ce.owner_user_id = v_owner and cer.verification_status = 'VERIFIED'
    ), ordered as (
      select row_number() over (order by kind, id)::integer as ordinal, * from eligible
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'ordinal', ordinal,
      'evidenceId', id,
      'evidenceRevision', current_revision,
      'evidenceKind', kind,
      'evidenceVerificationStatus', 'VERIFIED',
      'evidenceCanonicalText', canonical_text,
      'renderedText', canonical_text,
      'evidenceTextSha256', public.cv_engine_sha256(canonical_text),
      'claimSha256', public.cv_engine_sha256(id::text || chr(31) || current_revision::text || chr(31) || canonical_text)
    ) order by ordinal), '[]'::jsonb) into v_claims from ordered;
  end if;

  v_claim_count := jsonb_array_length(v_claims);
  if v_claim_count = 0 then raise exception 'B4_VERIFIED_EVIDENCE_MISSING' using errcode = 'P0002'; end if;

  select public.cv_engine_sha256(string_agg(
    item->>'evidenceId' || chr(31) || item->>'evidenceRevision' || chr(31) || item->>'evidenceTextSha256',
    chr(30) order by (item->>'ordinal')::integer
  )) into v_evidence_fingerprint
  from jsonb_array_elements(v_claims) item;

  v_semantic_key := public.cv_engine_sha256(
    v_mode || chr(31) || coalesce(v_job_semantic_key, '-') || chr(31) ||
    coalesce(v_assessment_semantic_key, '-') || chr(31) || v_evidence_fingerprint || chr(31) ||
    'b4-deterministic-resume-v1' || chr(31) || 'b4-plain-text-v1'
  );

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':resume:' || v_semantic_key, 0));
  select rv.id into v_resume_id
  from public.resume_versions rv
  where rv.owner_user_id = v_owner and rv.semantic_key = v_semantic_key;
  if v_resume_id is not null then
    resume_version_id := v_resume_id; created := false; return next; return;
  end if;

  select jsonb_build_object(
    'composerVersion', 'b4-deterministic-resume-v1',
    'rendererVersion', 'b4-plain-text-v1',
    'evidenceFingerprintSha256', v_evidence_fingerprint,
    'claimCount', v_claim_count,
    'evidenceReceipts', jsonb_agg(jsonb_build_object(
      'evidenceId', item->>'evidenceId',
      'revision', (item->>'evidenceRevision')::integer,
      'textSha256', item->>'evidenceTextSha256'
    ) order by (item->>'ordinal')::integer)
  ) into v_manifest from jsonb_array_elements(v_claims) item;

  select jsonb_build_object(
    'mode', v_mode,
    'claims', jsonb_agg(jsonb_build_object(
      'ordinal', (item->>'ordinal')::integer,
      'kind', item->>'evidenceKind',
      'text', item->>'renderedText'
    ) order by (item->>'ordinal')::integer)
  ), string_agg(item->>'renderedText', E'\n' order by (item->>'ordinal')::integer)
  into v_document, v_plain_text
  from jsonb_array_elements(v_claims) item;

  insert into public.resume_versions (
    owner_user_id, mode, job_snapshot_id, opportunity_assessment_id,
    evidence_fingerprint_sha256, semantic_key, composer_version, renderer_version,
    manifest, document_json, plain_text
  ) values (
    v_owner, v_mode, case when v_mode = 'TARGETED' then p_job_snapshot_id else null end,
    case when v_mode = 'TARGETED' then v_assessment_id else null end,
    v_evidence_fingerprint, v_semantic_key, 'b4-deterministic-resume-v1', 'b4-plain-text-v1',
    v_manifest, v_document, v_plain_text
  ) returning id into v_resume_id;

  insert into public.resume_claims (
    resume_version_id, owner_user_id, ordinal, evidence_id, evidence_revision,
    evidence_kind, evidence_verification_status, evidence_canonical_text, rendered_text,
    evidence_text_sha256, claim_sha256
  )
  select v_resume_id, v_owner,
    (item->>'ordinal')::integer,
    (item->>'evidenceId')::uuid,
    (item->>'evidenceRevision')::integer,
    item->>'evidenceKind',
    'VERIFIED',
    item->>'evidenceCanonicalText',
    item->>'renderedText',
    item->>'evidenceTextSha256',
    item->>'claimSha256'
  from jsonb_array_elements(v_claims) item
  order by (item->>'ordinal')::integer;

  resume_version_id := v_resume_id; created := true; return next;
end;
$$;

revoke all on function public.cv_engine_create_resume_version(text, uuid) from public, anon;
grant execute on function public.cv_engine_create_resume_version(text, uuid) to authenticated;

commit;
