begin;

create policy "consent_receipts_update_own"
on public.consent_receipts for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

grant update on public.consent_receipts to authenticated;

drop function if exists public.cv_engine_acknowledge_consent(text, timestamptz);

create or replace function public.cv_engine_acknowledge_consent(
  p_disclosure_version text,
  p_acknowledged_at timestamptz,
  p_ai_access_mode_preference text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_receipt_id uuid;
begin
  if v_owner is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if p_ai_access_mode_preference is not null
     and p_ai_access_mode_preference not in ('PLATFORM_GEMINI', 'BYOK_GEMINI', 'NO_CLOUD_AI') then
    raise exception 'INVALID_AI_ACCESS_MODE' using errcode = '22023';
  end if;

  insert into public.consent_receipts (
    owner_user_id,
    disclosure_version,
    acknowledged_at,
    ai_access_mode_preference
  ) values (
    v_owner,
    p_disclosure_version,
    p_acknowledged_at,
    p_ai_access_mode_preference
  )
  on conflict (owner_user_id, disclosure_version) do update
    set acknowledged_at = excluded.acknowledged_at,
        ai_access_mode_preference = coalesce(
          excluded.ai_access_mode_preference,
          public.consent_receipts.ai_access_mode_preference
        );

  select id into v_receipt_id
  from public.consent_receipts
  where owner_user_id = v_owner
    and disclosure_version = p_disclosure_version;

  if v_receipt_id is null then
    raise exception 'CONSENT_RECEIPT_READBACK_FAILED' using errcode = 'P0001';
  end if;

  return v_receipt_id;
end;
$$;

revoke all on function public.cv_engine_acknowledge_consent(text, timestamptz, text) from public;
grant execute on function public.cv_engine_acknowledge_consent(text, timestamptz, text) to authenticated;

commit;
