begin;

-- PostgreSQL grants EXECUTE on newly-created functions to PUBLIC by default.
-- These are trigger-only B9 implementation details, not callable API surface.
revoke all on function public.cv_engine_reject_b9_resume_plan_update() from public, anon, authenticated;
revoke all on function public.cv_engine_guard_resume_plan_item_insert() from public, anon, authenticated;

commit;
