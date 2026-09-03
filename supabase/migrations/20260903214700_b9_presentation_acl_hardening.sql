begin;

-- PostgreSQL grants EXECUTE on newly created functions to PUBLIC by default.
-- B9 trigger helpers are internal implementation details and must not expand
-- CV Engine's callable surface for anon/authenticated roles.
revoke all on function public.cv_engine_guard_presentation_revision_update()
  from public, anon, authenticated;

commit;
