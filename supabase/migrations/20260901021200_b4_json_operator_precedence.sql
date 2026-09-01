begin;

do $$
declare
  v_def text;
  v_fixed text;
  v_old text := 'item->>''evidenceId'' || chr(31) || item->>''evidenceRevision'' || chr(31) || item->>''evidenceTextSha256''';
  v_new text := '(item->>''evidenceId'') || chr(31) || (item->>''evidenceRevision'') || chr(31) || (item->>''evidenceTextSha256'')';
begin
  select pg_get_functiondef('public.cv_engine_create_resume_version(text,uuid)'::regprocedure) into v_def;
  if strpos(v_def, v_old) = 0 then
    raise exception 'B4_JSON_OPERATOR_PRECEDENCE_EXPECTED_PATTERN_MISSING';
  end if;
  v_fixed := replace(v_def, v_old, v_new);
  execute v_fixed;
end $$;

commit;
