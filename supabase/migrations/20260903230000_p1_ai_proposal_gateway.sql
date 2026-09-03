begin;

create or replace function public.cv_engine_create_ai_presentation_revision(
  p_owner_user_id uuid,
  p_plan_id uuid,
  p_purpose text,
  p_source_evidence_refs jsonb,
  p_proposed_text text,
  p_transformation_types text[],
  p_provider text,
  p_model text,
  p_capability text,
  p_contract_version text,
  p_attempt integer,
  p_fallback_used boolean,
  p_credential_mode text,
  p_request_id uuid,
  p_result_sha256 text
)
returns table (presentation_revision_id uuid, review_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := p_owner_user_id;
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
  v_semantic text;
  v_overall text;
  v_refs text[] := '{}';
  v_ai_provenance jsonb;
begin
  if v_owner is null or not exists(select 1 from auth.users where id=v_owner) then
    raise exception 'P1_AI_OWNER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_purpose not in ('CLAIM','SUMMARY') then
    raise exception 'P1_AI_INVALID_PURPOSE' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_proposed_text,''))) = 0 then
    raise exception 'P1_PROPOSED_TEXT_REQUIRED' using errcode = '22023';
  end if;
  if jsonb_typeof(p_source_evidence_refs) <> 'array' or jsonb_array_length(p_source_evidence_refs) = 0 then
    raise exception 'P1_SOURCE_EVIDENCE_REQUIRED' using errcode = '22023';
  end if;

  if p_provider not in ('gemini','ollama') then
    raise exception 'P1_AI_PROVIDER_INVALID' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_model,''))) = 0 or char_length(p_model) > 200 then
    raise exception 'P1_AI_MODEL_INVALID' using errcode = '22023';
  end if;
  if p_capability <> 'INLINE_WORDING_OPTIMIZATION' then
    raise exception 'P1_AI_CAPABILITY_INVALID' using errcode = '23514';
  end if;
  if p_contract_version <> 'b6-ai-runtime-v1' then
    raise exception 'P1_AI_CONTRACT_VERSION_INVALID' using errcode = '23514';
  end if;
  if p_attempt < 1 or p_attempt > 3 then
    raise exception 'P1_AI_ATTEMPT_INVALID' using errcode = '22023';
  end if;
  if p_credential_mode not in ('PLATFORM_KEY','BYOK_REQUEST_SCOPED','NO_CLOUD_AI') then
    raise exception 'P1_AI_CREDENTIAL_MODE_INVALID' using errcode = '22023';
  end if;
  if p_provider='gemini' and p_credential_mode='NO_CLOUD_AI' then
    raise exception 'P1_AI_GEMINI_CANNOT_USE_NO_CLOUD_MODE' using errcode = '23514';
  end if;
  if p_result_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'P1_AI_RESULT_HASH_INVALID' using errcode = '22023';
  end if;
  if p_result_sha256 <> public.cv_engine_sha256(btrim(p_proposed_text)) then
    raise exception 'P1_AI_RESULT_HASH_MISMATCH' using errcode = '23514';
  end if;

  select * into v_plan
  from public.presentation_plans
  where id=p_plan_id and owner_user_id=v_owner;
  if v_plan.id is null then
    raise exception 'P1_PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;

  for v_ref in select value from jsonb_array_elements(p_source_evidence_refs) loop
    v_evidence_id := (v_ref->>'evidenceId')::uuid;
    v_evidence_revision := (v_ref->>'evidenceRevision')::integer;

    if (v_evidence_id::text || ':' || v_evidence_revision::text) = any(v_refs) then
      raise exception 'P1_DUPLICATE_REVISION_EVIDENCE' using errcode = '23514';
    end if;
    v_refs := array_append(v_refs, v_evidence_id::text || ':' || v_evidence_revision::text);

    if not exists(
      select 1 from public.presentation_plan_evidence
      where plan_id=p_plan_id
        and owner_user_id=v_owner
        and selection='SELECTED'
        and evidence_id=v_evidence_id
        and evidence_revision=v_evidence_revision
    ) then
      raise exception 'P1_REVISION_EVIDENCE_NOT_SELECTED' using errcode = '23514';
    end if;

    select r.canonical_text,r.verification_status,e.kind
      into v_text,v_verification,v_kind
    from public.career_evidence_revisions r
    join public.career_evidence e
      on e.id=r.evidence_id and e.owner_user_id=r.owner_user_id
    where r.evidence_id=v_evidence_id
      and r.revision_number=v_evidence_revision
      and r.owner_user_id=v_owner;

    if v_text is null then
      raise exception 'P1_EVIDENCE_REVISION_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_verification <> 'VERIFIED' then
      raise exception 'P1_REVISION_EVIDENCE_NOT_VERIFIED' using errcode = '23514';
    end if;

    if v_source_text <> '' then v_source_text := v_source_text || E'\n'; end if;
    v_source_text := v_source_text || v_text;
  end loop;

  foreach v_token in array public.cv_engine_p1_quantitative_tokens(p_proposed_text) loop
    if not (v_token = any(public.cv_engine_p1_quantitative_tokens(v_source_text))) then
      raise exception 'P1_UNSUPPORTED_QUANTITATIVE_TOKEN:%', v_token using errcode = '23514';
    end if;
  end loop;

  foreach v_term in array array[
    'led','owned','spearheaded','architected','managed','mentored','expert','senior',
    'principal','director','head of','drove','increased','reduced','grew','best','top',
    'leading','world-class','exceptional','industry-leading'
  ] loop
    if public.cv_engine_p1_has_term(p_proposed_text,v_term)
       and not public.cv_engine_p1_has_term(v_source_text,v_term) then
      raise exception 'P1_UNSUPPORTED_STRENGTHENING:%', v_term using errcode = '23514';
    end if;
  end loop;

  if v_plan.mode='TARGETED' then
    foreach v_term in array public.cv_engine_p1_market_only_tokens(v_plan.job_snapshot_id, v_owner) loop
      if public.cv_engine_p1_has_term(p_proposed_text,v_term)
         and not public.cv_engine_p1_has_term(v_source_text,v_term) then
        raise exception 'P1_MARKET_TERM_PROMOTED_TO_CANDIDATE:%', v_term using errcode = '23514';
      end if;
    end loop;
  end if;

  v_source_hash := public.cv_engine_sha256(v_source_text);
  v_proposed_hash := public.cv_engine_sha256(btrim(p_proposed_text));
  v_exact := public.cv_engine_p1_normalize(v_source_text) = public.cv_engine_p1_normalize(p_proposed_text);
  v_semantic := case when v_exact then 'SOURCE_EXACT' else 'REVIEW_REQUIRED' end;
  v_overall := case when v_exact then 'ACCEPTED' else 'REVIEW_REQUIRED' end;

  v_ai_provenance := jsonb_build_object(
    'provider',p_provider,
    'model',p_model,
    'capability',p_capability,
    'contractVersion',p_contract_version,
    'attempt',p_attempt,
    'fallbackUsed',p_fallback_used,
    'credentialMode',p_credential_mode,
    'requestId',p_request_id,
    'resultSha256',p_result_sha256
  );

  insert into public.presentation_revisions(
    id,owner_user_id,plan_id,status,purpose,source_text,proposed_text,
    transformation_types,origin,ai_provenance,deterministic_status,semantic_status,
    overall_status,validation_findings,source_sha256,proposed_sha256
  ) values (
    v_revision_id,v_owner,p_plan_id,'PROPOSED',p_purpose,v_source_text,btrim(p_proposed_text),
    coalesce(p_transformation_types,'{}'),'AI_PROPOSAL',v_ai_provenance,'PASS',v_semantic,
    v_overall,'[]'::jsonb,v_source_hash,v_proposed_hash
  );

  v_ordinal := 0;
  for v_ref in select value from jsonb_array_elements(p_source_evidence_refs) loop
    insert into public.presentation_revision_evidence(
      presentation_revision_id,owner_user_id,ordinal,evidence_id,evidence_revision,
      evidence_kind,evidence_canonical_text,evidence_text_sha256
    )
    select v_revision_id,v_owner,v_ordinal,e.id,r.revision_number,e.kind,r.canonical_text,
      public.cv_engine_sha256(r.canonical_text)
    from public.career_evidence e
    join public.career_evidence_revisions r
      on r.evidence_id=e.id and r.owner_user_id=e.owner_user_id
    where e.id=(v_ref->>'evidenceId')::uuid
      and r.revision_number=(v_ref->>'evidenceRevision')::integer
      and e.owner_user_id=v_owner;
    v_ordinal := v_ordinal + 1;
  end loop;

  presentation_revision_id := v_revision_id;
  review_status := v_overall;
  return next;
end;
$$;

revoke all on function public.cv_engine_create_ai_presentation_revision(
  uuid,uuid,text,jsonb,text,text[],text,text,text,text,integer,boolean,text,uuid,text
) from public, anon, authenticated;
grant execute on function public.cv_engine_create_ai_presentation_revision(
  uuid,uuid,text,jsonb,text,text[],text,text,text,text,integer,boolean,text,uuid,text
) to service_role;

commit;
