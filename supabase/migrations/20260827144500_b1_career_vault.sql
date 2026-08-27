begin;

create extension if not exists pgcrypto;

create table public.career_vaults (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint career_vaults_one_per_owner unique (owner_user_id),
  constraint career_vaults_identity_owner unique (id, owner_user_id)
);

create table public.career_evidence (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null,
  owner_user_id uuid not null,
  kind text not null check (kind in (
    'EMPLOYMENT', 'PROJECT', 'ACHIEVEMENT', 'EDUCATION',
    'CERTIFICATION', 'SKILL', 'LANGUAGE', 'METRIC'
  )),
  source text not null check (source in (
    'MANUAL', 'IMPORTED_RESUME', 'IMPORTED_CERTIFICATE',
    'USER_CONFIRMED', 'SYSTEM_DERIVED_DETERMINISTIC'
  )),
  current_revision integer not null default 1 check (current_revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint career_evidence_vault_owner_fk
    foreign key (vault_id, owner_user_id)
    references public.career_vaults(id, owner_user_id)
    on delete cascade,
  constraint career_evidence_identity_owner unique (id, owner_user_id)
);

create table public.career_evidence_revisions (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null,
  owner_user_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  verification_status text not null check (verification_status in (
    'UNVERIFIED', 'NEEDS_REVIEW', 'VERIFIED'
  )),
  canonical_text text not null check (
    char_length(btrim(canonical_text)) between 1 and 10000
  ),
  source_document_id uuid,
  created_at timestamptz not null default now(),
  constraint career_evidence_revisions_owner_fk
    foreign key (evidence_id, owner_user_id)
    references public.career_evidence(id, owner_user_id)
    on delete cascade,
  constraint career_evidence_revision_unique unique (evidence_id, revision_number),
  constraint career_evidence_revision_identity unique (evidence_id, revision_number, owner_user_id)
);

alter table public.career_evidence
  add constraint career_evidence_current_revision_fk
  foreign key (id, current_revision, owner_user_id)
  references public.career_evidence_revisions(evidence_id, revision_number, owner_user_id)
  deferrable initially deferred;

create table public.consent_receipts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  disclosure_version text not null check (char_length(disclosure_version) between 1 and 128),
  acknowledged_at timestamptz not null,
  ai_access_mode_preference text check (ai_access_mode_preference in (
    'PLATFORM_GEMINI', 'BYOK_GEMINI', 'NO_CLOUD_AI'
  )),
  created_at timestamptz not null default now(),
  constraint consent_receipts_version_unique unique (owner_user_id, disclosure_version)
);

create index career_evidence_owner_idx
  on public.career_evidence(owner_user_id, updated_at desc);
create index career_evidence_vault_idx
  on public.career_evidence(vault_id, updated_at desc);
create index career_evidence_revisions_lookup_idx
  on public.career_evidence_revisions(evidence_id, revision_number desc);
create index consent_receipts_owner_idx
  on public.consent_receipts(owner_user_id, acknowledged_at desc);

create or replace function public.cv_engine_reject_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'OWNER_USER_ID_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger career_vaults_owner_immutable
before update on public.career_vaults
for each row execute function public.cv_engine_reject_owner_change();

create trigger career_evidence_owner_immutable
before update on public.career_evidence
for each row execute function public.cv_engine_reject_owner_change();

create trigger consent_receipts_owner_immutable
before update on public.consent_receipts
for each row execute function public.cv_engine_reject_owner_change();

alter table public.career_vaults enable row level security;
alter table public.career_evidence enable row level security;
alter table public.career_evidence_revisions enable row level security;
alter table public.consent_receipts enable row level security;

create policy "career_vaults_select_own"
on public.career_vaults for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy "career_vaults_insert_own"
on public.career_vaults for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy "career_vaults_update_own"
on public.career_vaults for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy "career_vaults_delete_own"
on public.career_vaults for delete to authenticated
using ((select auth.uid()) = owner_user_id);

create policy "career_evidence_select_own"
on public.career_evidence for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy "career_evidence_insert_own"
on public.career_evidence for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy "career_evidence_update_own"
on public.career_evidence for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy "career_evidence_delete_own"
on public.career_evidence for delete to authenticated
using ((select auth.uid()) = owner_user_id);

create policy "career_evidence_revisions_select_own"
on public.career_evidence_revisions for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy "career_evidence_revisions_insert_own"
on public.career_evidence_revisions for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy "consent_receipts_select_own"
on public.consent_receipts for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy "consent_receipts_insert_own"
on public.consent_receipts for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

revoke all on public.career_vaults from anon;
revoke all on public.career_evidence from anon;
revoke all on public.career_evidence_revisions from anon;
revoke all on public.consent_receipts from anon;

grant select, insert, update, delete on public.career_vaults to authenticated;
grant select, insert, update, delete on public.career_evidence to authenticated;
grant select, insert on public.career_evidence_revisions to authenticated;
grant select, insert on public.consent_receipts to authenticated;

commit;
