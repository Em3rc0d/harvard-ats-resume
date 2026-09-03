begin;

create or replace function public.cv_engine_p1_normalize(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(
    regexp_replace(
      regexp_replace(btrim(coalesce(p_value, '')), '[^[:alnum:]+#./]+', ' ', 'g'),
      '\s+', ' ', 'g'
    )
  );
$$;

create or replace function public.cv_engine_p1_market_only_tokens(p_job_snapshot_id uuid, p_owner uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct token order by token), '{}'::text[])
  from public.job_requirements requirement
  cross join lateral unnest(public.cv_engine_b3_tokens(requirement.canonical_concept)) token
  where requirement.snapshot_id = p_job_snapshot_id
    and requirement.owner_user_id = p_owner
    and requirement.category in ('HARD_SKILL','TOOL','CERTIFICATION','SENIORITY','LANGUAGE','DOMAIN');
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
    foreach v_term in array public.cv_engine_p1_market_only_tokens(v_plan.job_snapshot_id, v_owner) loop
      if public.cv_engine_p1_has_term(p_proposed_text,v_term) and not public.cv_engine_p1_has_term(v_source_text,v_term) then
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

-- New helper is internal only. Reassert ACLs after final function definitions.
revoke all on function public.cv_engine_p1_market_only_tokens(uuid,uuid) from public, anon, authenticated;
revoke all on function public.cv_engine_p1_normalize(text) from public, anon, authenticated;
revoke all on function public.cv_engine_create_presentation_revision(uuid,text,jsonb,text,text[],text) from public, anon;
grant execute on function public.cv_engine_create_presentation_revision(uuid,text,jsonb,text,text[],text) to authenticated;

commit;
