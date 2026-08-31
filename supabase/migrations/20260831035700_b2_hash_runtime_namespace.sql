begin;

-- Bind pgcrypto's digest OID while the migration session can resolve the installed
-- extension schema. SECURITY DEFINER functions can then keep an empty search_path.
create or replace function public.cv_engine_sha256(p_value text)
returns text
language sql
immutable
parallel safe
return encode(digest(p_value, 'sha256'), 'hex');

revoke all on function public.cv_engine_sha256(text) from public;

create or replace function public.cv_engine_create_job_snapshot(
  p_semantic_key text,
  p_role_title text,
  p_company text,
  p_raw_description text,
  p_raw_description_sha256 text,
  p_analyzer_version text,
  p_requirements jsonb
)
returns table (snapshot_id uuid, created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_snapshot_id uuid;
  v_created boolean := false;
  v_requirement jsonb;
  v_expected_requirement_key text;
  v_requirement_keys text := '';
  v_expected_snapshot_key text;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if jsonb_typeof(p_requirements) <> 'array' or jsonb_array_length(p_requirements) > 250 then
    raise exception 'JOB_REQUIREMENTS_INVALID' using errcode = '22023';
  end if;
  if p_raw_description_sha256 <> public.cv_engine_sha256(p_raw_description) then
    raise exception 'JOB_DESCRIPTION_HASH_MISMATCH' using errcode = '23514';
  end if;

  for v_requirement in select value from jsonb_array_elements(p_requirements) loop
    if position(v_requirement->>'sourceText' in p_raw_description) = 0 then
      raise exception 'JOB_REQUIREMENT_SOURCE_NOT_IN_DESCRIPTION' using errcode = '23514';
    end if;
    if (v_requirement->>'sourceTextSha256') <> public.cv_engine_sha256(v_requirement->>'sourceText') then
      raise exception 'JOB_REQUIREMENT_HASH_MISMATCH' using errcode = '23514';
    end if;
    v_expected_requirement_key := public.cv_engine_sha256(
      (v_requirement->>'category') || chr(31) ||
      (v_requirement->>'importance') || chr(31) ||
      lower(regexp_replace(btrim(v_requirement->>'canonicalConcept'), '\s+', ' ', 'g')) || chr(31) ||
      (v_requirement->>'sourceTextSha256') || chr(31) ||
      (v_requirement->>'sourceOrdinal')
    );
    if v_expected_requirement_key <> (v_requirement->>'semanticKey') then
      raise exception 'JOB_REQUIREMENT_SEMANTIC_KEY_MISMATCH' using errcode = '23514';
    end if;
    if v_requirement_keys <> '' then v_requirement_keys := v_requirement_keys || ','; end if;
    v_requirement_keys := v_requirement_keys || (v_requirement->>'semanticKey');
  end loop;

  v_expected_snapshot_key := public.cv_engine_sha256(
    'MANUAL_JOB_DESCRIPTION' || chr(31) ||
    lower(regexp_replace(btrim(p_role_title), '\s+', ' ', 'g')) || chr(31) ||
    case when p_company is null then '' else lower(regexp_replace(btrim(p_company), '\s+', ' ', 'g')) end || chr(31) ||
    p_raw_description_sha256 || chr(31) || p_analyzer_version || chr(31) || v_requirement_keys
  );
  if v_expected_snapshot_key <> p_semantic_key then
    raise exception 'JOB_SNAPSHOT_SEMANTIC_KEY_MISMATCH' using errcode = '23514';
  end if;

  insert into public.job_snapshots (
    owner_user_id, semantic_key, source, role_title, company,
    raw_description, raw_description_sha256, analyzer_version
  ) values (
    v_owner, p_semantic_key, 'MANUAL_JOB_DESCRIPTION', p_role_title, nullif(btrim(p_company), ''),
    p_raw_description, p_raw_description_sha256, p_analyzer_version
  ) on conflict (owner_user_id, semantic_key) do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is not null then
    v_created := true;
    for v_requirement in select value from jsonb_array_elements(p_requirements) loop
      insert into public.job_requirements (
        snapshot_id, owner_user_id, semantic_key, category, importance,
        canonical_concept, source_text, source_text_sha256, source_ordinal
      ) values (
        v_snapshot_id, v_owner, v_requirement->>'semanticKey', v_requirement->>'category',
        v_requirement->>'importance', v_requirement->>'canonicalConcept', v_requirement->>'sourceText',
        v_requirement->>'sourceTextSha256', (v_requirement->>'sourceOrdinal')::integer
      );
    end loop;
  else
    select id into v_snapshot_id from public.job_snapshots
    where owner_user_id = v_owner and semantic_key = p_semantic_key;
    if not exists (
      select 1 from public.job_snapshots
      where id = v_snapshot_id and owner_user_id = v_owner
        and role_title = p_role_title
        and coalesce(company, '') = coalesce(nullif(btrim(p_company), ''), '')
        and raw_description_sha256 = p_raw_description_sha256
        and analyzer_version = p_analyzer_version
    ) then
      raise exception 'JOB_SNAPSHOT_SEMANTIC_COLLISION' using errcode = '23514';
    end if;
  end if;

  snapshot_id := v_snapshot_id;
  created := v_created;
  return next;
end;
$$;

revoke all on function public.cv_engine_create_job_snapshot(text,text,text,text,text,text,jsonb) from public;
grant execute on function public.cv_engine_create_job_snapshot(text,text,text,text,text,text,jsonb) to authenticated;

commit;
