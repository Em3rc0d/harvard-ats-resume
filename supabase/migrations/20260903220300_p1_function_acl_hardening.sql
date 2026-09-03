begin;

revoke all on function public.cv_engine_p1_normalize(text) from public, anon;
revoke all on function public.cv_engine_p1_quantitative_tokens(text) from public, anon;
revoke all on function public.cv_engine_p1_has_term(text,text) from public, anon;
revoke all on function public.cv_engine_p1_reject_immutable_change() from public, anon;
revoke all on function public.cv_engine_p1_guard_revision_update() from public, anon;

-- These helpers are internal implementation details. Authenticated clients use only
-- the explicit P1 RPC surface; triggers/functions call helpers as object owners.

commit;
