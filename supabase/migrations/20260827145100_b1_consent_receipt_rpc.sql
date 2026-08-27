begin;

create or replace function public.cv_engine_acknowledge_consent(
  p_disclosure_version text,
  p_acknowledged_at timestamptz
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

  insert into public.consent_receipts (
    owner_user_id,
    disclosure_version,
    acknowledged_at
  ) values (
    v_owner,
    p_disclosure_version,
    p_acknowledged_at
  )
  on conflict (owner_user_id, disclosure_version) do nothing;

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

revoke all on function public.cv_engine_acknowledge_consent(text, timestamptz) from public;
grant execute on function public.cv_engine_acknowledge_consent(text, timestamptz) to authenticated;

commit;
