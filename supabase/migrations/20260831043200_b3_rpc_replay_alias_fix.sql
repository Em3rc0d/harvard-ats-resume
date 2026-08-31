begin;

-- B3 is still pre-release. Repair the PL/pgSQL replay lookup without widening
-- plpgsql.variable_conflict globally or weakening any permission boundary.
-- The migration fails closed if the expected source fragment is not present.
do $b3_fix$
declare
  v_definition text;
  v_fixed text;
begin
  select pg_get_functiondef('public.cv_engine_create_opportunity_assessment(uuid)'::regprocedure)
    into v_definition;

  v_fixed := replace(
    v_definition,
    'where owner_user_id = v_owner and match_report_id = v_report_id;',
    'where public.opportunity_assessments.owner_user_id = v_owner and public.opportunity_assessments.match_report_id = v_report_id;'
  );

  if v_fixed = v_definition then
    raise exception 'B3_RPC_REPLAY_ALIAS_FIX_PATTERN_NOT_FOUND';
  end if;

  execute v_fixed;
end
$b3_fix$;

commit;
