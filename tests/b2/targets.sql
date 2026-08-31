\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';

select target_id from public.cv_engine_save_career_target(repeat('a',64),'Backend Engineer','Software Engineering',array['MID','SENIOR'],array['Lima'],array['REMOTE'],array['FULL_TIME'],array['Fintech'],'OPEN','PRIMARY',true);
select target_id from public.cv_engine_save_career_target(repeat('b',64),'Security Engineer','Cybersecurity',array['MID'],array['Lima'],array['HYBRID'],array['FULL_TIME'],array['Technology'],'NO','SECONDARY',true);
select target_id from public.cv_engine_save_career_target(repeat('a',64),'Backend Engineer','Software Engineering',array['MID','SENIOR'],array['Lima'],array['REMOTE'],array['FULL_TIME'],array['Fintech'],'OPEN','PRIMARY',false);

do $$ declare n integer; a integer; r text; begin
  select count(*),count(*) filter(where is_active),max(target_role) filter(where is_active) into n,a,r from public.career_targets;
  if n<>2 or a<>1 or r<>'Security Engineer' then raise exception 'B2_TARGET_PORTFOLIO_FAILED'; end if;
end $$;

select target_id from public.cv_engine_activate_career_target((select id from public.career_targets where semantic_key=repeat('a',64)));
do $$ declare n integer; a integer; r text; begin
  select count(*),count(*) filter(where is_active),max(target_role) filter(where is_active) into n,a,r from public.career_targets;
  if n<>2 or a<>1 or r<>'Backend Engineer' then raise exception 'B2_TARGET_ACTIVATION_FAILED'; end if;
end $$;

do $$ begin
  begin
    insert into public.career_targets(owner_user_id,semantic_key,target_role,relocation_preference,priority) values(auth.uid(),repeat('c',64),'Forbidden','NO','PRIMARY');
    raise exception 'B2_DIRECT_TARGET_INSERT_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
