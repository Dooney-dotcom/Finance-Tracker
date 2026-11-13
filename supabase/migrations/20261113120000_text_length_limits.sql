-- Text limits as data invariants, not just API or browser checks (#11).
-- The btrim() checks measured the trimmed value, so padded text passed at any size; cap the raw length too.
-- Existing rows were checked before writing this: all well inside the limits.
alter table public.plans
  add constraint plans_description_len check (char_length(description) <= 200),
  add constraint plans_notes_len check (char_length(notes) <= 2000);

alter table public.categories      add constraint categories_name_len      check (char_length(name) <= 50);
alter table public.payment_methods add constraint payment_methods_name_len check (char_length(name) <= 50);
alter table public.wealth_accounts add constraint wealth_accounts_name_len check (char_length(name) <= 50);

-- transactions can also be written through the Data API, which never runs RecordsController.validate().
alter table public.transactions
  add constraint transactions_description_len check (char_length(description) <= 200),
  add constraint transactions_notes_len check (char_length(notes) <= 2000);
