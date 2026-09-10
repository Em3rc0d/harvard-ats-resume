begin;

create index import_review_structures_receipt_owner_fk_idx
  on public.import_review_structures(receipt_id, owner_user_id);

commit;
