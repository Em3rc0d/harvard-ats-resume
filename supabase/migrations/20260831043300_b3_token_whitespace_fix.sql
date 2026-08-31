begin;

-- Use POSIX character classes instead of backslash escapes so whitespace
-- normalization/splitting behaves identically under PostgreSQL string rules.
create or replace function public.cv_engine_b3_normalize(p_value text)
returns text
language sql
immutable
parallel safe
return lower(regexp_replace(
  regexp_replace(btrim(coalesce(p_value, '')), '[^[:alnum:]+#./-]+', ' ', 'g'),
  '[[:space:]]+',
  ' ',
  'g'
));

create or replace function public.cv_engine_b3_tokens(p_value text)
returns text[]
language sql
immutable
parallel safe
as $$
  select coalesce(array_agg(distinct token order by token), '{}'::text[])
  from regexp_split_to_table(public.cv_engine_b3_normalize(p_value), '[[:space:]]+') as token
  where char_length(token) >= 2
    and token <> all(array[
      'and','the','for','with','from','that','this','your','you','our','are','will','have','has','must','required','preferred','minimum','at','least','experience','years','year','work','role','ability','skills','skill','is','a','an','of','to','in','on','or',
      'con','para','los','las','una','uno','que','del','por','debe','requerido','requerida','preferido','preferida','experiencia','anos','trabajo','habilidad','habilidades','minimo'
    ]::text[]);
$$;

revoke all on function public.cv_engine_b3_normalize(text) from public;
revoke all on function public.cv_engine_b3_tokens(text) from public;

commit;
