create table if not exists public.consent_receipts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  disclosure_version text not null,
  acknowledged_at timestamptz not null default now(),
  ai_access_mode_preference text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consent_receipts_mode_check check (
    ai_access_mode_preference is null
    or ai_access_mode_preference in ('PLATFORM_GEMINI', 'BYOK_GEMINI', 'NO_CLOUD_AI')
  ),
  constraint consent_receipts_user_version_unique unique (owner_user_id, disclosure_version)
);

alter table public.consent_receipts enable row level security;

create policy "consent_receipts_select_own"
on public.consent_receipts
for select
using (auth.uid() = owner_user_id);

create policy "consent_receipts_insert_own"
on public.consent_receipts
for insert
with check (auth.uid() = owner_user_id);

create policy "consent_receipts_update_own"
on public.consent_receipts
for update
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

revoke all on table public.consent_receipts from anon;
grant select, insert, update on table public.consent_receipts to authenticated;

comment on table public.consent_receipts is
  'Versioned acknowledgement metadata. Never stores BYOK credentials or career content.';
