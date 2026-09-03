begin;

create or replace function public.cv_engine_p1_quantitative_tokens(p_value text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    array_agg(
      distinct regexp_replace(lower(m[1]), '[,[:space:]]+', '', 'g')
      order by regexp_replace(lower(m[1]), '[,[:space:]]+', '', 'g')
    ),
    '{}'::text[]
  )
  from regexp_matches(
    coalesce(p_value, ''),
    '([$€£]?[[:space:]]*[0-9]+[0-9.,]*[[:space:]]*%?)',
    'g'
  ) as m;
$$;

commit;
