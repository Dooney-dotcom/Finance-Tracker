-- Wealth: where the money sits. One balance per account per month, entered by hand.
-- Separate from transactions on purpose: nothing here is derived from or counted in records.

create table public.wealth_accounts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name               text not null check (char_length(btrim(name)) between 1 and 50),
  institution        text check (char_length(institution) <= 50),
  purpose            text not null check (purpose in ('Everyday', 'Emergency fund', 'Savings', 'Long-term investing', 'Retirement')),
  asset_class        text not null check (asset_class in ('Cash', 'Deposit', 'Bonds', 'Equities', 'Mixed', 'Insurance policy', 'Pension fund')),
  color              text not null check (color ~ '^#[0-9a-f]{6}$'),
  -- Empty = the money can be withdrawn any time (svincolato).
  locked_until       date,
  -- First month a balance is expected, and the first month it no longer is.
  opened             date not null check (extract(day from opened) = 1),
  closed             date check (closed is null or (extract(day from closed) = 1 and closed > opened)),
  -- Money put in before tracking started. Null = not known, so no gain can be shown.
  contributed_before numeric(14, 2),
  -- Optional goal for this account (e.g. the emergency fund).
  target             numeric(14, 2) check (target > 0),
  notes              text check (char_length(notes) <= 2000),
  sort               integer not null default 0,
  created_at         timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table public.wealth_balances (
  account_id  uuid not null,
  month       date not null check (extract(day from month) = 1),
  user_id     uuid not null default auth.uid(),
  value       numeric(14, 2) not null,
  -- Net money put in since the previous check-in (negative = taken out). Null = not recorded.
  contributed numeric(14, 2),
  primary key (account_id, month),
  foreign key (account_id, user_id) references public.wealth_accounts (id, user_id) on delete cascade
);

create index wealth_balances_user_idx on public.wealth_balances (user_id, month);

alter table public.wealth_accounts enable row level security;
alter table public.wealth_balances enable row level security;
revoke all on public.wealth_accounts, public.wealth_balances from anon;

create policy own_rows on public.wealth_accounts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.wealth_balances for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy require_mfa on public.wealth_accounts as restrictive for all to authenticated
  using ((select private.aal_satisfied()));
create policy require_mfa on public.wealth_balances as restrictive for all to authenticated
  using ((select private.aal_satisfied()));
