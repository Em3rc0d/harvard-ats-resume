\set ON_ERROR_STOP on

-- B8 security + lifecycle qualification.
-- Uses dedicated users so prior B3/B7 fixtures remain untouched.

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000808'),
  ('00000000-0000-4000-8000-000000000909')
on conflict do nothing;

-- Supabase API role hardening: anon must not execute any cv_engine_* function.
do $$
declare
  v_anon_count integer;
begin
  select count(*) into v_anon_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like 'cv_engine_%'
    and has_function_privilege('anon', p.oid, 'EXECUTE');

  if v_anon_count <> 0 then
    raise exception 'B8_ANON_EXECUTE_SURFACE_REMAINS:%', v_anon_count;
  end if;
end;
$$;

-- Helpers flagged by the Supabase advisor must have an explicit search_path.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'cv_engine_sha256',
      'cv_engine_b3_normalize',
      'cv_engine_b3_tokens',
      'cv_engine_b3_overlap',
      'cv_engine_p1_normalize',
      'cv_engine_p1_quantitative_tokens',
      'cv_engine_p1_has_term'
    )
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
      where cfg like 'search_path=%'
    );

  if v_bad <> 0 then
    raise exception 'B8_MUTABLE_SEARCH_PATH_REMAINS:%', v_bad;
  end if;
end;
$$;

-- The intended authenticated surface remains callable while helpers remain private.
do $$
begin
  if not has_function_privilege('authenticated', 'public.cv_engine_export_account()', 'EXECUTE') then
    raise exception 'B8_EXPORT_RPC_NOT_GRANTED';
  end if;
  if not has_function_privilege('authenticated', 'public.cv_engine_delete_account()', 'EXECUTE') then
    raise exception 'B8_DELETE_RPC_NOT_GRANTED';
  end if;
  if not has_function_privilege('authenticated', 'public.cv_engine_create_presentation_plan(text,uuid,uuid,uuid,jsonb,jsonb,jsonb,text)', 'EXECUTE') then
    raise exception 'B8_P1_PLAN_RPC_NOT_GRANTED';
  end if;
  if not has_function_privilege('authenticated', 'public.cv_engine_create_presentation_revision(uuid,text,jsonb,text,text[],text)', 'EXECUTE') then
    raise exception 'B8_P1_REVISION_RPC_NOT_GRANTED';
  end if;
  if not has_function_privilege('authenticated', 'public.cv_engine_approve_presentation_revision(uuid)', 'EXECUTE') then
    raise exception 'B8_P1_APPROVAL_RPC_NOT_GRANTED';
  end if;
  if has_function_privilege('authenticated', 'public.cv_engine_sha256(text)', 'EXECUTE') then
    raise exception 'B8_INTERNAL_HELPER_EXPOSED';
  end if;
  if has_function_privilege('authenticated', 'public.cv_engine_p1_normalize(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.cv_engine_p1_quantitative_tokens(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.cv_engine_p1_has_term(text,text)', 'EXECUTE') then
    raise exception 'B8_P1_INTERNAL_HELPER_EXPOSED';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000808', false);

-- Seed owner-bound durable truth through the same public RPC used by the app.
select evidence_id from public.cv_engine_create_career_evidence(
  'PROJECT', 'MANUAL', 'VERIFIED', 'B8 lifecycle export evidence', null
) \gset b8_ev_;

-- P1 must participate in the same export/delete lifecycle as the older durable core.
select * from public.cv_engine_create_presentation_plan(
  'GENERAL', null, null, null,
  jsonb_build_array(jsonb_build_object('evidenceId', :'b8_ev_evidence_id', 'evidenceRevision', 1)),
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'sectionKey','experience','ordinal',1,
      'evidenceRefs',jsonb_build_array(jsonb_build_object('evidenceId', :'b8_ev_evidence_id', 'evidenceRevision', 1))
    )
  )
) \gset b8_plan_;
select * from public.cv_engine_create_presentation_revision(
  :'b8_plan_presentation_plan_id'::uuid,
  'CLAIM',
  jsonb_build_array(jsonb_build_object('evidenceId', :'b8_ev_evidence_id', 'evidenceRevision', 1)),
  'B8 lifecycle export evidence',
  '{}'::text[],
  'DETERMINISTIC'
) \gset b8_revision_;
select * from public.cv_engine_approve_presentation_revision(:'b8_revision_presentation_revision_id'::uuid);

create temp table b8_export_receipt(payload jsonb) on commit preserve rows;
insert into b8_export_receipt(payload) select public.cv_engine_export_account();

do $$
declare
  v_payload jsonb;
begin
  select payload into v_payload from b8_export_receipt limit 1;
  if v_payload->>'schemaVersion' <> 'p1-account-export-v2' then
    raise exception 'B8_EXPORT_VERSION_MISMATCH';
  end if;
  if v_payload->>'ownerUserId' <> '00000000-0000-4000-8000-000000000808' then
    raise exception 'B8_EXPORT_OWNER_MISMATCH';
  end if;
  if jsonb_array_length(v_payload->'careerEvidence') <> 1 then
    raise exception 'B8_EXPORT_EVIDENCE_MISSING';
  end if;
  if (v_payload->'careerEvidenceRevisions'->0->>'canonical_text') <> 'B8 lifecycle export evidence' then
    raise exception 'B8_EXPORT_REVISION_TEXT_MISMATCH';
  end if;
  if jsonb_array_length(v_payload->'presentationPlans') <> 1 then
    raise exception 'B8_EXPORT_P1_PLAN_MISSING';
  end if;
  if jsonb_array_length(v_payload->'presentationPlanEvidence') <> 1 then
    raise exception 'B8_EXPORT_P1_PLAN_EVIDENCE_MISSING';
  end if;
  if jsonb_array_length(v_payload->'presentationRevisions') <> 1 then
    raise exception 'B8_EXPORT_P1_REVISION_MISSING';
  end if;
  if jsonb_array_length(v_payload->'presentationRevisionEvidence') <> 1 then
    raise exception 'B8_EXPORT_P1_REVISION_EVIDENCE_MISSING';
  end if;
end;
$$;

select public.cv_engine_delete_account();
reset role;

-- Account deletion must remove auth identity and every durable owner row, including P1.
do $$
declare
  v_owner uuid := '00000000-0000-4000-8000-000000000808';
  v_remaining integer;
begin
  if exists (select 1 from auth.users where id = v_owner) then
    raise exception 'B8_AUTH_USER_NOT_DELETED';
  end if;

  select
    (select count(*) from public.career_vaults where owner_user_id=v_owner) +
    (select count(*) from public.career_evidence where owner_user_id=v_owner) +
    (select count(*) from public.career_evidence_revisions where owner_user_id=v_owner) +
    (select count(*) from public.consent_receipts where owner_user_id=v_owner) +
    (select count(*) from public.career_targets where owner_user_id=v_owner) +
    (select count(*) from public.job_snapshots where owner_user_id=v_owner) +
    (select count(*) from public.job_requirements where owner_user_id=v_owner) +
    (select count(*) from public.match_reports where owner_user_id=v_owner) +
    (select count(*) from public.requirement_matches where owner_user_id=v_owner) +
    (select count(*) from public.opportunity_assessments where owner_user_id=v_owner) +
    (select count(*) from public.resume_versions where owner_user_id=v_owner) +
    (select count(*) from public.resume_claims where owner_user_id=v_owner) +
    (select count(*) from public.import_receipts where owner_user_id=v_owner) +
    (select count(*) from public.import_proposals where owner_user_id=v_owner) +
    (select count(*) from public.market_observations where owner_user_id=v_owner) +
    (select count(*) from public.opportunity_space_items where owner_user_id=v_owner) +
    (select count(*) from public.presentation_plans where owner_user_id=v_owner) +
    (select count(*) from public.presentation_plan_evidence where owner_user_id=v_owner) +
    (select count(*) from public.presentation_revisions where owner_user_id=v_owner) +
    (select count(*) from public.presentation_revision_evidence where owner_user_id=v_owner)
  into v_remaining;

  if v_remaining <> 0 then
    raise exception 'B8_OWNER_ROWS_REMAIN:%', v_remaining;
  end if;
end;
$$;
