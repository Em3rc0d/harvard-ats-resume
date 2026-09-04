begin;

-- Planner v3 must persist the exact editorial policy that selected/omitted
-- evidence. Historical v1/v2 plans retain the original one-page policy.
alter table public.resume_plans
  drop constraint resume_plans_density_policy_check;

alter table public.resume_plans
  add constraint resume_plans_density_policy_check
  check (
    (
      planner_version in (
        'b9-deterministic-resume-plan-v1',
        'b9-deterministic-resume-plan-v2'
      )
      and density_policy = '{"policyVersion":"b9-one-page-density-v1","targetPages":1,"maxItems":20}'::jsonb
    )
    or
    (
      planner_version = 'b9-deterministic-resume-plan-v3'
      and density_policy = '{"policyVersion":"b9-balanced-one-page-density-v2","targetPages":1,"maxItems":20,"sectionBudgets":{"PROFILE":1,"EXPERIENCE":4,"PROJECTS":5,"EDUCATION":2,"CERTIFICATIONS":3,"SKILLS":4,"LANGUAGES":1}}'::jsonb
    )
  );

create or replace function public.cv_engine_apply_resume_plan_density_policy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.planner_version = 'b9-deterministic-resume-plan-v3' then
    new.density_policy := '{"policyVersion":"b9-balanced-one-page-density-v2","targetPages":1,"maxItems":20,"sectionBudgets":{"PROFILE":1,"EXPERIENCE":4,"PROJECTS":5,"EDUCATION":2,"CERTIFICATIONS":3,"SKILLS":4,"LANGUAGES":1}}'::jsonb;
  end if;
  return new;
end;
$$;

create trigger resume_plans_apply_density_policy
before insert on public.resume_plans
for each row execute function public.cv_engine_apply_resume_plan_density_policy();

revoke all on function public.cv_engine_apply_resume_plan_density_policy() from public, anon, authenticated;

commit;
