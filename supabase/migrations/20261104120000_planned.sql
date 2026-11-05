-- Planned expenses: a rule (once, monthly, quarterly, annual) that the app expands into dated occurrences.
-- A plan is a promise, not spending: only the transaction it gets linked to counts anywhere.

create table public.plans (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  description       text not null check (char_length(btrim(description)) between 1 and 200),
  amount            numeric(12, 2) not null check (amount >= 0),
  category_id       uuid,
  payment_method_id uuid,
  first_due         date not null,
  frequency         text not null check (frequency in ('Once', 'Monthly', 'Quarterly', 'Annual')),
  last_due          date check (last_due is null or last_due >= first_due),
  notes             text,
  created_at        timestamptz not null default now(),
  unique (id, user_id),
  -- Same rule as transactions: a plan can't point at another user's list entries, and an entry in use can't be deleted.
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict,
  foreign key (payment_method_id, user_id) references public.payment_methods (id, user_id) on delete restrict
);

-- Lets an occurrence reference a transaction only of the same user.
alter table public.transactions add constraint transactions_id_user_key unique (id, user_id);

-- Only the occurrences that differ from the rule: paid (linked), skipped, or a changed amount.
create table public.plan_occurrences (
  plan_id        uuid not null,
  due            date not null,
  user_id        uuid not null default auth.uid(),
  transaction_id uuid unique,
  skipped        boolean not null default false,
  amount         numeric(12, 2) check (amount >= 0),
  primary key (plan_id, due),
  foreign key (plan_id, user_id) references public.plans (id, user_id) on delete cascade,
  -- Deleting the record makes the occurrence unpaid again, rather than deleting the occurrence.
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete set null (transaction_id)
);

create index plans_user_idx on public.plans (user_id);
create index plans_category_idx on public.plans (category_id);
create index plans_payment_method_idx on public.plans (payment_method_id);
create index plan_occurrences_user_idx on public.plan_occurrences (user_id);

alter table public.plans enable row level security;
alter table public.plan_occurrences enable row level security;
revoke all on public.plans, public.plan_occurrences from anon;

create policy own_rows on public.plans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.plan_occurrences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy require_mfa on public.plans as restrictive for all to authenticated
  using ((select private.aal_satisfied()));
create policy require_mfa on public.plan_occurrences as restrictive for all to authenticated
  using ((select private.aal_satisfied()));
