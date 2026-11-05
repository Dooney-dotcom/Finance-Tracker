-- 1. Login role for the Spring API.
--    It holds no table privileges of its own (NOINHERIT): every request must
--    `set local role authenticated` with the caller's verified JWT claims, so RLS
--    applies exactly as for any signed-in user. Forgetting that fails closed.
--    The password is set out of band as a SCRAM verifier, never committed.
create role finance_api with login noinherit nobypassrls nocreatedb nocreaterole;
grant authenticated to finance_api;
alter role finance_api set statement_timeout = '10s';

-- 2. 2FA: once a user has a verified authenticator factor, every request must
--    carry an aal2 token. Restrictive, so it is AND-ed with the ownership policies.
create policy require_mfa on public.transactions as restrictive for all to authenticated
  using (
    array[(select auth.jwt()) ->> 'aal'] <@ (
      select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
      from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
  );
create policy require_mfa on public.categories as restrictive for all to authenticated
  using (
    array[(select auth.jwt()) ->> 'aal'] <@ (
      select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
      from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
  );
create policy require_mfa on public.payment_methods as restrictive for all to authenticated
  using (
    array[(select auth.jwt()) ->> 'aal'] <@ (
      select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
      from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
  );
