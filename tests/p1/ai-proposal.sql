\set ON_ERROR_STOP on

-- Seed trusted candidate truth and a presentation plan through authenticated public RPCs.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';

select evidence_id from public.cv_engine_create_career_evidence(
  'PROJECT','MANUAL','VERIFIED','Built Java and Spring Boot REST APIs for internal systems.',null
) \gset ai_ev_

select * from public.cv_engine_create_presentation_plan(
  'GENERAL',null,null,null,
  jsonb_build_array(jsonb_build_object('evidenceId', :'ai_ev_evidence_id', 'evidenceRevision', 1)),
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'sectionKey','experience','ordinal',1,
      'evidenceRefs',jsonb_build_array(jsonb_build_object('evidenceId', :'ai_ev_evidence_id', 'evidenceRevision', 1))
    )
  )
) \gset ai_plan_

select set_config('p1.ai_ev_id', :'ai_ev_evidence_id', false);
select set_config('p1.ai_plan_id', :'ai_plan_presentation_plan_id', false);

-- The normal authenticated RPC must still refuse AI provenance supplied by a client.
do $$
begin
  begin
    perform * from public.cv_engine_create_presentation_revision(
      current_setting('p1.ai_plan_id')::uuid,
      'CLAIM',
      jsonb_build_array(jsonb_build_object('evidenceId', current_setting('p1.ai_ev_id'), 'evidenceRevision', 1)),
      'Built REST APIs with Java and Spring Boot for internal systems.',
      array['CLARITY'],
      'AI_PROPOSAL'
    );
    raise exception 'P1_AUTHENTICATED_AI_ORIGIN_WAS_ACCEPTED';
  exception when others then
    if sqlerrm <> 'P1_AI_PROPOSAL_REQUIRES_GATEWAY_PATH' then raise; end if;
  end;
end $$;

reset role;

-- ACL contract: AI proposal persistence is service-role-only.
do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.cv_engine_create_ai_presentation_revision(uuid,uuid,text,jsonb,text,text[],text,text,text,text,integer,boolean,text,uuid,text)',
    'EXECUTE'
  ) then raise exception 'P1_AI_RPC_EXPOSED_TO_AUTHENTICATED'; end if;

  if has_function_privilege(
    'anon',
    'public.cv_engine_create_ai_presentation_revision(uuid,uuid,text,jsonb,text,text[],text,text,text,text,integer,boolean,text,uuid,text)',
    'EXECUTE'
  ) then raise exception 'P1_AI_RPC_EXPOSED_TO_ANON'; end if;

  if not has_function_privilege(
    'service_role',
    'public.cv_engine_create_ai_presentation_revision(uuid,uuid,text,jsonb,text,text[],text,text,text,text,integer,boolean,text,uuid,text)',
    'EXECUTE'
  ) then raise exception 'P1_AI_RPC_NOT_GRANTED_TO_SERVICE_ROLE'; end if;
end $$;

-- Prepare the exact B6 result hash outside client roles; cv_engine_sha256 stays private.
select public.cv_engine_sha256('Built REST APIs with Java and Spring Boot for internal systems.') result_hash \gset ai_hash_
select set_config('p1.ai_result_hash', :'ai_hash_result_hash', false);

set role service_role;

select * from public.cv_engine_create_ai_presentation_revision(
  '00000000-0000-4000-8000-000000000101'::uuid,
  :'ai_plan_presentation_plan_id'::uuid,
  'CLAIM',
  jsonb_build_array(jsonb_build_object('evidenceId', :'ai_ev_evidence_id', 'evidenceRevision', 1)),
  'Built REST APIs with Java and Spring Boot for internal systems.',
  array['CLARITY','CONCISION','TERMINOLOGY_ALIGNMENT'],
  'gemini',
  'gemini-3.5-flash-lite',
  'INLINE_WORDING_OPTIMIZATION',
  'b6-ai-runtime-v1',
  1,
  false,
  'PLATFORM',
  '00000000-0000-4000-8000-000000000777'::uuid,
  :'ai_hash_result_hash'
) \gset ai_revision_

reset role;
select set_config('p1.ai_revision_id', :'ai_revision_presentation_revision_id', false);

-- Successful AI output is still only a proposal. It is never silently approved.
do $$
begin
  if not exists (
    select 1 from public.presentation_revisions
    where id=current_setting('p1.ai_revision_id')::uuid
      and owner_user_id='00000000-0000-4000-8000-000000000101'::uuid
      and origin='AI_PROPOSAL'
      and status='PROPOSED'
      and semantic_status='REVIEW_REQUIRED'
      and overall_status='REVIEW_REQUIRED'
      and approved_by_user_at is null
      and ai_provenance->>'provider'='gemini'
      and ai_provenance->>'model'='gemini-3.5-flash-lite'
      and ai_provenance->>'capability'='INLINE_WORDING_OPTIMIZATION'
      and ai_provenance->>'contractVersion'='b6-ai-runtime-v1'
      and ai_provenance->>'credentialMode'='PLATFORM'
      and ai_provenance->>'requestId'='00000000-0000-4000-8000-000000000777'
      and ai_provenance->>'resultSha256'=current_setting('p1.ai_result_hash')
  ) then raise exception 'P1_AI_PROPOSAL_PROVENANCE_OR_STATE_INVALID'; end if;
end $$;

-- A service-role caller cannot lie about the result hash.
set role service_role;
do $$
begin
  begin
    perform * from public.cv_engine_create_ai_presentation_revision(
      '00000000-0000-4000-8000-000000000101'::uuid,
      current_setting('p1.ai_plan_id')::uuid,
      'CLAIM',
      jsonb_build_array(jsonb_build_object('evidenceId', current_setting('p1.ai_ev_id'), 'evidenceRevision', 1)),
      'Built REST APIs with Java and Spring Boot for internal systems.',
      array['CLARITY'],
      'gemini','gemini-3.5-flash-lite','INLINE_WORDING_OPTIMIZATION','b6-ai-runtime-v1',1,false,'PLATFORM',
      '00000000-0000-4000-8000-000000000778'::uuid,
      repeat('a',64)
    );
    raise exception 'P1_AI_BAD_RESULT_HASH_ACCEPTED';
  exception when others then
    if sqlerrm <> 'P1_AI_RESULT_HASH_MISMATCH' then raise; end if;
  end;
end $$;
reset role;

-- Even the trusted AI persistence lane cannot introduce an unsupported metric.
select public.cv_engine_sha256('Reduced API latency by 35%.') metric_hash \gset ai_metric_hash_
select set_config('p1.ai_metric_hash', :'ai_metric_hash_metric_hash', false);
set role service_role;
do $$
begin
  begin
    perform * from public.cv_engine_create_ai_presentation_revision(
      '00000000-0000-4000-8000-000000000101'::uuid,
      current_setting('p1.ai_plan_id')::uuid,
      'CLAIM',
      jsonb_build_array(jsonb_build_object('evidenceId', current_setting('p1.ai_ev_id'), 'evidenceRevision', 1)),
      'Reduced API latency by 35%.',
      array['CLARITY'],
      'gemini','gemini-3.5-flash-lite','INLINE_WORDING_OPTIMIZATION','b6-ai-runtime-v1',1,false,'PLATFORM',
      '00000000-0000-4000-8000-000000000779'::uuid,
      current_setting('p1.ai_metric_hash')
    );
    raise exception 'P1_AI_UNSUPPORTED_METRIC_ACCEPTED';
  exception when others then
    if sqlerrm <> 'P1_UNSUPPORTED_QUANTITATIVE_TOKEN:35%' then raise; end if;
  end;
end $$;
reset role;

-- Unsupported leadership/seniority strengthening remains fail-closed on the AI lane too.
select public.cv_engine_sha256('Led and architected Java APIs as a senior engineer.') strengthen_hash \gset ai_strengthen_hash_
select set_config('p1.ai_strengthen_hash', :'ai_strengthen_hash_strengthen_hash', false);
set role service_role;
do $$
begin
  begin
    perform * from public.cv_engine_create_ai_presentation_revision(
      '00000000-0000-4000-8000-000000000101'::uuid,
      current_setting('p1.ai_plan_id')::uuid,
      'CLAIM',
      jsonb_build_array(jsonb_build_object('evidenceId', current_setting('p1.ai_ev_id'), 'evidenceRevision', 1)),
      'Led and architected Java APIs as a senior engineer.',
      array['CLARITY'],
      'ollama','cv-engine-optimize','INLINE_WORDING_OPTIMIZATION','b6-ai-runtime-v1',1,true,'LOCAL_ONLY',
      '00000000-0000-4000-8000-000000000780'::uuid,
      current_setting('p1.ai_strengthen_hash')
    );
    raise exception 'P1_AI_UNSUPPORTED_STRENGTHENING_ACCEPTED';
  exception when others then
    if sqlerrm not in (
      'P1_UNSUPPORTED_STRENGTHENING:led',
      'P1_UNSUPPORTED_STRENGTHENING:architected',
      'P1_UNSUPPORTED_STRENGTHENING:senior'
    ) then raise; end if;
  end;
end $$;
reset role;

-- Explicit user approval remains the only path from proposal to approved presentation.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';
select * from public.cv_engine_approve_presentation_revision(:'ai_revision_presentation_revision_id'::uuid);
reset role;

do $$
begin
  if not exists (
    select 1 from public.presentation_revisions
    where id=current_setting('p1.ai_revision_id')::uuid
      and status='APPROVED'
      and semantic_status='MANUAL_EVIDENCE_REVIEW_PASS'
      and approved_by_user_at is not null
      and origin='AI_PROPOSAL'
  ) then raise exception 'P1_AI_EXPLICIT_USER_APPROVAL_FAILED'; end if;
end $$;

select 'P1_AI_PROPOSAL_GATE_PASS' as result;
