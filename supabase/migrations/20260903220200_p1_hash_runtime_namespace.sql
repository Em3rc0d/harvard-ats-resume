begin;

create or replace function public.cv_engine_create_presentation_plan(
  p_mode text,
  p_career_target_id uuid,
  p_job_snapshot_id uuid,
  p_opportunity_assessment_id uuid,
  p_selected_evidence_refs jsonb,
  p_excluded_evidence_refs jsonb,
  p_sections jsonb,
  p_renderer_profile text default 'ATS_SINGLE_COLUMN_V1'
)
returns table (presentation_plan_id uuid, plan_sha256 text)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_plan_id uuid := gen_random_uuid();
  v_plan_sha text;
  v_ref jsonb;
  v_section jsonb;
  v_section_ref jsonb;
  v_ordinal integer := 0;
  v_evidence_id uuid;
  v_evidence_revision integer;
  v_evidence_text text;
  v_verification text;
  v_assessment_job_id uuid;
  v_identity text;
  v_selected_keys text[] := '{}';
  v_excluded_keys text[] := '{}';
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if p_mode not in ('GENERAL','TARGETED') then raise exception 'P1_INVALID_MODE' using errcode = '22023'; end if;
  if p_renderer_profile <> 'ATS_SINGLE_COLUMN_V1' then raise exception 'P1_INVALID_RENDERER_PROFILE' using errcode = '22023'; end if;
  if jsonb_typeof(p_selected_evidence_refs) <> 'array' or jsonb_array_length(p_selected_evidence_refs) = 0 then raise exception 'P1_SELECTED_EVIDENCE_REQUIRED' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_excluded_evidence_refs,'[]'::jsonb)) <> 'array' then raise exception 'P1_EXCLUDED_EVIDENCE_INVALID' using errcode = '22023'; end if;
  if jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then raise exception 'P1_SECTIONS_REQUIRED' using errcode = '22023'; end if;

  if p_career_target_id is not null and not exists(select 1 from public.career_targets where id=p_career_target_id and owner_user_id=v_owner) then
    raise exception 'P1_CAREER_TARGET_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_mode = 'GENERAL' then
    if p_job_snapshot_id is not null or p_opportunity_assessment_id is not null then raise exception 'P1_GENERAL_CONTEXT_CANNOT_BIND_JOB' using errcode = '23514'; end if;
  else
    select job_snapshot_id into v_assessment_job_id from public.opportunity_assessments
      where id=p_opportunity_assessment_id and owner_user_id=v_owner;
    if v_assessment_job_id is null then raise exception 'P1_ASSESSMENT_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_assessment_job_id is distinct from p_job_snapshot_id then raise exception 'P1_ASSESSMENT_JOB_MISMATCH' using errcode = '23514'; end if;
    if not exists(select 1 from public.job_snapshots where id=p_job_snapshot_id and owner_user_id=v_owner) then raise exception 'P1_JOB_NOT_FOUND' using errcode = 'P0002'; end if;
  end if;

  for v_ref in select value from jsonb_array_elements(p_selected_evidence_refs) loop
    v_evidence_id := (v_ref->>'evidenceId')::uuid;
    v_evidence_revision := (v_ref->>'evidenceRevision')::integer;
    v_identity := v_evidence_id::text || ':' || v_evidence_revision::text;
    if v_identity = any(v_selected_keys) then raise exception 'P1_DUPLICATE_SELECTED_EVIDENCE' using errcode = '23514'; end if;
    v_selected_keys := array_append(v_selected_keys, v_identity);
    select r.canonical_text, r.verification_status into v_evidence_text, v_verification
    from public.career_evidence_revisions r
    where r.evidence_id=v_evidence_id and r.revision_number=v_evidence_revision and r.owner_user_id=v_owner;
    if v_evidence_text is null then raise exception 'P1_EVIDENCE_REVISION_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_verification <> 'VERIFIED' then raise exception 'P1_SELECTED_EVIDENCE_NOT_VERIFIED' using errcode = '23514'; end if;
  end loop;

  for v_ref in select value from jsonb_array_elements(coalesce(p_excluded_evidence_refs,'[]'::jsonb)) loop
    v_evidence_id := (v_ref->>'evidenceId')::uuid;
    v_evidence_revision := (v_ref->>'evidenceRevision')::integer;
    v_identity := v_evidence_id::text || ':' || v_evidence_revision::text;
    if v_identity = any(v_selected_keys) then raise exception 'P1_EVIDENCE_SELECTED_AND_EXCLUDED' using errcode = '23514'; end if;
    if v_identity = any(v_excluded_keys) then raise exception 'P1_DUPLICATE_EXCLUDED_EVIDENCE' using errcode = '23514'; end if;
    v_excluded_keys := array_append(v_excluded_keys, v_identity);
    if not exists(select 1 from public.career_evidence_revisions where evidence_id=v_evidence_id and revision_number=v_evidence_revision and owner_user_id=v_owner) then raise exception 'P1_EXCLUDED_EVIDENCE_NOT_FOUND' using errcode = 'P0002'; end if;
  end loop;

  for v_section in select value from jsonb_array_elements(p_sections) loop
    if jsonb_typeof(v_section->'evidenceRefs') <> 'array' or jsonb_array_length(v_section->'evidenceRefs') = 0 then raise exception 'P1_SECTION_EVIDENCE_REQUIRED' using errcode = '23514'; end if;
    for v_section_ref in select value from jsonb_array_elements(v_section->'evidenceRefs') loop
      v_identity := (v_section_ref->>'evidenceId') || ':' || (v_section_ref->>'evidenceRevision');
      if not (v_identity = any(v_selected_keys)) then raise exception 'P1_SECTION_REFERENCES_UNSELECTED_EVIDENCE' using errcode = '23514'; end if;
    end loop;
  end loop;

  v_plan_sha := public.cv_engine_sha256(
    p_mode || chr(31) || coalesce(p_career_target_id::text,'') || chr(31) || coalesce(p_job_snapshot_id::text,'') || chr(31) ||
    coalesce(p_opportunity_assessment_id::text,'') || chr(31) || p_renderer_profile || chr(31) ||
    p_selected_evidence_refs::text || chr(31) || coalesce(p_excluded_evidence_refs,'[]'::jsonb)::text || chr(31) || p_sections::text
  );

  insert into public.presentation_plans(id,owner_user_id,mode,career_target_id,job_snapshot_id,opportunity_assessment_id,renderer_profile,selected_evidence_refs,excluded_evidence_refs,sections,plan_sha256)
  values(v_plan_id,v_owner,p_mode,p_career_target_id,p_job_snapshot_id,p_opportunity_assessment_id,p_renderer_profile,p_selected_evidence_refs,coalesce(p_excluded_evidence_refs,'[]'::jsonb),p_sections,v_plan_sha);

  v_ordinal := 0;
  for v_ref in select value from jsonb_array_elements(p_selected_evidence_refs) loop
    insert into public.presentation_plan_evidence(plan_id,owner_user_id,selection,ordinal,evidence_id,evidence_revision,evidence_text_sha256)
    select v_plan_id,v_owner,'SELECTED',v_ordinal,(v_ref->>'evidenceId')::uuid,(v_ref->>'evidenceRevision')::integer,
      public.cv_engine_sha256(r.canonical_text)
    from public.career_evidence_revisions r
    where r.evidence_id=(v_ref->>'evidenceId')::uuid and r.revision_number=(v_ref->>'evidenceRevision')::integer and r.owner_user_id=v_owner;
    v_ordinal := v_ordinal + 1;
  end loop;

  v_ordinal := 0;
  for v_ref in select value from jsonb_array_elements(coalesce(p_excluded_evidence_refs,'[]'::jsonb)) loop
    insert into public.presentation_plan_evidence(plan_id,owner_user_id,selection,ordinal,evidence_id,evidence_revision,evidence_text_sha256)
    select v_plan_id,v_owner,'EXCLUDED',v_ordinal,(v_ref->>'evidenceId')::uuid,(v_ref->>'evidenceRevision')::integer,
      public.cv_engine_sha256(r.canonical_text)
    from public.career_evidence_revisions r
    where r.evidence_id=(v_ref->>'evidenceId')::uuid and r.revision_number=(v_ref->>'evidenceRevision')::integer and r.owner_user_id=v_owner;
    v_ordinal := v_ordinal + 1;
  end loop;

  presentation_plan_id := v_plan_id; plan_sha256 := v_plan_sha; return next;
end;
$$;

create or replace function public.cv_engine_create_presentation_revision(
  p_plan_id uuid,
  p_purpose text,
  p_source_evidence_refs jsonb,
  p_proposed_text text,
  p_transformation_types text[],
  p_origin text default 'USER_EDIT'
)
returns table (presentation_revision_id uuid, review_status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_revision_id uuid := gen_random_uuid();
  v_plan public.presentation_plans%rowtype;
  v_ref jsonb;
  v_ordinal integer := 0;
  v_evidence_id uuid;
  v_evidence_revision integer;
  v_text text;
  v_kind text;
  v_verification text;
  v_source_text text := '';
  v_source_hash text;
  v_proposed_hash text;
  v_exact boolean;
  v_token text;
  v_term text;
  v_findings jsonb := '[]'::jsonb;
  v_semantic text;
  v_overall text;
  v_refs text[] := '{}';
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if p_purpose not in ('CLAIM','SUMMARY','SECTION_HEADING') then raise exception 'P1_INVALID_PURPOSE' using errcode = '22023'; end if;
  if p_origin not in ('DETERMINISTIC','USER_EDIT') then raise exception 'P1_AI_PROPOSAL_REQUIRES_GATEWAY_PATH' using errcode = '23514'; end if;
  if char_length(btrim(coalesce(p_proposed_text,''))) = 0 then raise exception 'P1_PROPOSED_TEXT_REQUIRED' using errcode = '22023'; end if;
  if jsonb_typeof(p_source_evidence_refs) <> 'array' or jsonb_array_length(p_source_evidence_refs) = 0 then raise exception 'P1_SOURCE_EVIDENCE_REQUIRED' using errcode = '22023'; end if;

  select * into v_plan from public.presentation_plans where id=p_plan_id and owner_user_id=v_owner;
  if v_plan.id is null then raise exception 'P1_PLAN_NOT_FOUND' using errcode = 'P0002'; end if;

  for v_ref in select value from jsonb_array_elements(p_source_evidence_refs) loop
    v_evidence_id := (v_ref->>'evidenceId')::uuid;
    v_evidence_revision := (v_ref->>'evidenceRevision')::integer;
    if (v_evidence_id::text || ':' || v_evidence_revision::text) = any(v_refs) then raise exception 'P1_DUPLICATE_REVISION_EVIDENCE' using errcode = '23514'; end if;
    v_refs := array_append(v_refs, v_evidence_id::text || ':' || v_evidence_revision::text);
    if not exists(select 1 from public.presentation_plan_evidence where plan_id=p_plan_id and owner_user_id=v_owner and selection='SELECTED' and evidence_id=v_evidence_id and evidence_revision=v_evidence_revision) then
      raise exception 'P1_REVISION_EVIDENCE_NOT_SELECTED' using errcode = '23514';
    end if;
    select r.canonical_text,r.verification_status,e.kind into v_text,v_verification,v_kind
    from public.career_evidence_revisions r join public.career_evidence e on e.id=r.evidence_id and e.owner_user_id=r.owner_user_id
    where r.evidence_id=v_evidence_id and r.revision_number=v_evidence_revision and r.owner_user_id=v_owner;
    if v_text is null then raise exception 'P1_EVIDENCE_REVISION_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_verification <> 'VERIFIED' then raise exception 'P1_REVISION_EVIDENCE_NOT_VERIFIED' using errcode = '23514'; end if;
    if v_source_text <> '' then v_source_text := v_source_text || E'\n'; end if;
    v_source_text := v_source_text || v_text;
  end loop;

  foreach v_token in array public.cv_engine_p1_quantitative_tokens(p_proposed_text) loop
    if not (v_token = any(public.cv_engine_p1_quantitative_tokens(v_source_text))) then
      raise exception 'P1_UNSUPPORTED_QUANTITATIVE_TOKEN:%', v_token using errcode = '23514';
    end if;
  end loop;

  foreach v_term in array array['led','owned','spearheaded','architected','managed','mentored','expert','senior','principal','director','head of','drove','increased','reduced','grew','best','top','leading','world-class','exceptional','industry-leading'] loop
    if public.cv_engine_p1_has_term(p_proposed_text,v_term) and not public.cv_engine_p1_has_term(v_source_text,v_term) then
      raise exception 'P1_UNSUPPORTED_STRENGTHENING:%', v_term using errcode = '23514';
    end if;
  end loop;

  if v_plan.mode='TARGETED' then
    for v_term in select canonical_concept from public.job_requirements
      where snapshot_id=v_plan.job_snapshot_id and owner_user_id=v_owner
        and category in ('HARD_SKILL','TOOL','CERTIFICATION','SENIORITY','LANGUAGE','DOMAIN')
    loop
      if char_length(btrim(v_term)) <= 120 and public.cv_engine_p1_has_term(p_proposed_text,v_term) and not public.cv_engine_p1_has_term(v_source_text,v_term) then
        raise exception 'P1_MARKET_TERM_PROMOTED_TO_CANDIDATE:%', v_term using errcode = '23514';
      end if;
    end loop;
  end if;

  v_source_hash := public.cv_engine_sha256(v_source_text);
  v_proposed_hash := public.cv_engine_sha256(btrim(p_proposed_text));
  v_exact := public.cv_engine_p1_normalize(v_source_text) = public.cv_engine_p1_normalize(p_proposed_text);
  v_semantic := case when v_exact then 'SOURCE_EXACT' else 'REVIEW_REQUIRED' end;
  v_overall := case when v_exact then 'ACCEPTED' else 'REVIEW_REQUIRED' end;

  insert into public.presentation_revisions(id,owner_user_id,plan_id,status,purpose,source_text,proposed_text,transformation_types,origin,ai_provenance,deterministic_status,semantic_status,overall_status,validation_findings,source_sha256,proposed_sha256)
  values(v_revision_id,v_owner,p_plan_id,'PROPOSED',p_purpose,v_source_text,btrim(p_proposed_text),coalesce(p_transformation_types,'{}'),p_origin,null,'PASS',v_semantic,v_overall,v_findings,v_source_hash,v_proposed_hash);

  v_ordinal := 0;
  for v_ref in select value from jsonb_array_elements(p_source_evidence_refs) loop
    insert into public.presentation_revision_evidence(presentation_revision_id,owner_user_id,ordinal,evidence_id,evidence_revision,evidence_kind,evidence_canonical_text,evidence_text_sha256)
    select v_revision_id,v_owner,v_ordinal,e.id,r.revision_number,e.kind,r.canonical_text,public.cv_engine_sha256(r.canonical_text)
    from public.career_evidence e join public.career_evidence_revisions r on r.evidence_id=e.id and r.owner_user_id=e.owner_user_id
    where e.id=(v_ref->>'evidenceId')::uuid and r.revision_number=(v_ref->>'evidenceRevision')::integer and e.owner_user_id=v_owner;
    v_ordinal := v_ordinal + 1;
  end loop;

  presentation_revision_id := v_revision_id; review_status := v_overall; return next;
end;
$$;

commit;
