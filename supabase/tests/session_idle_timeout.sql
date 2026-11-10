-- Idle-timeout checks. Run against a database with the migrations applied, e.g. local Supabase:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/session_idle_timeout.sql
-- Everything runs in one transaction and is rolled back. A negative idle interval
-- stands in for "time passed", since now() is fixed inside a transaction.
begin;

create function pg_temp.as_session(sid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated', 'aal', 'aal1', 'session_id', sid)::text, true);
$$;

set local role authenticated;

do $$
declare
  live uuid := gen_random_uuid();
  idle uuid := gen_random_uuid();
begin
  -- Valid session: the first request opens it, and later ones keep it alive.
  perform pg_temp.as_session(live);
  assert private.touch_session('30 minutes'), 'new session is accepted';
  assert private.session_active(), 'new session is active';
  assert private.touch_session('30 minutes'), 'active session is extended';

  -- Idle session: its deadline has passed, so it's refused and stays refused.
  perform pg_temp.as_session(idle);
  assert private.touch_session('-1 second'), 'setup: session whose deadline already passed';
  assert not private.session_active(), 'idle session is not active';
  assert not private.touch_session('30 minutes'), 'idle session cannot be revived';
  assert not private.session_active(), 'idle session stays inactive';

  -- Expired sessions can't reach the data, even bypassing the API.
  begin
    insert into public.categories (user_id, name, kind) values ('00000000-0000-0000-0000-00000000000a', 'x', 'expense');
    assert false, 'idle session wrote a row';
  exception when insufficient_privilege then null; -- RLS refused it
  end;
  assert (select count(*) from public.transactions) = 0, 'idle session reads nothing';

  -- A token without a session_id is never accepted.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  assert not private.touch_session('30 minutes'), 'token without session_id is refused';
  assert not private.session_active(), 'token without session_id is inactive';

  raise notice 'session idle timeout: all checks passed';
end $$;

rollback;
