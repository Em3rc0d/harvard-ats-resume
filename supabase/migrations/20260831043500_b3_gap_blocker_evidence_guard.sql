begin;

alter table public.requirement_matches
  drop constraint requirement_matches_support_state;

alter table public.requirement_matches
  add constraint requirement_matches_support_state check (
    (
      status in ('MATCH','POTENTIAL_MATCH','GAP','BLOCKER')
      and cardinality(supporting_evidence_ids) > 0
      and jsonb_array_length(supporting_evidence_snapshot) > 0
    )
    or (
      status = 'UNKNOWN'
      and cardinality(supporting_evidence_ids) = 0
      and jsonb_array_length(supporting_evidence_snapshot) = 0
    )
  );

commit;
