-- Multi-tenancy, per-user categories and payment methods, timestamp fix.
-- Runs as one transaction: any failed check aborts everything.
-- Replace owner@example.com with the owner's email before running this on a new project.

-- 0. Owner account: every existing row belongs to it.
do $$
begin
  if (select count(*) from auth.users where email = 'owner@example.com') <> 1 then
    raise exception 'Owner user not found in auth.users; create it first';
  end if;
end $$;

-- 1. Remove a payment Revolut reports as cancelled.
do $$
declare n int;
begin
  delete from public.transactions where id = '73f343fd-abee-42bc-8bdb-0dc58fb66900';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Expected to delete 1 cancelled row, deleted %', n; end if;
end $$;

-- 2. Stored times are Italian wall-clock time labelled UTC. Reinterpret as Europe/Rome.
--    `month` is the user's own assignment and is left untouched.
update public.transactions
set date = (date at time zone 'UTC') at time zone 'Europe/Rome'
where date is not null;

-- 3. Per-user lists. unique (id, user_id) lets transactions reference them with a
--    composite FK, so a row can never point at another user's category.
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 50),
  kind       text not null check (kind in ('expense', 'income')),
  created_at timestamptz not null default now(),
  unique (user_id, kind, name),
  unique (id, user_id)
);

create table public.payment_methods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 50),
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

-- Seed the owner's lists from the old enums.
insert into public.categories (user_id, name, kind)
select (select id from auth.users where email = 'owner@example.com'), e.enumlabel, 'expense'
from pg_enum e
where e.enumtypid = 'public.expense_category'::regtype;

-- Income list starts empty except for what existing income rows already use
-- (3 refund rows tagged Transport), so no data is lost.
insert into public.categories (user_id, name, kind)
select distinct (select id from auth.users where email = 'owner@example.com'), t.category::text, 'income'
from public.transactions t
where t.type = 'Income' and t.category is not null;

insert into public.payment_methods (user_id, name)
select (select id from auth.users where email = 'owner@example.com'), e.enumlabel
from pg_enum e
where e.enumtypid = 'public.payment_method'::regtype;

-- 4. Transactions: owner column + references to the per-user lists.
alter table public.transactions
  add column user_id uuid,
  add column category_id uuid,
  add column payment_method_id uuid;

update public.transactions set user_id = (select id from auth.users where email = 'owner@example.com');

update public.transactions t
set category_id = c.id
from public.categories c
where c.user_id = t.user_id
  and c.name = t.category::text
  and c.kind = case t.type when 'Income' then 'income' else 'expense' end;

update public.transactions t
set payment_method_id = p.id
from public.payment_methods p
where p.user_id = t.user_id and p.name = t.payment_method::text;

do $$
begin
  if exists (select 1 from public.transactions
             where (category is not null and category_id is null)
                or (payment_method is not null and payment_method_id is null)) then
    raise exception 'Backfill left unmapped categories or payment methods';
  end if;
end $$;

alter table public.transactions
  drop constraint transactions_no_duplicates,
  drop constraint transactions_notion_id_key,
  drop column category,
  drop column payment_method;

drop type public.expense_category;
drop type public.payment_method;

alter table public.transactions
  alter column user_id set not null,
  alter column user_id set default auth.uid(),
  add constraint transactions_user_fk
    foreign key (user_id) references auth.users (id) on delete cascade,
  -- Deleting a category or payment method that is in use is refused, never orphaned.
  add constraint transactions_category_fk
    foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict,
  add constraint transactions_payment_method_fk
    foreign key (payment_method_id, user_id) references public.payment_methods (id, user_id) on delete restrict,
  add constraint transactions_no_duplicates
    unique (user_id, payment_method_id, type, date, amount, description),
  add constraint transactions_notion_id_key unique (user_id, notion_id);

create index transactions_user_month_idx on public.transactions (user_id, month);
create index transactions_user_date_idx  on public.transactions (user_id, date);
create index transactions_category_idx   on public.transactions (category_id);
create index transactions_payment_method_idx on public.transactions (payment_method_id);

-- 5. Row Level Security: each user sees and changes only their own rows.
--    anon gets nothing; (select auth.uid()) is evaluated once per statement.
alter table public.categories      enable row level security;
alter table public.payment_methods enable row level security;
-- transactions already has RLS enabled.

revoke all on public.transactions, public.categories, public.payment_methods from anon;

create policy own_rows on public.transactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.categories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.payment_methods for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
