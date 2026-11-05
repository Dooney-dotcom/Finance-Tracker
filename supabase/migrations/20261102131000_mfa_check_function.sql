-- `authenticated` cannot read auth.mfa_factors, so the 2FA check moves into a
-- SECURITY DEFINER function in a schema the Data API does not expose.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.aal_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors
        where user_id = auth.uid() and status = 'verified'
      );
$$;

revoke execute on function private.aal_satisfied() from public, anon;
grant execute on function private.aal_satisfied() to authenticated;

drop policy require_mfa on public.transactions;
drop policy require_mfa on public.categories;
drop policy require_mfa on public.payment_methods;

create policy require_mfa on public.transactions as restrictive for all to authenticated
  using ((select private.aal_satisfied()));
create policy require_mfa on public.categories as restrictive for all to authenticated
  using ((select private.aal_satisfied()));
create policy require_mfa on public.payment_methods as restrictive for all to authenticated
  using ((select private.aal_satisfied()));
