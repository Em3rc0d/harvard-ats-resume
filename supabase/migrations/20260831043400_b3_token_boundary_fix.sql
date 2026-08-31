begin;

-- Preserve punctuation that can be semantically meaningful inside technical
-- tokens (.NET, Node.js, CI/CD, client-server), but remove sentence punctuation
-- at the token boundary before stop-word filtering.
create or replace function public.cv_engine_b3_tokens(p_value text)
returns text[]
language sql
immutable
parallel safe
as $$
  with raw_tokens as (
    select token
    from regexp_split_to_table(public.cv_engine_b3_normalize(p_value), '[[:space:]]+') as token
  ), cleaned_tokens as (
    select regexp_replace(token, '[./-]+$', '', 'g') as token
    from raw_tokens
  )
  select coalesce(array_agg(distinct token order by token), '{}'::text[])
  from cleaned_tokens
  where char_length(token) >= 2
    and token <> all(array[
      'and','the','for','with','from','that','this','your','you','our','are','will','have','has','must','required','preferred','minimum','at','least','experience','years','year','work','role','ability','skills','skill','is','a','an','of','to','in','on','or',
      'con','para','los','las','una','uno','que','del','por','debe','requerido','requerida','preferido','preferida','experiencia','anos','trabajo','habilidad','habilidades','minimo'
    ]::text[]);
$$;

revoke all on function public.cv_engine_b3_tokens(text) from public;

commit;
