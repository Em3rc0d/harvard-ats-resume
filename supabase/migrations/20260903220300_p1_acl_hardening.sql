begin;

-- Internal P1 helpers and trigger functions are implementation details, not RPC surface.
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default, so revoke explicitly
-- after the final CREATE OR REPLACE definitions in this migration sequence.
revoke all on function public.cv_engine_p1_normalize(text) from public, anon, authenticated;
revoke all on function public.cv_engine_p1_quantitative_tokens(text) from public, anon, authenticated;
revoke all on function public.cv_engine_p1_has_term(text,text) from public, anon, authenticated;
revoke all on function public.cv_engine_p1_reject_immutable_change() from public, anon, authenticated;
revoke all on function public.cv_engine_p1_guard_revision_update() from public, anon, authenticated;

-- Reassert the only deliberate authenticated P1 mutation surface.
revoke all on function public.cv_engine_create_presentation_plan(text,uuid,uuid,uuid,jsonb,jsonb,jsonb,text) from public, anon;
revoke all on function public.cv_engine_create_presentation_revision(uuid,text,jsonb,text,text[],text) from public, anon;
revoke all on function public.cv_engine_approve_presentation_revision(uuid) from public, anon;

grant execute on function public.cv_engine_create_presentation_plan(text,uuid,uuid,uuid,jsonb,jsonb,jsonb,text) to authenticated;
grant execute on function public.cv_engine_create_presentation_revision(uuid,text,jsonb,text,text[],text) to authenticated;
grant execute on function public.cv_engine_approve_presentation_revision(uuid) to authenticated;

commit;
