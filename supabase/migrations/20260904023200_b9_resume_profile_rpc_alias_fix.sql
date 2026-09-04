begin;

-- B9.6 hardening: RETURNS TABLE exposes revision_number as a PL/pgSQL output
-- variable, so every table reference to the same name must be qualified.
create or replace function public.cv_engine_upsert_resume_profile(
  p_display_name text,
  p_headline text,
  p_location text,
  p_email text,
  p_phone text,
  p_links text[]
)
returns table (revision_number integer, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_headline text := nullif(btrim(coalesce(p_headline, '')), '');
  v_location text := nullif(btrim(coalesce(p_location, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_links text[] := coalesce(p_links, array[]::text[]);
  v_links_json jsonb;
  v_semantic text;
  v_current integer;
  v_current_semantic text;
  v_next integer;
  v_link text;
begin
  if v_owner is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if length(v_display_name) not between 1 and 120 then raise exception 'B9_RESUME_PROFILE_DISPLAY_NAME_INVALID' using errcode = '22023'; end if;
  if v_headline is not null and length(v_headline) > 200 then raise exception 'B9_RESUME_PROFILE_HEADLINE_INVALID' using errcode = '22023'; end if;
  if v_location is not null and length(v_location) > 160 then raise exception 'B9_RESUME_PROFILE_LOCATION_INVALID' using errcode = '22023'; end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'B9_RESUME_PROFILE_EMAIL_INVALID' using errcode = '22023';
  end if;
  if v_phone is not null and length(v_phone) > 80 then raise exception 'B9_RESUME_PROFILE_PHONE_INVALID' using errcode = '22023'; end if;
  if cardinality(v_links) > 6 then raise exception 'B9_RESUME_PROFILE_LINK_LIMIT' using errcode = '22023'; end if;

  for v_link in select btrim(link_value) from unnest(v_links) as links(link_value) loop
    if length(v_link) not between 1 and 500 or v_link !~ '^https?://[^[:space:]]+$' then
      raise exception 'B9_RESUME_PROFILE_LINK_INVALID' using errcode = '22023';
    end if;
  end loop;

  select coalesce(jsonb_agg(btrim(link_value) order by link_ordinal), '[]'::jsonb)
  into v_links_json
  from unnest(v_links) with ordinality as links(link_value, link_ordinal);

  v_semantic := public.cv_engine_sha256(
    v_display_name || chr(31) || coalesce(v_headline, '') || chr(31) || coalesce(v_location, '') || chr(31)
    || coalesce(v_email, '') || chr(31) || coalesce(v_phone, '') || chr(31) || v_links_json::text
  );

  perform pg_advisory_xact_lock(hashtextextended('b9-resume-profile:' || v_owner::text, 0));

  insert into public.resume_profiles(owner_user_id) values (v_owner)
  on conflict (owner_user_id) do nothing;

  select profile.current_revision
  into v_current
  from public.resume_profiles as profile
  where profile.owner_user_id = v_owner;

  if v_current > 0 then
    select revision.semantic_sha256
    into v_current_semantic
    from public.resume_profile_revisions as revision
    where revision.owner_user_id = v_owner
      and revision.revision_number = v_current;

    if v_current_semantic = v_semantic then
      revision_number := v_current;
      created := false;
      return next;
      return;
    end if;
  end if;

  v_next := v_current + 1;
  insert into public.resume_profile_revisions(
    owner_user_id, revision_number, display_name, headline, location, email, phone, links_json, semantic_sha256
  ) values (
    v_owner, v_next, v_display_name, v_headline, v_location, v_email, v_phone, v_links_json, v_semantic
  );

  update public.resume_profiles as profile
  set current_revision = v_next, updated_at = now()
  where profile.owner_user_id = v_owner;

  revision_number := v_next;
  created := true;
  return next;
end;
$$;

revoke all on function public.cv_engine_upsert_resume_profile(text,text,text,text,text,text[]) from public, anon, authenticated;
grant execute on function public.cv_engine_upsert_resume_profile(text,text,text,text,text,text[]) to authenticated;

commit;
