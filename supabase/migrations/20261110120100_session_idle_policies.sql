-- Apply only after the API that calls private.touch_session is deployed: until then
-- no session has an activity row, so these policies would block every request.
-- Restrictive, so an idle or unknown session reads and writes nothing, even
-- through the Data API with a still-valid token.
do $$
declare t text;
begin
  foreach t in array array['transactions', 'categories', 'payment_methods', 'plans', 'plan_occurrences', 'wealth_accounts', 'wealth_balances'] loop
    execute format('create policy session_active on public.%I as restrictive for all to authenticated using ((select private.session_active()))', t);
  end loop;
end $$;
